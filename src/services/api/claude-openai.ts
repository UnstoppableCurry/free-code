// queryModelOpenAI — destination for the MULTI_PROVIDER_NORMALIZED dispatch
// gate when getAPIProvider() === 'openai'.
//
// Phase B Slice 2: real implementation. We:
//   1. Bridge queryModel's typed inputs (Message[], SystemPrompt, Tools, …)
//      into a NormalizedRequest from adapter/normalize.ts.
//   2. Serialize to OpenAI shape via toOpenAIRequest().
//   3. POST to OPENAI_BASE_URL/v1/chat/completions, stream the SSE response.
//   4. For each chunk we run fromOpenAIStreamChunk() to obtain a
//      provider-agnostic NormalizedStreamEvent, then synthesize the
//      Anthropic-shaped BetaRawMessageStreamEvent that QueryEngine already
//      knows how to consume — wrapped in the StreamEvent envelope queryModel
//      yields today (`{ type: 'stream_event', event }`).
//   5. After the stream closes, yield a single AssistantMessage assembling
//      the accumulated content blocks. This matches what the Anthropic SDK
//      path yields at the end of its own loop (claude.ts ~2619).
//
// Error contract (mirrors withRetry.ts):
//   queryModel's caller consumes an async generator. A bare throw mid-stream
//   would surface as an unhandled rejection. So on HTTP error or fetch throw
//   we YIELD a SystemAPIErrorMessage and return — never throw.
//
// What we DO NOT do here (intentional, future cleanup):
//   - retries / backoff (withRetry.ts is Anthropic-SDK-specific; bringing it
//     here is a separate refactor — see report)
//   - usage / cost accounting (no usage in our SSE body yet)
//   - thinking / advisor / connector_text blocks (OpenAI doesn't emit them)
//   - prompt-caching breakpoint preservation (OpenAI protocol drops it; our
//     contract test b. covers the silent drop)

import type {
  BetaContentBlock,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { randomUUID } from 'crypto'
import type { Tools } from '../../Tool.js'
import type {
  AssistantMessage,
  Message,
  StreamEvent,
  SystemAPIErrorMessage,
} from '../../types/message.js'
import { toolToAPISchema } from '../../utils/api.js'
import { createSystemAPIErrorMessage } from '../../utils/messages.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import type { ThinkingConfig } from '../../utils/thinking.js'
import {
  fromOpenAIStreamChunk,
  toOpenAIRequest,
  type NormalizedContentBlock,
  type NormalizedMessage,
  type NormalizedRequest,
  type NormalizedSystemBlock,
  type NormalizedTool,
} from './adapter/normalize.js'
import {
  decideModelForRequest,
  emitBannerForDecision,
} from '../../routing/integration.js'
import {
  extractLastUserText,
  messagesContainImages,
} from '../../routing/contextExtractors.js'

// queryModel.Options is a structural superset; we only read a few fields here,
// so we keep the local type loose to avoid a circular import on claude.ts.
// `getToolPermissionContext`, `agents`, `allowedAgentTypes` are forwarded into
// toolToAPISchema so tool.prompt() can resolve its async description.
type QueryModelOptions = {
  model: string
  maxOutputTokensOverride?: number
  temperatureOverride?: number
  getToolPermissionContext?: () => Promise<unknown>
  agents?: unknown[]
  allowedAgentTypes?: string[]
  [k: string]: unknown
}

const DEFAULT_MAX_TOKENS = 8192
const DEFAULT_OPENAI_BASE = 'https://convertmodel.net'

// ---------------- helper: input bridge ----------------

/**
 * Bridge queryModel's typed inputs into a NormalizedRequest.
 *
 * Async because:
 *   (1) tool.prompt() — descriptions are model-aware and may read files /
 *       call GrowthBook. Driven through utils/api.ts:toolToAPISchema so the
 *       OpenAI path receives the same descriptions Anthropic would.
 *
 * System prompt widening:
 *   SystemPrompt = readonly string[] is widened to NormalizedSystemBlock[]
 *   so prompt-caching breakpoints survive an Anthropic-via-adapter route.
 *   OpenAI's serializer flattens this to a '\n'-joined string and silently
 *   drops cache_control — see toOpenAIRequest in adapter/normalize.ts.
 */
export async function buildNormalizedRequestFromQueryModelArgs(
  messages: Message[],
  system: SystemPrompt,
  tools: Tools,
  options: QueryModelOptions,
): Promise<NormalizedRequest> {
  const normMessages: NormalizedMessage[] = []
  for (const m of messages) {
    if (m.type !== 'user' && m.type !== 'assistant') continue
    const role = m.type
    const raw = (m as any).message?.content
    const blocks = normalizeContentBlocks(raw)
    if (blocks.length === 0) continue
    normMessages.push({ role, content: blocks })
  }

  const systemBlocks = systemPromptToBlocks(system)

  const normTools: NormalizedTool[] | undefined =
    tools.length > 0
      ? await Promise.all(tools.map((t) => toolToNormalizedAsync(t, options)))
      : undefined

  // Resolve reasoning effort the same way the Anthropic path does
  // (claude.ts:1521). For OpenAI-compat relays this becomes the wire
  // `reasoning_effort` field; for models that don't support effort tuning
  // the relay/server ignores it.
  let reasoningEffort: 'low' | 'medium' | 'high' | 'max' | undefined
  try {
    const { resolveAppliedEffort } = await import('../../utils/effort.js')
    const resolved = resolveAppliedEffort(
      options.model,
      (options as { effortValue?: unknown }).effortValue as
        | 'low'
        | 'medium'
        | 'high'
        | 'max'
        | number
        | undefined,
    )
    if (typeof resolved === 'string') {
      reasoningEffort = resolved
    }
  } catch {
    // resolveAppliedEffort depends on settings layers that may not be
    // available in every test; silent no-op keeps the live path robust.
  }

  return {
    model: options.model,
    system: systemBlocks.length > 0 ? systemBlocks : undefined,
    messages: normMessages,
    tools: normTools,
    maxTokens: options.maxOutputTokensOverride ?? DEFAULT_MAX_TOKENS,
    ...(reasoningEffort !== undefined && { reasoningEffort }),
    ...(options.temperatureOverride !== undefined && {
      temperature: options.temperatureOverride,
    }),
  }
}

/**
 * Convert SystemPrompt (readonly string[]) into NormalizedSystemBlock[].
 *
 * Cache breakpoint policy: ephemeral cache_control lands on the LAST block
 * only — matches the Anthropic SDK pattern in claude.ts (see paramsFromContext
 * around line 1538). For OpenAI this marker is dropped at serialize time.
 */
function systemPromptToBlocks(
  system: SystemPrompt,
): NormalizedSystemBlock[] {
  const filtered = (system as readonly string[]).filter(
    (s) => s && s.length > 0,
  )
  if (filtered.length === 0) return []
  return filtered.map((text, i) => {
    const block: NormalizedSystemBlock = { type: 'text', text }
    if (i === filtered.length - 1) {
      block.cache_control = { type: 'ephemeral' }
    }
    return block
  })
}

function normalizeContentBlocks(raw: unknown): NormalizedContentBlock[] {
  if (typeof raw === 'string') {
    return raw.length > 0 ? [{ type: 'text', text: raw }] : []
  }
  if (!Array.isArray(raw)) return []
  const out: NormalizedContentBlock[] = []
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue
    const t = (b as any).type
    if (t === 'text' && typeof (b as any).text === 'string') {
      out.push({ type: 'text', text: (b as any).text })
    } else if (t === 'tool_use') {
      out.push({
        type: 'tool_use',
        id: String((b as any).id),
        name: String((b as any).name),
        input: ((b as any).input ?? {}) as Record<string, unknown>,
      })
    } else if (t === 'tool_result') {
      const content = (b as any).content
      out.push({
        type: 'tool_result',
        tool_use_id: String((b as any).tool_use_id),
        content:
          typeof content === 'string' ? content : JSON.stringify(content ?? ''),
        ...(typeof (b as any).is_error === 'boolean' && {
          is_error: (b as any).is_error,
        }),
      })
    } else if (t === 'image') {
      const src = (b as any).source
      if (src?.type === 'base64' && typeof src.data === 'string') {
        out.push({
          type: 'image',
          mime: String(src.media_type ?? 'image/png'),
          base64: String(src.data),
        })
      }
    }
    // Skip thinking / redacted_thinking / connector_text / etc.
  }
  return out
}

async function toolToNormalizedAsync(
  t: Tools[number],
  options: QueryModelOptions,
): Promise<NormalizedTool> {
  // Drive descriptions through the same toolToAPISchema path the Anthropic
  // SDK uses, so OpenAI sees identical text + JSON schema (incl. session
  // caching, GrowthBook flips, swarm-field filtering). Without this the
  // OpenAI path silently degrades tool calling quality.
  const apiSchema = await toolToAPISchema(t, {
    getToolPermissionContext:
      (options.getToolPermissionContext as any) ?? (async () => ({})),
    tools: [t] as Tools,
    agents: (options.agents as any) ?? [],
    allowedAgentTypes: options.allowedAgentTypes,
    model: options.model,
  })
  return {
    name: apiSchema.name,
    description:
      typeof apiSchema.description === 'string' ? apiSchema.description : '',
    input_schema: apiSchema.input_schema as Record<string, unknown>,
  }
}

// ---------------- main generator ----------------

export async function* queryModelOpenAI(
  messages: Message[],
  systemPrompt: SystemPrompt,
  _thinkingConfig: ThinkingConfig,
  tools: Tools,
  signal: AbortSignal,
  options: QueryModelOptions,
): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> {
  // 诊断日志（FREE_CODE_DEBUG_OPENAI=1 时启用）
  const dbg = process.env.FREE_CODE_DEBUG_OPENAI
    ? (msg: string) => {
        try {
          require('node:fs').appendFileSync(
            '/tmp/free-code-openai.log',
            `[${new Date().toISOString()}] ${msg}\n`,
          )
        } catch {}
      }
    : () => {}
  dbg(
    `ENTER queryModelOpenAI: messages=${messages.length} tools=${tools.length} aborted=${signal.aborted} model=${options.model}`,
  )

  if (signal.aborted) {
    dbg('signal already aborted on entry — returning early')
    return
  }

  // ---- Routing: decide which model to actually send ----
  // The router takes options.model as an explicit override (CLI flag /
  // /model command). When unset (or matched against the registry it
  // becomes a no-op override), the auto path picks a tier based on the
  // last user message text + history length + image/tool flags.
  //
  // We mutate options.model in place so every downstream reference
  // (NormalizedRequest, message_start event, AssistantMessage) uses the
  // chosen id consistently.
  const lastUserText = extractLastUserText(messages)
  // If options.model is set and recognised by the registry it becomes a
  // hard override. If it's set but unknown (a custom relay model id like
  // 'gpt-5-codex'), we DON'T throw — we treat it as a pass-through
  // explicit choice and skip the banner (so the existing test corpus that
  // uses non-registry ids continues to work). The /why-this-model log
  // therefore won't include such pass-through requests, which is the
  // honest representation: the router didn't decide anything.
  const baseCtx = {
    userPromptText: lastUserText,
    historyTurnCount: messages.length,
    hasImages: messagesContainImages(messages),
    hasTools: tools.length > 0,
    provider: 'openai' as const,
  }
  let routedModel = options.model
  try {
    const decision = decideModelForRequest({
      ...baseCtx,
      explicitModel: options.model || undefined,
    })
    emitBannerForDecision(decision, {
      ...baseCtx,
      explicitModel: options.model || undefined,
    })
    routedModel = decision.model.id
  } catch {
    // Unknown explicit model — keep original. No banner, no log entry.
  }
  options.model = routedModel

  const normalized = await buildNormalizedRequestFromQueryModelArgs(
    messages,
    systemPrompt,
    tools,
    options,
  )
  const body = {
    ...toOpenAIRequest(normalized),
    stream: true,
    // OpenAI emits a final SSE chunk with `usage: {prompt_tokens, completion_tokens}`
    // when this is set. Required for the sub-agent UI's per-agent token counter
    // and for cost-tracker accuracy on this provider path.
    stream_options: { include_usage: true },
  }

  const base = (process.env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE).replace(
    /\/+$/,
    '',
  )
  const baseUrl = `${base}/v1/chat/completions`
  // Codex /fast subscription routing — opt-in via FREE_CODE_CODEX_FAST=1.
  // Adds ?fast=1 when the user has a Codex OAuth token AND the relay host
  // is in the known-eligible set AND the model is not light-tier. When
  // disabled or ineligible this is a no-op.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isCodexFastEligible, buildRelayUrlWithFastRouting } = require(
    './codex-fast-routing.js',
  ) as {
    isCodexFastEligible: (m: string) => boolean
    buildRelayUrlWithFastRouting: (u: string, e: boolean) => string
  }
  const url = buildRelayUrlWithFastRouting(
    baseUrl,
    isCodexFastEligible(options.model),
  )
  const auth =
    process.env.OPENAI_API_KEY ??
    process.env.ANTHROPIC_AUTH_TOKEN ??
    process.env.ANTHROPIC_API_KEY ??
    ''

  dbg(`POST ${url} body.messages=${body.messages.length}`)
  // FREE_CODE_DEBUG_OPENAI=2 dumps full body shape (no tool descriptions) to
  // localize tool_result drops / id mismatches across multi-turn.
  if (process.env.FREE_CODE_DEBUG_OPENAI === '2') {
    const shape = (body.messages as Array<Record<string, unknown>>).map(m => {
      const role = m.role as string
      const tc = m.tool_calls as Array<{ id: string; function: { name: string } }> | undefined
      const tcid = m.tool_call_id as string | undefined
      const text = typeof m.content === 'string' ? `text(${(m.content as string).length}c)` : Array.isArray(m.content) ? `parts(${(m.content as unknown[]).length})` : 'null'
      return tc?.length
        ? `${role}+tc[${tc.map(c => `${c.function.name}#${c.id.slice(0, 8)}`).join(',')}]`
        : tcid
        ? `${role}#${tcid.slice(0, 8)}=${text}`
        : `${role}=${text}`
    })
    dbg('body.shape: ' + shape.join(' | '))
  }
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(auth && { authorization: `Bearer ${auth}` }),
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    dbg(`fetch threw: ${e instanceof Error ? e.message : String(e)} aborted=${signal.aborted}`)
    if (signal.aborted) return
    yield apiErrorMessage(e instanceof Error ? e.message : String(e), 0)
    return
  }

  dbg(`response status=${res.status} hasBody=${!!res.body}`)
  if (!res.ok) {
    const text = await safeReadText(res)
    dbg(`HTTP error body: ${text.slice(0, 200)}`)
    yield apiErrorMessage(
      `OpenAI relay HTTP ${res.status}: ${text.slice(0, 400)}`,
      res.status,
    )
    return
  }
  if (!res.body) {
    yield apiErrorMessage('OpenAI relay returned empty body', 502)
    return
  }

  const messageId = `msg_${randomUUID()}`
  yield streamEvent({
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model: options.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: emptyUsage(),
    } as any,
  })

  // Accumulate content blocks for the final AssistantMessage.
  // The model can emit multiple parallel tool_calls in a single assistant
  // turn (this is what powers the "Running 3 agents…" parallel-agent UX).
  // OpenAI streams them at distinct delta.tool_calls[i].index values, so we
  // maintain ONE accumulator per index, plus a single text accumulator.
  type ToolAcc = {
    kind: 'tool_use'
    blockIndex: number
    id: string
    name: string
    argsBuf: string
  }
  type TextAcc = { kind: 'text'; blockIndex: number; text: string }
  let textCur: TextAcc | null = null
  // OpenAI tool_call.index → accumulator. Order of iteration mirrors first
  // appearance, so block indices correspond to the order tools were emitted.
  const toolByOpenAIIndex = new Map<number, ToolAcc>()
  let nextBlockIndex = 0
  let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' =
    'end_turn'
  const finalBlocks: BetaContentBlock[] = []

  function closeText(): BetaRawMessageStreamEvent[] {
    if (!textCur) return []
    const evs: BetaRawMessageStreamEvent[] = [
      { type: 'content_block_stop', index: textCur.blockIndex } as any,
    ]
    finalBlocks.push({ type: 'text', text: textCur.text } as any)
    textCur = null
    return evs
  }

  function closeAllTools(): BetaRawMessageStreamEvent[] {
    const evs: BetaRawMessageStreamEvent[] = []
    for (const t of toolByOpenAIIndex.values()) {
      evs.push({ type: 'content_block_stop', index: t.blockIndex } as any)
      let parsed: Record<string, unknown> = {}
      try {
        parsed = t.argsBuf ? JSON.parse(t.argsBuf) : {}
      } catch {
        // keep partial
      }
      finalBlocks.push({
        type: 'tool_use',
        id: t.id,
        name: t.name,
        input: parsed,
      } as any)
    }
    toolByOpenAIIndex.clear()
    return evs
  }

  // Captured from the final SSE chunk's `usage` field (enabled via
  // stream_options.include_usage above). Falls back to emptyUsage() if the
  // relay omits it.
  let capturedUsage: Record<string, number> | null = null

  try {
    for await (const chunk of readSSE(res.body)) {
      if (signal.aborted) return
      // OpenAI emits usage in the FINAL chunk (choices=[]). Capture it before
      // running through fromOpenAIStreamChunk which only handles delta events.
      const u = (chunk as any)?.usage
      if (u && typeof u === 'object') {
        capturedUsage = {
          prompt_tokens: Number(u.prompt_tokens ?? 0),
          completion_tokens: Number(u.completion_tokens ?? 0),
          total_tokens: Number(u.total_tokens ?? 0),
        }
      }
      const events = fromOpenAIStreamChunk(chunk)
      for (const norm of events) {
        if (norm.kind === 'text_delta') {
          if (!textCur) {
            // Open a new text block. Tool blocks (if any) stay open in
            // parallel — text and tools coexist within one assistant turn.
            textCur = { kind: 'text', blockIndex: nextBlockIndex++, text: '' }
            yield streamEvent({
              type: 'content_block_start',
              index: textCur.blockIndex,
              content_block: { type: 'text', text: '' },
            } as any)
          }
          textCur.text += norm.text
          yield streamEvent({
            type: 'content_block_delta',
            index: textCur.blockIndex,
            delta: { type: 'text_delta', text: norm.text },
          } as any)
        } else if (norm.kind === 'tool_use_start') {
          if (toolByOpenAIIndex.has(norm.toolIndex)) continue
          const t: ToolAcc = {
            kind: 'tool_use',
            blockIndex: nextBlockIndex++,
            id: norm.id,
            name: norm.name,
            argsBuf: '',
          }
          toolByOpenAIIndex.set(norm.toolIndex, t)
          yield streamEvent({
            type: 'content_block_start',
            index: t.blockIndex,
            content_block: {
              type: 'tool_use',
              id: norm.id,
              name: norm.name,
              input: {},
            },
          } as any)
        } else if (norm.kind === 'tool_input_delta') {
          const t = toolByOpenAIIndex.get(norm.toolIndex)
          if (t) {
            t.argsBuf += norm.partial
            yield streamEvent({
              type: 'content_block_delta',
              index: t.blockIndex,
              delta: { type: 'input_json_delta', partial_json: norm.partial },
            } as any)
          }
        } else if (norm.kind === 'message_stop') {
          stopReason = norm.reason
        }
      }
    }
  } catch (e) {
    if (signal.aborted) return
    yield apiErrorMessage(
      `OpenAI stream read error: ${e instanceof Error ? e.message : String(e)}`,
      0,
    )
    return
  }

  // Close text first, then all parallel tool blocks. Order in finalBlocks
  // (text first, tools second) matches what Anthropic emits when one turn
  // mixes text + tool_use.
  for (const e of closeText()) yield streamEvent(e)
  for (const e of closeAllTools()) yield streamEvent(e)

  // Map OpenAI's prompt_tokens/completion_tokens to Anthropic's input_tokens
  // /output_tokens shape that the rest of the CLI assumes. Cache fields stay 0
  // since OpenAI doesn't expose Anthropic-style cache breakpoints.
  const finalUsage = capturedUsage
    ? {
        input_tokens: capturedUsage.prompt_tokens,
        output_tokens: capturedUsage.completion_tokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        server_tool_use: null,
        service_tier: null,
      }
    : emptyUsage()

  yield streamEvent({
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: finalUsage as any,
  } as any)
  yield streamEvent({ type: 'message_stop' } as any)
  dbg(
    `stream finished: blocks=${finalBlocks.length} stopReason=${stopReason} ` +
      `usage=${capturedUsage ? capturedUsage.prompt_tokens + '/' + capturedUsage.completion_tokens : 'none'}`,
  )

  const assistant: AssistantMessage = {
    type: 'assistant',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    requestId: undefined,
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model: options.model,
      content: finalBlocks,
      stop_reason: stopReason as any,
      stop_sequence: null,
      usage: finalUsage as any,
      container: null,
      context_management: null,
    } as any,
  } as AssistantMessage
  yield assistant
  dbg('yielded final AssistantMessage — generator returning normally')
}

// ---------------- helpers ----------------

function streamEvent(event: BetaRawMessageStreamEvent): StreamEvent {
  return { type: 'stream_event', event } as StreamEvent
}

function apiErrorMessage(message: string, status: number): SystemAPIErrorMessage {
  const err = Object.assign(new Error(message), {
    status,
    headers: {} as Record<string, string>,
    error: { message },
  }) as unknown as Parameters<typeof createSystemAPIErrorMessage>[0]
  return createSystemAPIErrorMessage(err, 0, 0, 0)
}

function emptyUsage() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    server_tool_use: null,
    service_tier: null,
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

// extractLastUserText / messagesContainImages moved to
// src/routing/contextExtractors.ts so the Anthropic dispatch path can reuse
// the exact same routing-signal logic.

async function* readSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const dataLines = part
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
      if (dataLines.length === 0) continue
      const payload = dataLines.join('\n')
      if (payload === '[DONE]') return
      try {
        yield JSON.parse(payload)
      } catch {
        // ignore non-JSON keepalive
      }
    }
  }
}
