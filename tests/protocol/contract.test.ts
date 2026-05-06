// Contract / characterization tests: lock the adapter's wire-format output
// against what claude.ts (Anthropic-shape, see paramsFromContext at
// src/services/api/claude.ts:1538-1729) and codex-fetch-adapter.ts
// (OpenAI/Codex-shape) actually produce today.
//
// The point is NOT to retest normalize.ts internals — those are covered by
// tests/protocol/normalize.test.ts. The point IS to freeze the OUTPUT shape
// so a future refactor of claude.ts to call toAnthropicRequest()/toOpenAIRequest()
// can't silently change what we send over the wire.
//
// Rules:
//  - One scenario = one test, ordered roughly by complexity.
//  - Assertions match field names + nesting + types as they would appear in
//    the JSON body sent to the relay.
//  - DO NOT modify normalize.ts. Gaps surface as test.skip / test.todo.

import { describe, test, expect } from 'bun:test'
import {
  toAnthropicRequest,
  toOpenAIRequest,
  type NormalizedRequest,
} from '../../src/services/api/adapter/normalize.js'

const MODEL = 'claude-sonnet-4-6'

describe('Contract: adapter output matches claude.ts / codex-fetch-adapter wire shape', () => {
  // ── (a) System + single user message ──────────────────────────────
  test('a. system prompt + single user message', () => {
    const req: NormalizedRequest = {
      model: MODEL,
      system: 'You are a helpful assistant.',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
      maxTokens: 1024,
    }

    // Anthropic shape: system at top level (matches claude.ts:1710 `system`).
    const a = toAnthropicRequest(req)
    expect(a.model).toBe(MODEL)
    expect(a.system).toBe('You are a helpful assistant.')
    expect(a.max_tokens).toBe(1024)
    expect(a.messages).toHaveLength(1)
    expect(a.messages[0].role).toBe('user')
    expect(a.messages[0].content).toEqual([{ type: 'text', text: 'Hello' }])

    // OpenAI shape: system folded into messages[0] as {role:'system', content:string}.
    const o = toOpenAIRequest(req)
    expect(o.model).toBe(MODEL)
    expect(o.max_tokens).toBe(1024)
    expect(o.messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' })
    // CHARACTERIZATION: normalize.ts arrays user text content even when there's
    // a single text block (see normalize.ts:227 — the `m.role === 'user'`
    // branch forces array form). Most OpenAI-compatible relays accept this,
    // and convertmodel.net smoke confirms it works. Locking the current shape.
    expect(o.messages[1]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'Hello' }],
    })
  })

  // ── (b) System as block array with cache_control ──────────────────
  // claude.ts builds `system` as a BetaTextBlockParam[] with cache_control on
  // the leading static block (CLAUDE_CODE_SYSTEM_PROMPT, etc.). Our current
  // NormalizedRequest models system as `string`, which DROPS:
  //   - block-level structure
  //   - cache_control: { type: 'ephemeral' } breakpoints
  // Refactoring claude.ts onto this adapter without first widening the type
  // would silently disable prompt-caching of the system prompt — a real
  // perf/cost regression. Surface as a skipped test with TODO.
  test('b. system as block array with cache_control', () => {
    const systemBlocks = [
      {
        type: 'text' as const,
        text: 'You are Claude Code.',
        cache_control: { type: 'ephemeral' as const },
      },
      {
        type: 'text' as const,
        text: 'Additional dynamic context.',
      },
    ]
    const req: NormalizedRequest = {
      model: MODEL,
      system: systemBlocks,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
      maxTokens: 1024,
    }

    // Anthropic: system passes through verbatim as block array, cache_control preserved.
    const a = toAnthropicRequest(req)
    expect(a.system).toEqual(systemBlocks)

    // OpenAI: blocks joined by '\n', cache_control silently dropped.
    const o = toOpenAIRequest(req)
    expect(o.messages[0]).toEqual({
      role: 'system',
      content: 'You are Claude Code.\nAdditional dynamic context.',
    })
  })

  // ── (b1) System block array, no cache_control on any block ───────
  test('b1. system as block array with no cache_control', () => {
    const systemBlocks = [
      { type: 'text' as const, text: 'First block.' },
      { type: 'text' as const, text: 'Second block.' },
    ]
    const req: NormalizedRequest = {
      model: MODEL,
      system: systemBlocks,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
      maxTokens: 1024,
    }

    const a = toAnthropicRequest(req)
    expect(a.system).toEqual(systemBlocks)

    const o = toOpenAIRequest(req)
    expect(o.messages[0]).toEqual({
      role: 'system',
      content: 'First block.\nSecond block.',
    })
  })

  // ── (b2) cache_control on second block only ───────────────────────
  test('b2. system block array with cache_control on second block only', () => {
    const systemBlocks = [
      { type: 'text' as const, text: 'Static preamble.' },
      {
        type: 'text' as const,
        text: 'Dynamic suffix.',
        cache_control: { type: 'ephemeral' as const },
      },
    ]
    const req: NormalizedRequest = {
      model: MODEL,
      system: systemBlocks,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
      maxTokens: 1024,
    }

    // Anthropic: full block array preserved, cache_control on block[1] intact.
    const a = toAnthropicRequest(req)
    expect(a.system).toEqual(systemBlocks)
    expect((a.system as any[])[1].cache_control).toEqual({ type: 'ephemeral' })

    // OpenAI: text joined; cache_control absent from output.
    const o = toOpenAIRequest(req)
    expect(o.messages[0]).toEqual({
      role: 'system',
      content: 'Static preamble.\nDynamic suffix.',
    })
    expect(JSON.stringify(o)).not.toContain('cache_control')
    expect(JSON.stringify(o)).not.toContain('ephemeral')
  })

  // ── (b3) empty string vs undefined ────────────────────────────────
  test('b3. system as empty string still emits a system field; undefined omits it', () => {
    const reqEmpty: NormalizedRequest = {
      model: MODEL,
      system: '',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
      maxTokens: 1024,
    }
    const aEmpty = toAnthropicRequest(reqEmpty)
    expect(aEmpty.system).toBe('')
    const oEmpty = toOpenAIRequest(reqEmpty)
    expect(oEmpty.messages[0]).toEqual({ role: 'system', content: '' })

    const reqNone: NormalizedRequest = {
      model: MODEL,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
      maxTokens: 1024,
    }
    const oNone = toOpenAIRequest(reqNone)
    // No system message prepended → user is messages[0].
    expect((oNone.messages[0] as any).role).toBe('user')
    // Wire bytes: anthropic body has no `system` key after JSON roundtrip.
    const aWire = JSON.parse(JSON.stringify(toAnthropicRequest(reqNone)))
    expect(aWire).not.toHaveProperty('system')
  })

  // ── (c) Two-block assistant: text + tool_use ──────────────────────
  test('c. assistant message with text + tool_use roundtrip', () => {
    const req: NormalizedRequest = {
      model: MODEL,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'read foo' }] },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: "I'll read it." },
            {
              type: 'tool_use',
              id: 'toolu_01ABC',
              name: 'read_file',
              input: { path: '/foo' },
            },
          ],
        },
      ],
      maxTokens: 1024,
    }

    // Anthropic: assistant.content is [text, tool_use] preserved verbatim.
    const a = toAnthropicRequest(req)
    const aAsst = a.messages[1]
    expect(aAsst.role).toBe('assistant')
    expect(aAsst.content).toEqual([
      { type: 'text', text: "I'll read it." },
      {
        type: 'tool_use',
        id: 'toolu_01ABC',
        name: 'read_file',
        input: { path: '/foo' },
      },
    ])

    // OpenAI: single assistant message with content (string) + tool_calls,
    // arguments MUST be a JSON string (OpenAI spec — not an object).
    const o = toOpenAIRequest(req)
    const oAsst = o.messages[1] as any
    expect(oAsst.role).toBe('assistant')
    expect(oAsst.content).toBe("I'll read it.")
    expect(oAsst.tool_calls).toHaveLength(1)
    expect(oAsst.tool_calls[0]).toEqual({
      id: 'toolu_01ABC',
      type: 'function',
      function: {
        name: 'read_file',
        arguments: JSON.stringify({ path: '/foo' }),
      },
    })
    expect(typeof oAsst.tool_calls[0].function.arguments).toBe('string')
  })

  // ── (d) Tool result follow-up ─────────────────────────────────────
  test('d. user message containing only a tool_result', () => {
    const req: NormalizedRequest = {
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_01ABC',
              content: 'file contents here',
            },
          ],
        },
      ],
      maxTokens: 1024,
    }

    // Anthropic: user message keeps tool_result inside its content array.
    const a = toAnthropicRequest(req)
    expect(a.messages[0].role).toBe('user')
    expect(a.messages[0].content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'toolu_01ABC',
        content: 'file contents here',
        is_error: undefined,
      },
    ])

    // OpenAI: tool_result becomes its own role:'tool' message — NOT a user message.
    const o = toOpenAIRequest(req)
    expect(o.messages).toHaveLength(1)
    expect(o.messages[0]).toEqual({
      role: 'tool',
      tool_call_id: 'toolu_01ABC',
      content: 'file contents here',
    })
  })

  // ── (e) Image attachment ──────────────────────────────────────────
  test('e. user message with text + base64 PNG image', () => {
    const req: NormalizedRequest = {
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'what is this?' },
            { type: 'image', mime: 'image/png', base64: 'iVBORw0KGgo=' },
          ],
        },
      ],
      maxTokens: 1024,
    }

    // Anthropic: image as { type:'image', source:{ type:'base64', media_type, data } }.
    const a = toAnthropicRequest(req)
    const aBlocks = a.messages[0].content as any[]
    expect(aBlocks[0]).toEqual({ type: 'text', text: 'what is this?' })
    expect(aBlocks[1]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
    })

    // OpenAI: content is an array, image as image_url with data URI.
    // No system prompt in this scenario, so user is messages[0].
    const o = toOpenAIRequest(req)
    const oUser = o.messages[0] as any
    expect(oUser.role).toBe('user')
    expect(Array.isArray(oUser.content)).toBe(true)
    expect(oUser.content[0]).toEqual({ type: 'text', text: 'what is this?' })
    expect(oUser.content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' },
    })
  })

  // ── (f) Tool definitions ──────────────────────────────────────────
  test('f. tool definitions in request', () => {
    const tools = [
      {
        name: 'read_file',
        description: 'Read a file from disk',
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
    ]
    const req: NormalizedRequest = {
      model: MODEL,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }],
      tools,
      maxTokens: 1024,
    }

    // Anthropic: tools array with input_schema (claude.ts:1711 `tools: allTools`).
    const a = toAnthropicRequest(req)
    expect(a.tools).toEqual(tools)

    // OpenAI: tools wrapped as { type:'function', function:{ name, description, parameters } }.
    const o = toOpenAIRequest(req)
    expect(o.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read a file from disk',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      },
    ])
  })

  // ── (g) max_tokens passthrough ────────────────────────────────────
  test('g. max_tokens lands as `max_tokens` in both shapes', () => {
    const req: NormalizedRequest = {
      model: MODEL,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }],
      maxTokens: 8192,
    }
    expect(toAnthropicRequest(req).max_tokens).toBe(8192)
    expect(toOpenAIRequest(req).max_tokens).toBe(8192)
  })

  // ── (h) temperature optional ──────────────────────────────────────
  // claude.ts only spreads temperature when defined (claude.ts:1717
  // `...(temperature !== undefined && { temperature })`). We mirror that.
  //
  // KNOWN DEVIATION from claude.ts wire shape:
  //   toAnthropicRequest unconditionally sets `temperature: req.temperature`,
  //   which means when temperature is undefined the field is PRESENT with
  //   value `undefined`. JSON.stringify drops undefined values, so the wire
  //   bytes are still identical — but a structural assertion like
  //   `expect(body).not.toHaveProperty('temperature')` would FAIL pre-stringify.
  //   Documenting as a todo so we either (1) tighten normalize.ts to omit the
  //   field, or (2) explicitly accept the post-JSON.stringify equivalence.
  test('h. temperature omitted from wire bytes when undefined', () => {
    const req: NormalizedRequest = {
      model: MODEL,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }],
      maxTokens: 1024,
      // temperature intentionally omitted
    }

    // Wire-equivalence check: JSON.stringify drops undefined fields.
    const aWire = JSON.parse(JSON.stringify(toAnthropicRequest(req)))
    expect(aWire).not.toHaveProperty('temperature')

    const oWire = JSON.parse(JSON.stringify(toOpenAIRequest(req)))
    expect(oWire).not.toHaveProperty('temperature')
  })

  // Tightened: normalize.ts now spreads conditionally, so the property is
  // genuinely absent pre-stringify. This pins that behaviour.
  test('h2. temperature key is structurally absent (not set to undefined) when omitted', () => {
    const req: NormalizedRequest = {
      model: MODEL,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'go' }] }],
      maxTokens: 1024,
    }
    const a = toAnthropicRequest(req) as Record<string, unknown>
    const o = toOpenAIRequest(req) as Record<string, unknown>
    expect('temperature' in a).toBe(false)
    expect('temperature' in o).toBe(false)
  })
})

describe('Contract: shape parity — same NormalizedRequest, both protocols', () => {
  test('parity: model, prompt presence, tool count, max_tokens all agree', () => {
    const tools = [
      {
        name: 'read_file',
        description: 'Read a file',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
    ]
    const req: NormalizedRequest = {
      model: MODEL,
      system: 'You are helpful.',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'PARITY-PROBE-XYZ' }] },
      ],
      tools,
      maxTokens: 2048,
    }

    const a = toAnthropicRequest(req)
    const o = toOpenAIRequest(req)

    // Same model passes through unchanged.
    expect(a.model).toBe(o.model)
    expect(a.model).toBe(MODEL)

    // Same max_tokens.
    expect(a.max_tokens).toBe(o.max_tokens)
    expect(a.max_tokens).toBe(2048)

    // Same tool count (modulo wrapper shape).
    expect(a.tools?.length ?? 0).toBe(o.tools?.length ?? 0)
    expect(a.tools).toHaveLength(1)

    // Both bodies contain at least one user message reflecting the prompt.
    const probe = 'PARITY-PROBE-XYZ'
    const aHasUser = a.messages.some(
      (m) =>
        m.role === 'user' &&
        Array.isArray(m.content) &&
        (m.content as any[]).some((b) => b.type === 'text' && b.text === probe),
    )
    expect(aHasUser).toBe(true)

    const oHasUser = o.messages.some(
      (m) => m.role === 'user' && (m.content === probe ||
        (Array.isArray(m.content) &&
          (m.content as any[]).some((b) => b.type === 'text' && b.text === probe))),
    )
    expect(oHasUser).toBe(true)
  })
})
