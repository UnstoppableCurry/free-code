// RED: contract for routing integration adapter.
//
// decideModelForRequest is the bridge between messy runtime context (the
// Message[] / SystemPrompt / CLI flags landscape) and the pure selectModel
// router. It builds RoutingSignals, calls selectModel, and returns the
// decision. It must:
//   - honour explicitMode (override) when set
//   - throw RoutingError if explicit model is unknown
//   - estimate promptTokens from text length when not provided
//   - emit a single deterministic banner string via formatBanner()
import { describe, test, expect } from 'bun:test'
import {
  decideModelForRequest,
  formatBanner,
  type RoutingContext,
} from '../../src/routing/integration.ts'
import { RoutingError } from '../../src/routing/errors.ts'

const ctx = (over: Partial<RoutingContext> = {}): RoutingContext => ({
  userPromptText: 'do the thing',
  historyTurnCount: 1,
  hasImages: false,
  hasTools: false,
  budgetRemainingUsd: 999_999,
  provider: 'openai',
  ...over,
})

describe('routing/integration.decideModelForRequest', () => {
  test('explicit model becomes override decision', () => {
    const d = decideModelForRequest(ctx({ explicitModel: 'gpt-4o' }))
    expect(d.source).toBe('override')
    expect(d.model.id).toBe('gpt-4o')
  })

  test('no explicit model → auto path throws (anchors not registered)', () => {
    expect(() =>
      decideModelForRequest(ctx({ provider: 'anthropic' })),
    ).toThrow(RoutingError)
  })

  test('unknown explicit model is INFERRED, not rejected (compat-first)', () => {
    const d = decideModelForRequest(
      ctx({ explicitModel: 'totally-novel-id', provider: 'openai' }),
    )
    expect(d.source).toBe('override')
    expect(d.model.id).toBe('totally-novel-id')
  })

  test('explicit override picks tier from id heuristics', () => {
    const heavy = decideModelForRequest(
      ctx({ explicitModel: 'gpt-5-codex', provider: 'openai' }),
    )
    expect(heavy.tier).toBe('heavy')
    const light = decideModelForRequest(
      ctx({ explicitModel: 'gpt-4o-mini', provider: 'openai' }),
    )
    expect(light.tier).toBe('light')
  })
})

describe('routing/integration.formatBanner', () => {
  test('banner contains arrow, model id, source, tier (en)', () => {
    const d = decideModelForRequest(
      ctx({ explicitModel: 'gpt-4o', provider: 'openai' }),
    )
    const line = formatBanner(d, 'en-US')
    expect(line.startsWith('→')).toBe(true)
    expect(line).toContain('gpt-4o')
    expect(line).toContain('override')
  })

  test('banner switches phrasing on zh-CN locale', () => {
    const d = decideModelForRequest(
      ctx({ explicitModel: 'gpt-4o', provider: 'openai' }),
    )
    const line = formatBanner(d, 'zh-CN')
    expect(line).toContain('使用 model')
    expect(line).toContain('gpt-4o')
    expect(line).toContain('档')
  })

  test('override decisions render with override label', () => {
    const d = decideModelForRequest(
      ctx({ explicitModel: 'claude-opus-4-7', provider: 'anthropic' }),
    )
    const line = formatBanner(d, 'en-US')
    expect(line).toContain('override')
  })

  test('no emoji in banner output', () => {
    const d = decideModelForRequest(
      ctx({ explicitModel: 'gpt-4o', provider: 'openai' }),
    )
    const line = formatBanner(d, 'zh-CN')
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(line)).toBe(false)
  })
})
