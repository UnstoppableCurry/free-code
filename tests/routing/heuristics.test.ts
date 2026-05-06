// RED: contract for the pure heuristic scoring fn. Pure, deterministic,
// no I/O, no side effects.
import { describe, test, expect } from 'bun:test'
import { pickTier, type RoutingSignals } from '../../src/routing/heuristics.ts'

const baseline = (over: Partial<RoutingSignals> = {}): RoutingSignals => ({
  promptTokens: 1000,
  turnCount: 1,
  hasTools: false,
  hasImages: false,
  keywords: [],
  budgetRemainingUsd: 999_999,
  ...over,
})

describe('routing/heuristics.pickTier', () => {
  test('default signals → medium', () => {
    const r = pickTier(baseline())
    expect(r.tier).toBe('medium')
    expect(r.reasons.length).toBeGreaterThan(0)
  })

  test('heavy keyword 重构 → heavy', () => {
    const r = pickTier(baseline({ keywords: ['重构'] }))
    expect(r.tier).toBe('heavy')
    expect(r.reasons.some(s => s.includes('重构'))).toBe(true)
  })

  test('heavy keyword refactor (case-insensitive) → heavy', () => {
    const r = pickTier(baseline({ keywords: ['Refactor'] }))
    expect(r.tier).toBe('heavy')
    expect(r.reasons.some(s => s.toLowerCase().includes('refactor'))).toBe(true)
  })

  test('promptTokens 50000 → at least medium', () => {
    const r = pickTier(baseline({ promptTokens: 50_000 }))
    expect(r.tier === 'medium' || r.tier === 'heavy').toBe(true)
  })

  test('promptTokens 200000 → heavy', () => {
    const r = pickTier(baseline({ promptTokens: 200_000 }))
    expect(r.tier).toBe('heavy')
    expect(r.reasons.some(s => s.toLowerCase().includes('prompt'))).toBe(true)
  })

  test('turnCount > 10 → at least medium', () => {
    const r = pickTier(baseline({ turnCount: 15 }))
    expect(r.tier === 'medium' || r.tier === 'heavy').toBe(true)
  })

  test('hasImages bumps tier up (vision required)', () => {
    // light keyword would normally produce light; image forces a bump
    const r = pickTier(baseline({ keywords: ['hello'], hasImages: true }))
    expect(r.tier === 'medium' || r.tier === 'heavy').toBe(true)
    expect(r.reasons.some(s => s.toLowerCase().includes('image') || s.toLowerCase().includes('vision'))).toBe(true)
  })

  test('low budget < 1 USD forces light, overrides heavy keyword', () => {
    const r = pickTier(baseline({ keywords: ['重构'], budgetRemainingUsd: 0.5 }))
    expect(r.tier).toBe('light')
    expect(r.reasons.some(s => s.toLowerCase().includes('budget'))).toBe(true)
  })

  test('reasons[] is non-empty and contains the triggering signal', () => {
    const r = pickTier(baseline({ keywords: ['ultrathink'] }))
    expect(r.reasons.length).toBeGreaterThan(0)
    expect(r.reasons.join(' ').toLowerCase()).toContain('ultrathink')
  })

  test('light keyword "hello" with no other signals → light', () => {
    const r = pickTier(baseline({ keywords: ['hello'] }))
    expect(r.tier).toBe('light')
  })

  test('determinism: same input → same output', () => {
    const s = baseline({ promptTokens: 30_000, keywords: ['architect'] })
    const a = pickTier(s)
    const b = pickTier(s)
    expect(a).toEqual(b)
  })
})
