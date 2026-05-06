// Contract for the dynamic router. No hardcoded list — overrides flow
// through getModelInfo() inference; auto path requires anchors which are
// intentionally absent (CLI's upstream model-resolution always supplies
// an explicit id).
import { describe, test, expect } from 'bun:test'
import { selectModel } from '../../src/routing/router.ts'
import { RoutingError } from '../../src/routing/errors.ts'
import type { RoutingSignals } from '../../src/routing/heuristics.ts'

const sig = (over: Partial<RoutingSignals> = {}): RoutingSignals => ({
  promptTokens: 1000,
  turnCount: 1,
  hasTools: false,
  hasImages: false,
  keywords: [],
  budgetRemainingUsd: 999_999,
  ...over,
})

describe('routing/router.selectModel — explicit overrides', () => {
  test('explicit override model picked, source=override', () => {
    const d = selectModel({
      signals: sig(),
      provider: 'anthropic',
      override: { model: 'claude-opus-4-7' },
    })
    expect(d.source).toBe('override')
    expect(d.model.id).toBe('claude-opus-4-7')
    expect(d.reasons).toContain('user override')
  })

  test('any id flows through (no static rejection)', () => {
    // Previously unknown ids threw RoutingError; now we infer info and let
    // the relay be the source of truth for what's actually accepted.
    for (const id of [
      'gpt-5.5',
      'gemini-2.5-pro',
      'deepseek-v4-pro',
      'kimi-k2-thinking',
      'MiniMax-M1',
      'glm-4.6',
      'qwen-max-latest',
      'totally-novel-model-id',
    ]) {
      const d = selectModel({
        signals: sig(),
        provider: 'openai',
        override: { model: id },
      })
      expect(d.source).toBe('override')
      expect(d.model.id).toBe(id)
    }
  })

  test('override id determines tier via inference', () => {
    expect(
      selectModel({
        signals: sig(),
        provider: 'openai',
        override: { model: 'gpt-5.5' },
      }).tier,
    ).toBe('heavy')
    expect(
      selectModel({
        signals: sig(),
        provider: 'openai',
        override: { model: 'gpt-5-nano' },
      }).tier,
    ).toBe('light')
    expect(
      selectModel({
        signals: sig(),
        provider: 'anthropic',
        override: { model: 'claude-haiku-4-5' },
      }).tier,
    ).toBe('light')
  })
})

describe('routing/router.selectModel — auto path', () => {
  test('auto path throws RoutingError pointing at explicit --model', () => {
    let err: unknown
    try {
      selectModel({ signals: sig(), provider: 'openai' })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(RoutingError)
    expect((err as Error).message).toMatch(/--model/i)
  })
})
