// Contract for the dynamic registry. Pins:
//   - No hardcoded model list (MODEL_REGISTRY is intentionally empty).
//   - getModelInfo(id) returns sane inferred capabilities for ANY id.
//   - Pattern inference catches the major model families.
import { describe, expect, test } from 'bun:test'
import {
  MODEL_REGISTRY,
  getById,
  getByTier,
  getModelInfo,
} from '../../src/routing/registry.ts'

describe('routing/registry — no hardcoded list', () => {
  test('MODEL_REGISTRY is empty', () => {
    expect(MODEL_REGISTRY.length).toBe(0)
  })

  test('getById returns undefined for ANY id (no static table)', () => {
    expect(getById('gpt-5.5')).toBeUndefined()
    expect(getById('claude-opus-4-7')).toBeUndefined()
    expect(getById('definitely-not-a-real-model')).toBeUndefined()
  })

  test('getByTier returns undefined (no anchors)', () => {
    expect(getByTier('anthropic', 'light')).toBeUndefined()
    expect(getByTier('openai', 'heavy')).toBeUndefined()
  })
})

describe('routing/registry.getModelInfo — pattern inference', () => {
  test('claude-* → anthropic provider', () => {
    expect(getModelInfo('claude-opus-4-7').provider).toBe('anthropic')
    expect(getModelInfo('claude-haiku-4-5').provider).toBe('anthropic')
    expect(getModelInfo('claude-sonnet-4-6').provider).toBe('anthropic')
  })

  test('non-claude ids → openai provider (relay path)', () => {
    expect(getModelInfo('gpt-5.5').provider).toBe('openai')
    expect(getModelInfo('gemini-2.5-pro').provider).toBe('openai')
    expect(getModelInfo('deepseek-v4-pro').provider).toBe('openai')
    expect(getModelInfo('kimi-k2-thinking').provider).toBe('openai')
    expect(getModelInfo('MiniMax-M1').provider).toBe('openai')
    expect(getModelInfo('glm-4.6').provider).toBe('openai')
    expect(getModelInfo('qwen-max-latest').provider).toBe('openai')
    expect(getModelInfo('o3-pro').provider).toBe('openai')
  })

  test('heavy hints (opus/pro/max/codex/thinking/r1) → heavy tier', () => {
    expect(getModelInfo('claude-opus-4-7').tier).toBe('heavy')
    expect(getModelInfo('gpt-5-codex').tier).toBe('heavy')
    expect(getModelInfo('o3-pro').tier).toBe('heavy')
    expect(getModelInfo('kimi-k2-thinking').tier).toBe('heavy')
    expect(getModelInfo('deepseek-r1').tier).toBe('heavy')
    expect(getModelInfo('qwen-max-latest').tier).toBe('heavy')
  })

  test('light hints (mini/nano/flash/haiku) → light tier', () => {
    expect(getModelInfo('gpt-4o-mini').tier).toBe('light')
    expect(getModelInfo('gpt-5-nano').tier).toBe('light')
    expect(getModelInfo('gemini-2.5-flash').tier).toBe('light')
    expect(getModelInfo('claude-haiku-4-5').tier).toBe('light')
  })

  test('unknown family defaults to medium', () => {
    expect(getModelInfo('unknown-model-id').tier).toBe('medium')
  })

  test('reasoning_effort families detected (gpt-5+, o-series, deepseek-r1, *-thinking, opus)', () => {
    expect(getModelInfo('gpt-5.5').supportsReasoningEffort).toBe(true)
    expect(getModelInfo('o3-pro').supportsReasoningEffort).toBe(true)
    expect(getModelInfo('deepseek-r1').supportsReasoningEffort).toBe(true)
    expect(getModelInfo('kimi-k2-thinking').supportsReasoningEffort).toBe(true)
    expect(getModelInfo('claude-opus-4-7').supportsReasoningEffort).toBe(true)
  })

  test('non-reasoning families do NOT claim reasoning_effort', () => {
    expect(getModelInfo('gpt-4o').supportsReasoningEffort).toBe(false)
    expect(getModelInfo('claude-haiku-4-5').supportsReasoningEffort).toBe(false)
    expect(getModelInfo('gemini-2.5-flash').supportsReasoningEffort).toBe(false)
  })

  test('vision support inferred per family', () => {
    expect(getModelInfo('claude-opus-4-7').supportsVision).toBe(true)
    expect(getModelInfo('gpt-4o').supportsVision).toBe(true)
    expect(getModelInfo('gpt-4o-mini').supportsVision).toBe(false)
    expect(getModelInfo('gemini-2.5-pro').supportsVision).toBe(true)
    expect(getModelInfo('deepseek-v4-pro').supportsVision).toBe(false)
  })

  test('context window inferred for known families', () => {
    expect(getModelInfo('gemini-2.5-pro').contextWindow).toBe(2_000_000)
    expect(getModelInfo('claude-opus-4-7').contextWindow).toBe(1_000_000)
    expect(getModelInfo('deepseek-v4-pro').contextWindow).toBe(1_000_000)
    expect(getModelInfo('gpt-5.5').contextWindow).toBe(256_000)
    expect(getModelInfo('claude-haiku-4-5').contextWindow).toBe(200_000)
    expect(getModelInfo('unknown-id').contextWindow).toBe(128_000)
  })

  test('tools support is true by default for any inferred id', () => {
    for (const id of ['gpt-5.5', 'claude-opus-4-7', 'gemini-2.5-pro', 'kimi-k2', 'glm-4.6', 'qwen-max', 'unknown-x']) {
      expect(getModelInfo(id).supportsTools).toBe(true)
    }
  })

  test('returned info has positive context window and prices', () => {
    const m = getModelInfo('any-random-id')
    expect(m.contextWindow).toBeGreaterThan(0)
    expect(m.priceInputPer1M).toBeGreaterThan(0)
    expect(m.priceOutputPer1M).toBeGreaterThan(0)
  })
})
