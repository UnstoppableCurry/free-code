import { describe, test, expect } from 'bun:test'
import {
  toAnthropicRequest,
  toOpenAIRequest,
  fromAnthropicStreamEvent,
  fromOpenAIStreamChunk,
  type NormalizedRequest,
  type NormalizedStreamEvent,
} from '../../src/services/api/adapter/normalize.js'

const baseRequest: NormalizedRequest = {
  model: 'claude-sonnet-4-6',
  system: 'You are a helpful assistant.',
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ],
  tools: [
    {
      name: 'read_file',
      description: 'Read a file',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  ],
  maxTokens: 1024,
}

describe('NormalizedRequest → Anthropic', () => {
  test('places system at top level (not in messages)', () => {
    const req = toAnthropicRequest(baseRequest)
    expect(req.system).toBe('You are a helpful assistant.')
    expect(req.messages[0].role).toBe('user')
  })

  test('serializes tools with input_schema', () => {
    const req = toAnthropicRequest(baseRequest)
    expect(req.tools).toHaveLength(1)
    expect(req.tools![0]).toMatchObject({
      name: 'read_file',
      description: 'Read a file',
      input_schema: { type: 'object' },
    })
  })

  test('serializes tool_use as content block with object input', () => {
    const req = toAnthropicRequest({
      ...baseRequest,
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_01',
              name: 'read_file',
              input: { path: '/foo' },
            },
          ],
        },
      ],
    })
    const block = (req.messages[0].content as any[])[0]
    expect(block.type).toBe('tool_use')
    expect(block.id).toBe('toolu_01')
    expect(block.input).toEqual({ path: '/foo' })
  })

  test('serializes image as base64 source block', () => {
    const req = toAnthropicRequest({
      ...baseRequest,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', mime: 'image/png', base64: 'iVBORw0KGgo=' },
          ],
        },
      ],
    })
    const block = (req.messages[0].content as any[])[0]
    expect(block).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
    })
  })
})

describe('NormalizedRequest → OpenAI', () => {
  test('puts system as first message in messages array', () => {
    const req = toOpenAIRequest(baseRequest)
    expect(req.messages[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    })
    expect(req.messages[1].role).toBe('user')
  })

  test('serializes tools as function definitions', () => {
    const req = toOpenAIRequest(baseRequest)
    expect(req.tools).toHaveLength(1)
    expect(req.tools![0]).toEqual({
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a file',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
    })
  })

  test('serializes tool_use as tool_calls with JSON-string arguments', () => {
    const req = toOpenAIRequest({
      ...baseRequest,
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_01',
              name: 'read_file',
              input: { path: '/foo' },
            },
          ],
        },
      ],
    })
    const msg = req.messages[1] as any
    expect(msg.role).toBe('assistant')
    expect(msg.tool_calls).toHaveLength(1)
    expect(msg.tool_calls[0].function.name).toBe('read_file')
    // Critical: arguments must be a JSON string, not an object
    expect(typeof msg.tool_calls[0].function.arguments).toBe('string')
    expect(JSON.parse(msg.tool_calls[0].function.arguments)).toEqual({
      path: '/foo',
    })
  })

  test('serializes image as image_url data URI', () => {
    const req = toOpenAIRequest({
      ...baseRequest,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', mime: 'image/png', base64: 'iVBORw0KGgo=' },
          ],
        },
      ],
    })
    const msg = req.messages[1] as any
    const part = msg.content[0]
    expect(part.type).toBe('image_url')
    expect(part.image_url.url).toBe('data:image/png;base64,iVBORw0KGgo=')
  })
})

describe('Stream events normalize to identical structure', () => {
  test('Anthropic content_block_delta → text_delta normalized event', () => {
    const event = fromAnthropicStreamEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Hello' },
    } as any)
    expect(event).toEqual({ kind: 'text_delta', text: 'Hello' })
  })

  test('OpenAI delta.content → same text_delta normalized event', () => {
    const events = fromOpenAIStreamChunk({
      choices: [{ delta: { content: 'Hello' } }],
    } as any)
    expect(events).toEqual([{ kind: 'text_delta', text: 'Hello' }])
  })

  test('Anthropic tool_use start → tool_use_start normalized event', () => {
    const event = fromAnthropicStreamEvent({
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: 'toolu_01',
        name: 'read_file',
        input: {},
      },
    } as any)
    expect(event).toEqual({
      kind: 'tool_use_start',
      id: 'toolu_01',
      name: 'read_file',
    })
  })

  test('OpenAI tool_calls delta with name → same tool_use_start event', () => {
    const events = fromOpenAIStreamChunk({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_01',
                function: { name: 'read_file', arguments: '' },
              },
            ],
          },
        },
      ],
    } as any)
    expect(events).toEqual([
      {
        kind: 'tool_use_start',
        toolIndex: 0,
        id: 'call_01',
        name: 'read_file',
      },
    ])
  })

  test('orphan assistant tool_calls get a synthetic empty tool message (avoids HTTP 400)', () => {
    // Reproduces the live 400 ('No tool output found for function call X')
    // that hits when conversation history was compacted and a tool_result
    // got dropped. Without the patch, OpenAI rejects the request; with it,
    // we self-heal by inserting an empty placeholder so the wire is valid.
    const body = toOpenAIRequest({
      model: 'gpt-5.5',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'use the tool' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call_orphan',
              name: 'noop',
              input: { x: 1 },
            },
          ],
        },
        // Note: the user message that should follow with tool_result for
        // call_orphan is MISSING (the bug condition).
        {
          role: 'user',
          content: [{ type: 'text', text: 'and now do something else' }],
        },
      ],
      maxTokens: 64,
    }) as { messages: Array<Record<string, unknown>> }

    // Find the assistant tool_calls message and the immediately-following
    // tool message.
    const assistantIdx = body.messages.findIndex(
      (m) => m.role === 'assistant',
    )
    expect(assistantIdx).toBeGreaterThanOrEqual(0)
    const next = body.messages[assistantIdx + 1]!
    expect(next.role).toBe('tool')
    expect(next.tool_call_id).toBe('call_orphan')
    expect(next.content).toBe('')
  })

  test('OpenAI parallel tool_calls in one chunk → multiple tool_use_start events', () => {
    // Regression: OpenAI may emit several parallel tool_calls in a single
    // chunk at distinct .index values. Earlier our adapter only looked at
    // [0] so 2nd/3rd parallel agents got dropped (UX bug: 'Running 1 agent'
    // when the model wanted 3).
    const events = fromOpenAIStreamChunk({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: 'call_a', function: { name: 'Task', arguments: '' } },
              { index: 1, id: 'call_b', function: { name: 'Task', arguments: '' } },
              { index: 2, id: 'call_c', function: { name: 'Task', arguments: '' } },
            ],
          },
        },
      ],
    } as any)
    expect(events).toHaveLength(3)
    expect(events[0]).toEqual({ kind: 'tool_use_start', toolIndex: 0, id: 'call_a', name: 'Task' })
    expect(events[1]).toEqual({ kind: 'tool_use_start', toolIndex: 1, id: 'call_b', name: 'Task' })
    expect(events[2]).toEqual({ kind: 'tool_use_start', toolIndex: 2, id: 'call_c', name: 'Task' })
  })

  test('Anthropic input_json_delta → tool_input_delta event', () => {
    const event = fromAnthropicStreamEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"path":' },
    } as any)
    expect(event).toEqual({
      kind: 'tool_input_delta',
      partial: '{"path":',
    })
  })

  test('OpenAI tool_calls arguments delta → same tool_input_delta event', () => {
    const events = fromOpenAIStreamChunk({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, function: { arguments: '{"path":' } },
            ],
          },
        },
      ],
    } as any)
    expect(events).toEqual([
      { kind: 'tool_input_delta', toolIndex: 0, partial: '{"path":' },
    ])
  })

  test('stop reasons map to unified enum', () => {
    expect(
      fromAnthropicStreamEvent({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 10 },
      } as any),
    ).toEqual({ kind: 'message_stop', reason: 'end_turn' })

    expect(
      fromOpenAIStreamChunk({
        choices: [{ delta: {}, finish_reason: 'stop' }],
      } as any),
    ).toEqual([{ kind: 'message_stop', reason: 'end_turn' }])

    expect(
      fromOpenAIStreamChunk({
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      } as any),
    ).toEqual([{ kind: 'message_stop', reason: 'tool_use' }])
  })
})
