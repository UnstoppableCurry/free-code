// 统一的、provider-agnostic 的请求/响应/流事件类型 + 双向序列化。
// 业务层只依赖这里的 Normalized* 类型；adapter 层负责与 Anthropic / OpenAI 协议互转。

export type NormalizedTextBlock = { type: 'text'; text: string }

export type NormalizedToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export type NormalizedToolResultBlock = {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export type NormalizedImageBlock = {
  type: 'image'
  mime: string
  base64: string
}

export type NormalizedContentBlock =
  | NormalizedTextBlock
  | NormalizedToolUseBlock
  | NormalizedToolResultBlock
  | NormalizedImageBlock

export type NormalizedMessage = {
  role: 'user' | 'assistant'
  content: NormalizedContentBlock[]
}

export type NormalizedTool = {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export type NormalizedSystemBlock = {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export type ReasoningEffort =
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'max'
  | 'xhigh'

export type NormalizedRequest = {
  model: string
  system?: string | NormalizedSystemBlock[]
  messages: NormalizedMessage[]
  tools?: NormalizedTool[]
  maxTokens: number
  temperature?: number
  // 'max' is the CLI's UX label; at the OpenAI wire level it collapses to
  // 'high' (the API's strongest tier). Anthropic native uses thinking
  // budget tokens — adapter handles the mapping per-protocol.
  reasoningEffort?: ReasoningEffort
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'

export type NormalizedStreamEvent =
  | { kind: 'text_delta'; text: string }
  // toolIndex carries OpenAI's `delta.tool_calls[i].index` so callers can
  // route partial tool deltas to the right accumulator when the model emits
  // multiple parallel tool_calls in a single assistant turn.
  | { kind: 'tool_use_start'; toolIndex: number; id: string; name: string }
  | { kind: 'tool_input_delta'; toolIndex: number; partial: string }
  | { kind: 'message_stop'; reason: StopReason }

// ---------------- Anthropic ----------------

export type AnthropicRequest = {
  model: string
  system?: string | NormalizedSystemBlock[]
  messages: Array<{ role: 'user' | 'assistant'; content: unknown }>
  tools?: Array<{
    name: string
    description: string
    input_schema: Record<string, unknown>
  }>
  max_tokens: number
  temperature?: number
}

export function toAnthropicRequest(req: NormalizedRequest): AnthropicRequest {
  return {
    model: req.model,
    system: req.system,
    messages: req.messages.map((m) => ({
      role: m.role,
      content: m.content.map(toAnthropicBlock),
    })),
    tools: req.tools,
    max_tokens: req.maxTokens,
    // Conditionally spread — matches claude.ts:1717
    // `...(temperature !== undefined && { temperature })`. Avoids putting
    // {temperature: undefined} on the request object pre-stringify.
    ...(req.temperature !== undefined && { temperature: req.temperature }),
  }
}

function toAnthropicBlock(block: NormalizedContentBlock): unknown {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text }
    case 'tool_use':
      return {
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input,
      }
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: block.tool_use_id,
        content: block.content,
        is_error: block.is_error,
      }
    case 'image':
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: block.mime,
          data: block.base64,
        },
      }
  }
}

export function fromAnthropicStreamEvent(
  event: any,
): NormalizedStreamEvent | null {
  if (event.type === 'content_block_start') {
    const cb = event.content_block
    if (cb?.type === 'tool_use') {
      return { kind: 'tool_use_start', id: cb.id, name: cb.name }
    }
    return null
  }
  if (event.type === 'content_block_delta') {
    const d = event.delta
    if (d.type === 'text_delta') {
      return { kind: 'text_delta', text: d.text }
    }
    if (d.type === 'input_json_delta') {
      return { kind: 'tool_input_delta', partial: d.partial_json }
    }
    return null
  }
  if (event.type === 'message_delta') {
    const reason = mapAnthropicStopReason(event.delta?.stop_reason)
    if (reason) return { kind: 'message_stop', reason }
    return null
  }
  return null
}

function mapAnthropicStopReason(raw: string | null | undefined): StopReason | null {
  switch (raw) {
    case 'end_turn':
      return 'end_turn'
    case 'tool_use':
      return 'tool_use'
    case 'max_tokens':
      return 'max_tokens'
    case 'stop_sequence':
      return 'stop_sequence'
    default:
      return null
  }
}

// ---------------- OpenAI ----------------

export type OpenAIRequest = {
  model: string
  messages: Array<Record<string, unknown>>
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: Record<string, unknown>
    }
  }>
  max_tokens: number
  temperature?: number
}

export function toOpenAIRequest(req: NormalizedRequest): OpenAIRequest {
  const messages: Array<Record<string, unknown>> = []
  if (req.system !== undefined) {
    // Block array: join text fields by '\n'; cache_control silently dropped
    // (OpenAI/Codex protocols do not support Anthropic prompt-caching breakpoints).
    // Mirrors codex-fetch-adapter.ts:240-247.
    const systemContent =
      typeof req.system === 'string'
        ? req.system
        : req.system.map((b) => b.text).join('\n')
    messages.push({ role: 'system', content: systemContent })
  }
  for (const m of req.messages) {
    messages.push(...toOpenAIMessages(m))
  }

  // Self-heal orphan tool_calls: every assistant message with tool_calls[i]
  // MUST be followed by a role:'tool' message with matching tool_call_id —
  // OpenAI returns "No tool output found for function call X" otherwise. In
  // long sessions where context got compacted the tool result for some
  // earlier call may have been dropped from history; without this guard we
  // surface the 400 to the user instead of recovering. Synthesize a
  // placeholder tool message for any unmatched id so the wire is well-formed.
  patchOrphanToolCalls(messages)

  return {
    model: req.model,
    messages,
    tools: req.tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: sanitizeJsonSchemaForOpenAI(t.input_schema),
      },
    })),
    max_tokens: req.maxTokens,
    ...(req.temperature !== undefined && { temperature: req.temperature }),
    // OpenAI's reasoning_effort accepts 'minimal'|'low'|'medium'|'high'.
    // - Our 'max' (Anthropic UX label) collapses to 'high'.
    // - Our 'xhigh' (opus-4-7 only) also collapses to 'high' at the
    //   OpenAI wire level since OpenAI doesn't have that tier — Anthropic
    //   adapters can pick a richer thinking budget for it separately.
    // When unset, omit the key entirely so the model uses its default.
    ...(req.reasoningEffort !== undefined && {
      reasoning_effort:
        req.reasoningEffort === 'max' || req.reasoningEffort === 'xhigh'
          ? 'high'
          : req.reasoningEffort,
    }),
  }
}

/**
 * Walks the assembled messages array and inserts a placeholder
 * `{role:'tool', tool_call_id, content}` immediately after any assistant
 * tool_call that lacks a matching tool message. Idempotent.
 */
function patchOrphanToolCalls(
  messages: Array<Record<string, unknown>>,
): void {
  const i = 0
  // We mutate the array, so iterate by index manually.
  let cursor = i
  while (cursor < messages.length) {
    const msg = messages[cursor]!
    const tcs = msg.tool_calls as
      | Array<{ id?: string; function?: { name?: string } }>
      | undefined
    if (msg.role !== 'assistant' || !Array.isArray(tcs) || tcs.length === 0) {
      cursor++
      continue
    }
    // Look at the immediately-following stretch of role:'tool' messages.
    const expectedIds = new Set(
      tcs.map((tc) => tc.id).filter((id): id is string => typeof id === 'string'),
    )
    const seen = new Set<string>()
    let scan = cursor + 1
    while (scan < messages.length && messages[scan]!.role === 'tool') {
      const id = messages[scan]!.tool_call_id as string | undefined
      if (id) seen.add(id)
      scan++
    }
    const orphans = [...expectedIds].filter((id) => !seen.has(id))
    if (orphans.length > 0) {
      const inserts = orphans.map((id) => ({
        role: 'tool',
        tool_call_id: id,
        content: '',
      }))
      // Insert right after the assistant message (before any existing
      // tool messages, but it doesn't matter for OpenAI which just maps
      // tool_call_id → output).
      messages.splice(cursor + 1, 0, ...inserts)
      scan += inserts.length
    }
    cursor = scan
  }
}

function toOpenAIMessages(
  m: NormalizedMessage,
): Array<Record<string, unknown>> {
  // tool_result blocks become separate role:"tool" messages in OpenAI format.
  const toolResults = m.content.filter(
    (b): b is NormalizedToolResultBlock => b.type === 'tool_result',
  )
  const nonToolResults = m.content.filter((b) => b.type !== 'tool_result')

  const out: Array<Record<string, unknown>> = []

  if (nonToolResults.length > 0) {
    const textParts = nonToolResults.filter(
      (b): b is NormalizedTextBlock => b.type === 'text',
    )
    const imageParts = nonToolResults.filter(
      (b): b is NormalizedImageBlock => b.type === 'image',
    )
    const toolUses = nonToolResults.filter(
      (b): b is NormalizedToolUseBlock => b.type === 'tool_use',
    )

    const msg: Record<string, unknown> = { role: m.role }

    if (imageParts.length > 0 || (textParts.length > 0 && m.role === 'user')) {
      msg.content = [
        ...textParts.map((t) => ({ type: 'text', text: t.text })),
        ...imageParts.map((i) => ({
          type: 'image_url',
          image_url: { url: `data:${i.mime};base64,${i.base64}` },
        })),
      ]
    } else if (textParts.length > 0) {
      msg.content = textParts.map((t) => t.text).join('')
    } else {
      msg.content = null
    }

    if (toolUses.length > 0) {
      msg.tool_calls = toolUses.map((t) => ({
        id: t.id,
        type: 'function',
        function: {
          name: t.name,
          arguments: JSON.stringify(t.input),
        },
      }))
    }

    out.push(msg)
  }

  for (const tr of toolResults) {
    out.push({
      role: 'tool',
      tool_call_id: tr.tool_use_id,
      content: tr.content,
    })
  }

  return out
}

/**
 * Convert an OpenAI streaming chunk to ZERO OR MORE normalized events.
 *
 * Most chunks yield one event, but a single chunk can carry multiple
 * tool_call deltas (one per parallel tool_call the model is emitting),
 * so we MUST return an array — collapsing to "first one wins" loses
 * parallel tool invocations entirely.
 */
export function fromOpenAIStreamChunk(
  chunk: any,
): NormalizedStreamEvent[] {
  const choice = chunk.choices?.[0]
  if (!choice) return []

  const finish = choice.finish_reason
  if (finish) {
    return [{ kind: 'message_stop', reason: mapOpenAIFinishReason(finish) }]
  }

  const delta = choice.delta
  if (!delta) return []

  const out: NormalizedStreamEvent[] = []

  if (Array.isArray(delta.tool_calls)) {
    for (const tc of delta.tool_calls) {
      const idx: number =
        typeof tc.index === 'number' ? tc.index : 0
      if (tc.id && tc.function?.name) {
        out.push({
          kind: 'tool_use_start',
          toolIndex: idx,
          id: tc.id,
          name: tc.function.name,
        })
      }
      // Skip empty argument deltas — they accompany the initial tool_use
      // chunk in OpenAI's stream and would synthesise no-op deltas.
      if (
        typeof tc.function?.arguments === 'string' &&
        tc.function.arguments.length > 0
      ) {
        out.push({
          kind: 'tool_input_delta',
          toolIndex: idx,
          partial: tc.function.arguments,
        })
      }
    }
  }

  if (typeof delta.content === 'string' && delta.content.length > 0) {
    out.push({ kind: 'text_delta', text: delta.content })
  }

  return out
}

function mapOpenAIFinishReason(raw: string): StopReason {
  switch (raw) {
    case 'stop':
      return 'end_turn'
    case 'tool_calls':
      return 'tool_use'
    case 'length':
      return 'max_tokens'
    default:
      return 'end_turn'
  }
}

// ---------------- JSON Schema sanitiser for OpenAI ----------------

// OpenAI 严格校验函数参数 schema：array 必须带 items，object 推荐有 properties。
// Anthropic 更宽松，所以一些 MCP 工具（特别是社区写的）会缺 items 字段。
// 走 OpenAI 协议时我们必须补齐，否则中转返 400。
//
// 这里不"修复"工具——只是为这次发出的 wire payload 兜底。原 schema 不动。
export function sanitizeJsonSchemaForOpenAI<T = unknown>(schema: T): T {
  if (schema == null || typeof schema !== 'object') return schema
  if (Array.isArray(schema)) {
    return schema.map((s) => sanitizeJsonSchemaForOpenAI(s)) as unknown as T
  }
  const out: Record<string, unknown> = { ...(schema as Record<string, unknown>) }
  if (out.type === 'array' && out.items === undefined) {
    out.items = {}
  }
  for (const k of Object.keys(out)) {
    const v = out[k]
    if (v && typeof v === 'object') {
      out[k] = sanitizeJsonSchemaForOpenAI(v)
    }
  }
  return out as unknown as T
}
