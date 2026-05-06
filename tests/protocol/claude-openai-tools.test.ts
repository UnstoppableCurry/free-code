// Phase B Slice 3: contract for tool description + system block widening.
//
// Two seams under test:
//
//  (1) Tool description correctness. Prior shortcut used a static
//      `description` string on the tool — but Anthropic SDK Tools carry an
//      async `tool.prompt()` (model-aware via toolToAPISchema). We must call
//      that path so OpenAI receives the same descriptions Anthropic would.
//
//  (2) SystemPrompt → NormalizedSystemBlock[] widening. Internally
//      SystemPrompt is `readonly string[]`. NormalizedRequest.system accepts
//      a richer block array with cache_control. Widening preserves caching
//      breakpoints for any future Anthropic-via-adapter route while
//      remaining a no-op for OpenAI (cache_control silently dropped).
//
// No real HTTP. No real tool execution. Mock fetch + tool.prompt.
import { afterEach, describe, expect, test } from 'bun:test'
import {
  buildNormalizedRequestFromQueryModelArgs,
  queryModelOpenAI,
} from '../../src/services/api/claude-openai.ts'
import {
  toAnthropicRequest,
  toOpenAIRequest,
} from '../../src/services/api/adapter/normalize.ts'
import { asSystemPrompt } from '../../src/utils/systemPromptType.ts'

const FAKE_MODEL = 'gpt-5-codex'

function userTextMessage(text: string): any {
  return {
    type: 'user',
    uuid: 'u-1',
    timestamp: new Date().toISOString(),
    message: { role: 'user', content: [{ type: 'text', text }] },
  }
}

const NOOP_OPTIONS: any = {
  model: FAKE_MODEL,
  querySource: 'repl_main_thread',
  isNonInteractiveSession: false,
  agents: [],
  hasAppendSystemPrompt: false,
  mcpTools: [],
  getToolPermissionContext: async () => ({}),
}

// Minimal Tool fake — only the fields toolToAPISchema actually reads.
function makeFakeTool(opts: {
  name: string
  promptText: string
  inputJSONSchema?: Record<string, unknown>
}) {
  return {
    name: opts.name,
    inputSchema: undefined as any,
    inputJSONSchema: opts.inputJSONSchema ?? {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
    async prompt() {
      return opts.promptText
    },
    isEnabled: () => true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    maxResultSizeChars: 100_000,
    async description() {
      return ''
    },
    async checkPermissions() {
      return { behavior: 'allow' } as any
    },
    async call() {
      return {} as any
    },
  } as any
}

// ---------------- Seam 1: tool descriptions via toolToAPISchema ----------------

describe('Seam 1: tool descriptions go through toolToAPISchema', () => {
  test('NormalizedTool.description carries tool.prompt() output, not a stale shortcut', async () => {
    const tool = makeFakeTool({
      name: 'read',
      promptText: 'You are a great file reader.',
      inputJSONSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    })

    const req = await buildNormalizedRequestFromQueryModelArgs(
      [userTextMessage('hi')],
      asSystemPrompt(['SYS']),
      [tool],
      NOOP_OPTIONS,
    )

    expect(req.tools).toBeDefined()
    expect(req.tools!).toHaveLength(1)
    const t = req.tools![0]
    expect(t.name).toBe('read')
    expect(t.description).toBe('You are a great file reader.')
    expect(t.input_schema).toEqual({
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    })
  })

  test('OpenAI-shaped body forwards the prompt-derived description', async () => {
    const tool = makeFakeTool({
      name: 'grep',
      promptText: 'Search across files for a regex.',
    })
    const req = await buildNormalizedRequestFromQueryModelArgs(
      [userTextMessage('find todos')],
      asSystemPrompt([]),
      [tool],
      NOOP_OPTIONS,
    )
    const oai = toOpenAIRequest(req)
    expect(oai.tools).toBeDefined()
    expect(oai.tools!).toHaveLength(1)
    expect(oai.tools![0].function.name).toBe('grep')
    expect(oai.tools![0].function.description).toBe(
      'Search across files for a regex.',
    )
  })
})

// ---------------- Seam 2: SystemPrompt → NormalizedSystemBlock[] ----------------

describe('Seam 2: SystemPrompt widens to NormalizedSystemBlock[]', () => {
  test('multi-string system prompt yields one block per entry; last carries ephemeral cache_control', async () => {
    const req = await buildNormalizedRequestFromQueryModelArgs(
      [userTextMessage('hello')],
      asSystemPrompt(['You are X', 'Project: foo', 'Always be terse']),
      [],
      NOOP_OPTIONS,
    )
    expect(Array.isArray(req.system)).toBe(true)
    const blocks = req.system as Array<{
      type: 'text'
      text: string
      cache_control?: { type: 'ephemeral' }
    }>
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toEqual({ type: 'text', text: 'You are X' })
    expect(blocks[1]).toEqual({ type: 'text', text: 'Project: foo' })
    // Cache breakpoint lands on the LAST block (matches Anthropic SDK pattern).
    expect(blocks[2].text).toBe('Always be terse')
    expect(blocks[2].cache_control).toEqual({ type: 'ephemeral' })
    // Earlier blocks must NOT carry cache_control.
    expect(blocks[0].cache_control).toBeUndefined()
    expect(blocks[1].cache_control).toBeUndefined()
  })

  test('OpenAI route flattens block array to a single string and drops cache_control', async () => {
    const req = await buildNormalizedRequestFromQueryModelArgs(
      [userTextMessage('hi')],
      asSystemPrompt(['You are X', 'Project: foo', 'Always be terse']),
      [],
      NOOP_OPTIONS,
    )
    const oai = toOpenAIRequest(req)
    expect((oai.messages[0] as any).role).toBe('system')
    expect((oai.messages[0] as any).content).toBe(
      'You are X\nProject: foo\nAlways be terse',
    )
    // No cache_control leaks into the OpenAI wire format.
    expect(JSON.stringify(oai)).not.toContain('cache_control')
    expect(JSON.stringify(oai)).not.toContain('ephemeral')
  })

  test('Anthropic route preserves block array with cache_control intact', async () => {
    const req = await buildNormalizedRequestFromQueryModelArgs(
      [userTextMessage('hi')],
      asSystemPrompt(['You are X', 'Project: foo']),
      [],
      NOOP_OPTIONS,
    )
    const anth = toAnthropicRequest(req)
    expect(Array.isArray(anth.system)).toBe(true)
    const blocks = anth.system as Array<{
      type: 'text'
      text: string
      cache_control?: { type: 'ephemeral' }
    }>
    expect(blocks).toHaveLength(2)
    expect(blocks[1].cache_control).toEqual({ type: 'ephemeral' })
  })

  test('empty system prompt yields no system blocks', async () => {
    const req = await buildNormalizedRequestFromQueryModelArgs(
      [userTextMessage('hi')],
      asSystemPrompt([]),
      [],
      NOOP_OPTIONS,
    )
    // Either undefined or an empty array — both acceptable, but must not
    // produce a stray system message in OpenAI form.
    const oai = toOpenAIRequest(req)
    const firstIsSystem = (oai.messages[0] as any)?.role === 'system'
    expect(firstIsSystem).toBe(false)
  })
})

// ---------------- Behavior preservation: OpenAI flow unchanged ----------------

describe('OpenAI behavior preservation across seam fixes', () => {
  const orig = globalThis.fetch
  afterEach(() => {
    ;(globalThis as any).fetch = orig
  })

  test('end-to-end: cache_control still dropped on the wire to OpenAI', async () => {
    let captured: any = null
    ;(globalThis as any).fetch = async (_url: any, init: any) => {
      captured = JSON.parse(String(init?.body ?? '{}'))
      const lines = [
        `data: ${JSON.stringify({
          choices: [{ delta: { content: 'ok' } }],
        })}\n\n`,
        `data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: 'stop' }],
        })}\n\n`,
        `data: [DONE]\n\n`,
      ]
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const enc = new TextEncoder()
          for (const l of lines) controller.enqueue(enc.encode(l))
          controller.close()
        },
      })
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }

    const events: any[] = []
    for await (const ev of queryModelOpenAI(
      [userTextMessage('hi')],
      asSystemPrompt(['ALPHA', 'BETA', 'GAMMA']),
      { type: 'disabled' } as any,
      [],
      new AbortController().signal,
      NOOP_OPTIONS,
    )) {
      events.push(ev)
    }

    expect(captured).not.toBeNull()
    expect(captured.messages[0]).toEqual({
      role: 'system',
      content: 'ALPHA\nBETA\nGAMMA',
    })
    expect(JSON.stringify(captured)).not.toContain('cache_control')
    expect(JSON.stringify(captured)).not.toContain('ephemeral')
  })
})
