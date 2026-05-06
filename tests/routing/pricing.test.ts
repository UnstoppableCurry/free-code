// Pricing table — exact per-model prices for /cost reporting.
//
// Why this exists: getModelInfo() in routing/registry.ts returns tier-median
// prices ($1.0/$4.0 medium, $10/$40 heavy). For /cost reporting these are
// off by 5x in either direction depending on the actual model. The pricing
// table replaces tier-medians with realistic 2026 prices for the flagship
// models we expect users to invoke through convertmodel.net.
//
// Contract:
//   - exact-table lookup for known ids → returns the table value
//   - pattern-inferred fallback for unknown ids → returns reasonable estimate
//     (NOT tier median — must beat the registry's $1/$4 ballpark)
//   - getPricing() never returns 0 or NaN
//
// Source: public 2026 vendor pricing pages (Anthropic, OpenAI, DeepSeek,
// Moonshot, Google, etc.). When unknown — falls back to tier inference but
// scoped tighter than registry's medians.
import { describe, expect, test } from 'bun:test'
import { MODEL_PRICING, getPricing } from '../../src/routing/pricing.ts'

describe('routing/pricing — exact-table coverage', () => {
  test('table contains the major flagships we route to', () => {
    // Sanity: the table must cover at least these critical ids so /cost
    // reporting on them is exact, not inferred.
    const required = [
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.2',
      'gpt-5-codex',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
      'gemini-2.5-pro',
      'deepseek-v4-pro',
      'deepseek-r1',
      'kimi-k2-thinking',
    ]
    for (const id of required) {
      expect(MODEL_PRICING[id]).toBeDefined()
    }
  })

  test('every table entry has positive input and output prices', () => {
    for (const [id, prices] of Object.entries(MODEL_PRICING)) {
      expect(prices.input).toBeGreaterThan(0)
      expect(prices.output).toBeGreaterThan(0)
      // Output price must be >= input price (universal invariant)
      expect(prices.output).toBeGreaterThanOrEqual(prices.input)
      // Sanity: nothing in the table should exceed $1000/Mtok (catches typos)
      expect(prices.input).toBeLessThan(1000)
      expect(prices.output).toBeLessThan(1000)
      // id must be lowercase with no whitespace (matching convention)
      expect(id).toBe(id.toLowerCase())
      expect(id).not.toMatch(/\s/)
    }
  })

  test('claude-opus-4-7 is priced as a heavy model ($15/$75 ballpark)', () => {
    const p = MODEL_PRICING['claude-opus-4-7']!
    // Anthropic Opus tier is $15 / $75 per Mtok — that's the contract.
    expect(p.input).toBe(15.0)
    expect(p.output).toBe(75.0)
  })

  test('claude-haiku-4-5 is priced as a light model (sub-$5/Mtok output)', () => {
    const p = MODEL_PRICING['claude-haiku-4-5']!
    expect(p.input).toBeLessThan(2)
    expect(p.output).toBeLessThanOrEqual(5)
  })
})

describe('routing/pricing.getPricing — exact + fallback', () => {
  test('exact lookup returns table value verbatim', () => {
    const p = getPricing('claude-opus-4-7')
    expect(p.input).toBe(MODEL_PRICING['claude-opus-4-7']!.input)
    expect(p.output).toBe(MODEL_PRICING['claude-opus-4-7']!.output)
  })

  test('case-insensitive on id lookup', () => {
    const lower = getPricing('claude-opus-4-7')
    const upper = getPricing('CLAUDE-OPUS-4-7')
    const mixed = getPricing('Claude-Opus-4-7')
    expect(lower).toEqual(upper)
    expect(lower).toEqual(mixed)
  })

  test('unknown id falls back to pattern inference (NEVER returns 0/NaN)', () => {
    const p = getPricing('totally-made-up-id-2099')
    expect(p.input).toBeGreaterThan(0)
    expect(p.output).toBeGreaterThan(0)
    expect(Number.isFinite(p.input)).toBe(true)
    expect(Number.isFinite(p.output)).toBe(true)
  })

  test('unknown opus-like id infers heavy pricing', () => {
    // Pattern fallback: anything mentioning 'opus' should be priced high.
    const p = getPricing('opus-future-12')
    expect(p.input).toBeGreaterThanOrEqual(5.0)
    expect(p.output).toBeGreaterThanOrEqual(20.0)
  })

  test('unknown haiku-like id infers light pricing', () => {
    const p = getPricing('haiku-future-12')
    expect(p.input).toBeLessThan(2)
    expect(p.output).toBeLessThan(10)
  })

  test('unknown gpt-5-* id infers ballpark gpt-5 pricing', () => {
    const p = getPricing('gpt-5.99-experimental')
    // Should land in the $1-$30 input range — way better than tier medians
    expect(p.input).toBeGreaterThanOrEqual(0.5)
    expect(p.input).toBeLessThanOrEqual(30)
  })
})

describe('routing/pricing — integration with getModelInfo (tier-median is replaced)', () => {
  test('getModelInfo for a known id pulls exact prices, NOT tier medians', () => {
    // The routing registry must consult getPricing() so /cost shows the
    // right numbers. Tier-median for 'heavy' was $10/$40; exact is $15/$75.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getModelInfo } = require('../../src/routing/registry.ts') as {
      getModelInfo: (id: string) => {
        priceInputPer1M: number
        priceOutputPer1M: number
      }
    }
    const info = getModelInfo('claude-opus-4-7')
    expect(info.priceInputPer1M).toBe(15.0)
    expect(info.priceOutputPer1M).toBe(75.0)
  })

  test('getModelInfo for unknown id still produces sane prices', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getModelInfo } = require('../../src/routing/registry.ts') as {
      getModelInfo: (id: string) => {
        priceInputPer1M: number
        priceOutputPer1M: number
      }
    }
    const info = getModelInfo('mystery-model-xyz')
    expect(info.priceInputPer1M).toBeGreaterThan(0)
    expect(info.priceOutputPer1M).toBeGreaterThan(0)
  })
})
