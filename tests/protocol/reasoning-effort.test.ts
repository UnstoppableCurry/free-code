/**
 * Reasoning-effort plumbing contract.
 *
 * /effort UI lets the user pick low/medium/high/max. For OpenAI-compat
 * relays (gpt-5.x, o-series, deepseek-r1, kimi-k2-thinking, etc.) this
 * MUST translate to a top-level `reasoning_effort` field on the request
 * body. Without it the model defaults to its lowest effort and the user's
 * /effort selection is silently ignored.
 *
 * 'max' is non-standard at the OpenAI wire level — collapse it to 'high'.
 */

import { describe, expect, test } from 'bun:test'
import {
  toOpenAIRequest,
  type NormalizedRequest,
} from '../../src/services/api/adapter/normalize.js'

const baseReq: NormalizedRequest = {
  model: 'gpt-5.5',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  maxTokens: 64,
}

describe('toOpenAIRequest — reasoning_effort plumbing', () => {
  test('omits reasoning_effort when not set', () => {
    const body = toOpenAIRequest(baseReq) as Record<string, unknown>
    expect('reasoning_effort' in body).toBe(false)
  })

  test('passes through low/medium/high verbatim', () => {
    for (const level of ['low', 'medium', 'high'] as const) {
      const body = toOpenAIRequest({
        ...baseReq,
        reasoningEffort: level,
      }) as Record<string, unknown>
      expect(body.reasoning_effort).toBe(level)
    }
  })

  test('collapses max → high (max is non-standard at the OpenAI wire level)', () => {
    const body = toOpenAIRequest({
      ...baseReq,
      reasoningEffort: 'max',
    }) as Record<string, unknown>
    expect(body.reasoning_effort).toBe('high')
  })

  test('still works alongside tools, system prompt, temperature', () => {
    const body = toOpenAIRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      system: 'You are X',
      tools: [
        {
          name: 'noop',
          description: 'no-op',
          input_schema: { type: 'object' },
        },
      ],
      maxTokens: 256,
      temperature: 0.7,
      reasoningEffort: 'high',
    }) as Record<string, unknown>
    expect(body.reasoning_effort).toBe('high')
    expect(body.temperature).toBe(0.7)
    expect((body.tools as unknown[]).length).toBe(1)
    expect((body.messages as Array<Record<string, unknown>>)[0].role).toBe(
      'system',
    )
  })
})
