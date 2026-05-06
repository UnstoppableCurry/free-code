// Anthropic native thinking-budget per effort tier.
//
// Why: claude-opus-4-7 supports 5 effort levels (low/medium/high/max/xhigh).
// Currently 'xhigh' on Anthropic-native (claude.ts paramsFromContext) just
// collapses to whatever getMaxThinkingTokensForModel returns, identical to
// 'max'. To meaningfully differentiate the tiers, map effort → thinking
// budget tokens.
//
// Mapping (per Anthropic thinking-config conventions):
//   low    →  4_096
//   medium →  8_192
//   high   → 16_384
//   max    → 24_576
//   xhigh  → 32_768
//
// This applies ONLY to the Anthropic-native path. The OpenAI relay path
// (claude-openai.ts) uses reasoning_effort string instead and is unaffected.
import { describe, expect, test } from 'bun:test'
import {
  getThinkingBudgetForEffort,
  type EffortTier,
} from '../../src/utils/thinking.ts'

describe('thinking-budget per effort tier — exact mapping', () => {
  const expected: Record<EffortTier, number> = {
    low: 4_096,
    medium: 8_192,
    high: 16_384,
    max: 24_576,
    xhigh: 32_768,
  }

  for (const [tier, budget] of Object.entries(expected) as Array<
    [EffortTier, number]
  >) {
    test(`'${tier}' → ${budget} thinking tokens`, () => {
      expect(getThinkingBudgetForEffort(tier)).toBe(budget)
    })
  }

  test('mapping is strictly monotonic — higher effort means more tokens', () => {
    const order: EffortTier[] = ['low', 'medium', 'high', 'max', 'xhigh']
    for (let i = 1; i < order.length; i++) {
      const prev = getThinkingBudgetForEffort(order[i - 1]!)
      const cur = getThinkingBudgetForEffort(order[i]!)
      expect(cur).toBeGreaterThan(prev)
    }
  })

  test('xhigh significantly exceeds max (≥1.25x)', () => {
    const max = getThinkingBudgetForEffort('max')
    const xhigh = getThinkingBudgetForEffort('xhigh')
    expect(xhigh / max).toBeGreaterThanOrEqual(1.25)
  })

  test('low is non-trivial (≥2k tokens — anything below is useless)', () => {
    expect(getThinkingBudgetForEffort('low')).toBeGreaterThanOrEqual(2_000)
  })
})

describe('thinking-budget — undefined / unknown effort handling', () => {
  test('returns undefined for unmapped effort levels (e.g. minimal)', () => {
    // 'minimal' exists in EFFORT_LEVELS but has no thinking-budget mapping —
    // disabling thinking is a separate concern.
    expect(getThinkingBudgetForEffort('minimal' as EffortTier)).toBeUndefined()
  })

  test('returns undefined for plain undefined input', () => {
    expect(getThinkingBudgetForEffort(undefined)).toBeUndefined()
  })
})
