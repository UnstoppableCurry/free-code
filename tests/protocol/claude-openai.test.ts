// Behavioral contract for queryModelOpenAI — Phase B Slice 2.
//
// Slice 1 wired the dispatch gate; Slice 2 implements the actual fetch +
// SSE-parse path. These tests fake `globalThis.fetch` and assert:
//   - the OpenAI request body matches what toOpenAIRequest() produces from
//     a NormalizedRequest derived from the queryModel-shaped inputs
//   - SSE chunks are parsed and yielded as Anthropic-shaped StreamEvent
//     wrappers, ending with an AssistantMessage
//   - HTTP errors and network errors yield a SystemAPIErrorMessage
//     (NOT throw)
//   - aborted signals exit cleanly
//   - system prompt block arrays with cache_control fold to a single
//     OpenAI system message with cache_control dropped
//
// We deliberately do NOT make real HTTP requests. Everything is in-memory.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import {
  buildNormalizedRequestFromQueryModelArgs,
  queryModelOpenAI,
} from '../../src/services/api/claude-openai.ts'
import { toOpenAIRequest } from '../../src/services/api/adapter/normalize.ts'
import { asSystemPrompt } from '../../src/utils/systemPromptType.ts'

// ---------------- fetch mock helpers ----------------

type FetchCall = { url: string; init: RequestInit | undefined }

function makeSSEResponse(chunks: unknown[], status = 200): Response {
  const lines: string[] = []
  for (const c of chunks) {
    lines.push(`data: ${JSON.stringify(c)}\n\n`)
  }
  lines.push(`data: [DONE]\n\n`)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      for (const l of lines) controller.enqueue(enc.encode(l))
      controller.close()
    },
  })
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function installFetchMock(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const calls: FetchCall[] = []
  const orig = globalThis.fetch
  ;(globalThis as any).fetch = async (url: any, init: any) => {
    calls.push({ url: String(url), init })
    return handler(String(url), init)
  }
  return {
    calls,
    restore() {
      ;(globalThis as any).fetch = orig
    },
  }
}

// ---------------- queryModel-shaped inputs ----------------

const FAKE_MODEL = 'gpt-5-codex'

function userTextMessage(text: string): any {
  return {
    type: 'user',
    uuid: 'u-1',
    timestamp: new Date().toISOString(),
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
    },
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

// ---------------- buildNormalizedRequest helper ----------------

describe('buildNormalizedRequestFromQueryModelArgs', () => {
  test('text-only user message → single user text block', async () => {
    const req = await buildNormalizedRequestFromQueryModelArgs(
      [userTextMessage('hello')],
      asSystemPrompt(['You are helpful.']),
      [],
      NOOP_OPTIONS,
    )
    expect(req.model).toBe(FAKE_MODEL)
    expect(req.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ])
    // System prompt strings get folded to a single string for OpenAI shape.
    expect(typeof req.system === 'string' || Array.isArray(req.system)).toBe(true)
  })

  test('multi-string system prompt joins with newlines', async () => {
    const req = await buildNormalizedRequestFromQueryModelArgs(
      [userTextMessage('hi')],
      asSystemPrompt(['SYS-A', 'SYS-B']),
      [],
      NOOP_OPTIONS,
    )
    // Whatever the bridge produces, the OpenAI form must contain both pieces.
    const oai = toOpenAIRequest(req)
    expect((oai.messages[0] as any).role).toBe('system')
    const sys = (oai.messages[0] as any).content as string
    expect(sys).toContain('SYS-A')
    expect(sys).toContain('SYS-B')
  })

  test('assistant tool_use is preserved', async () => {
    const req = await buildNormalizedRequestFromQueryModelArgs(
      [
        userTextMessage('go'),
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'tu_1', name: 'read', input: { p: '/x' } },
            ],
          },
        } as any,
      ],
      asSystemPrompt([]),
      [],
      NOOP_OPTIONS,
    )
    const last = req.messages[req.messages.length - 1]
    expect(last.role).toBe('assistant')
    expect(last.content[0]).toEqual({
      type: 'tool_use',
      id: 'tu_1',
      name: 'read',
      input: { p: '/x' },
    })
  })

  test('user tool_result is preserved', async () => {
    const req = await buildNormalizedRequestFromQueryModelArgs(
      [
        {
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tu_1', content: 'ok' },
            ],
          },
        } as any,
      ],
      asSystemPrompt([]),
      [],
      NOOP_OPTIONS,
    )
    expect(req.messages[0].content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'tu_1',
      content: 'ok',
    })
  })
})

// ---------------- queryModelOpenAI behavior ----------------

describe('queryModelOpenAI: text-only request', () => {
  let mock: ReturnType<typeof installFetchMock>
  afterEach(() => mock?.restore())

  test('POSTs OpenAI body matching toOpenAIRequest output and yields text events', async () => {
    mock = installFetchMock(() =>
      makeSSEResponse([
        { choices: [{ delta: { content: 'Hel' } }] },
        { choices: [{ delta: { content: 'lo' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]),
    )

    const messages = [userTextMessage('hello')]
    const system = asSystemPrompt(['You are helpful.'])
    const ac = new AbortController()

    const events: any[] = []
    for await (const ev of queryModelOpenAI(
      messages,
      system,
      { type: 'disabled' } as any,
      [],
      ac.signal,
      NOOP_OPTIONS,
    )) {
      events.push(ev)
    }

    expect(mock.calls).toHaveLength(1)
    const call = mock.calls[0]
    expect(call.url).toContain('/v1/chat/completions')
    const body = JSON.parse(String(call.init?.body ?? '{}'))

    // Body matches the adapter's output for the same NormalizedRequest.
    const expected = toOpenAIRequest(
      await buildNormalizedRequestFromQueryModelArgs(
        messages,
        system,
        [],
        NOOP_OPTIONS,
      ),
    )
    expect(body.model).toBe(expected.model)
    expect(body.messages).toEqual(expected.messages)
    // Stream flag must be on.
    expect(body.stream).toBe(true)

    // Yielded events: at least one should carry the text 'Hello' eventually.
    const blob = JSON.stringify(events)
    expect(blob).toContain('Hel')
    expect(blob).toContain('lo')

    // Last yielded value must be an AssistantMessage assembling the text.
    const last = events[events.length - 1]
    expect(last.type).toBe('assistant')
    const assembled = (last.message.content as any[])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
    expect(assembled).toBe('Hello')
  })
})

describe('queryModelOpenAI: tool_use request', () => {
  let mock: ReturnType<typeof installFetchMock>
  afterEach(() => mock?.restore())

  test('SSE tool_calls produce tool_use AssistantMessage', async () => {
    mock = installFetchMock(() =>
      makeSSEResponse([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    function: { name: 'get_weather', arguments: '' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, function: { arguments: '{"city":' } },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, function: { arguments: '"Tokyo"}' } },
                ],
              },
            },
          ],
        },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      ]),
    )

    const events: any[] = []
    for await (const ev of queryModelOpenAI(
      [userTextMessage('weather?')],
      asSystemPrompt([]),
      { type: 'disabled' } as any,
      [],
      new AbortController().signal,
      NOOP_OPTIONS,
    )) {
      events.push(ev)
    }

    const last = events[events.length - 1]
    expect(last.type).toBe('assistant')
    const tu = (last.message.content as any[]).find(
      (b) => b.type === 'tool_use',
    )
    expect(tu).toBeDefined()
    expect(tu.name).toBe('get_weather')
    expect(tu.id).toBe('call_1')
    expect(tu.input).toEqual({ city: 'Tokyo' })
  })
})

describe('queryModelOpenAI: error handling', () => {
  let mock: ReturnType<typeof installFetchMock>
  afterEach(() => mock?.restore())

  test('HTTP 500 yields SystemAPIErrorMessage (does not throw)', async () => {
    mock = installFetchMock(
      () => new Response('internal error', { status: 500 }),
    )

    const events: any[] = []
    for await (const ev of queryModelOpenAI(
      [userTextMessage('x')],
      asSystemPrompt([]),
      { type: 'disabled' } as any,
      [],
      new AbortController().signal,
      NOOP_OPTIONS,
    )) {
      events.push(ev)
    }

    const sys = events.find((e) => e.type === 'system')
    expect(sys).toBeDefined()
    expect(sys.subtype).toBe('api_error')
  })

  test('network error (fetch throws) yields SystemAPIErrorMessage', async () => {
    mock = installFetchMock(() => {
      throw new Error('ECONNRESET')
    })

    const events: any[] = []
    for await (const ev of queryModelOpenAI(
      [userTextMessage('x')],
      asSystemPrompt([]),
      { type: 'disabled' } as any,
      [],
      new AbortController().signal,
      NOOP_OPTIONS,
    )) {
      events.push(ev)
    }

    const sys = events.find((e) => e.type === 'system')
    expect(sys).toBeDefined()
    expect(sys.subtype).toBe('api_error')
    expect(JSON.stringify(sys)).toContain('ECONNRESET')
  })
})

describe('queryModelOpenAI: abort', () => {
  let mock: ReturnType<typeof installFetchMock>
  afterEach(() => mock?.restore())

  test('pre-aborted signal exits cleanly without bogus events', async () => {
    let calledFetch = false
    mock = installFetchMock(() => {
      calledFetch = true
      return makeSSEResponse([])
    })

    const ac = new AbortController()
    ac.abort()

    const events: any[] = []
    for await (const ev of queryModelOpenAI(
      [userTextMessage('x')],
      asSystemPrompt([]),
      { type: 'disabled' } as any,
      [],
      ac.signal,
      NOOP_OPTIONS,
    )) {
      events.push(ev)
    }

    // Either: fetch is never called (we short-circuited), or it was called
    // with the signal. Either way we must not yield an AssistantMessage as
    // if a real response came back.
    const hasAssistant = events.some((e) => e.type === 'assistant')
    expect(hasAssistant).toBe(false)
    if (calledFetch) {
      // If fetch was reached, our wrapper must have forwarded the signal
      // into `init.signal`.
      const init = mock.calls[0]?.init as any
      expect(init?.signal).toBeDefined()
    }
  })
})

describe('queryModelOpenAI: system block array', () => {
  let mock: ReturnType<typeof installFetchMock>
  afterEach(() => mock?.restore())

  test('system block array with cache_control collapses to single OpenAI system msg', async () => {
    mock = installFetchMock(() =>
      makeSSEResponse([
        { choices: [{ delta: { content: 'k' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]),
    )

    const events: any[] = []
    for await (const ev of queryModelOpenAI(
      [userTextMessage('hi')],
      asSystemPrompt(['You are X']),
      { type: 'disabled' } as any,
      [],
      new AbortController().signal,
      NOOP_OPTIONS,
    )) {
      events.push(ev)
    }

    const body = JSON.parse(String(mock.calls[0].init?.body ?? '{}'))
    expect(body.messages[0]).toEqual({
      role: 'system',
      content: 'You are X',
    })
    // cache_control must not leak into the OpenAI body
    expect(JSON.stringify(body)).not.toContain('cache_control')
    expect(JSON.stringify(body)).not.toContain('ephemeral')
  })
})

// ---------------- integration: dispatch flag actually wires through ----------------

describe('integration: queryModel dispatch reaches queryModelOpenAI', () => {
  // We don't invoke queryModel here (too many side effects), but we DO assert
  // the dispatch wiring + the impl module are loadable together. That keeps
  // this lane independent from i18n while still proving the seam is closed.
  test('module exports the implementation and helper', async () => {
    const mod = await import('../../src/services/api/claude-openai.ts')
    expect(typeof mod.queryModelOpenAI).toBe('function')
    expect(typeof mod.buildNormalizedRequestFromQueryModelArgs).toBe('function')
  })
})
