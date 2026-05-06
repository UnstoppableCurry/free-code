// Codex /fast subscription routing — relay path.
//
// Probe results (recorded 2026-04):
//   /v1/fast/chat/completions → 404 (does not exist on convertmodel.net)
//   /fast/v1/chat/completions → 405 from a stale nginx (legacy mount, not real)
//   /v1/chat/completions?fast=1 → 401 (path valid, query param accepted)
//   /v1/pricing → 404 (not exposed)
//
// Implementation: behind FREE_CODE_CODEX_FAST=1 env flag (opt-in), we add
// `?fast=1` to the relay URL when:
//   1. provider is OpenAI / convertmodel relay, AND
//   2. user has a Codex OAuth token (CODEX_OAUTH_TOKEN env or auth payload),
//      AND
//   3. the model id is not light-tier (haiku/mini/nano — those don't benefit
//      from fast routing).
//
// The implementation is conservative: we don't break the request when the
// relay ignores the query param. Worst case is a no-op.
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  buildRelayUrlWithFastRouting,
  isCodexFastEligible,
} from '../../src/services/api/codex-fast-routing.ts'

describe('isCodexFastEligible — gating logic', () => {
  const original = process.env

  beforeEach(() => {
    process.env = { ...original }
    delete process.env.FREE_CODE_CODEX_FAST
    delete process.env.CODEX_OAUTH_TOKEN
  })
  afterEach(() => {
    process.env = original
  })

  test('returns false when FREE_CODE_CODEX_FAST is unset', () => {
    process.env.CODEX_OAUTH_TOKEN = 'tok_x'
    expect(isCodexFastEligible('gpt-5.5')).toBe(false)
  })

  test('returns false when no Codex OAuth token present', () => {
    process.env.FREE_CODE_CODEX_FAST = '1'
    expect(isCodexFastEligible('gpt-5.5')).toBe(false)
  })

  test('returns true when env flag set + token present + heavy/medium model', () => {
    process.env.FREE_CODE_CODEX_FAST = '1'
    process.env.CODEX_OAUTH_TOKEN = 'tok_x'
    expect(isCodexFastEligible('gpt-5.5')).toBe(true)
    expect(isCodexFastEligible('claude-opus-4-7')).toBe(true)
    expect(isCodexFastEligible('gpt-5-codex')).toBe(true)
  })

  test('returns false for light-tier models even when otherwise eligible', () => {
    process.env.FREE_CODE_CODEX_FAST = '1'
    process.env.CODEX_OAUTH_TOKEN = 'tok_x'
    // Light-tier models don't benefit from fast routing
    expect(isCodexFastEligible('gpt-5-mini')).toBe(false)
    expect(isCodexFastEligible('gpt-5-nano')).toBe(false)
    expect(isCodexFastEligible('claude-haiku-4-5')).toBe(false)
    expect(isCodexFastEligible('gemini-2.5-flash')).toBe(false)
  })

  test('respects 0 / off / false values for the env flag', () => {
    process.env.CODEX_OAUTH_TOKEN = 'tok_x'
    for (const v of ['0', 'false', 'off', '']) {
      process.env.FREE_CODE_CODEX_FAST = v
      expect(isCodexFastEligible('gpt-5.5')).toBe(false)
    }
  })
})

describe('buildRelayUrlWithFastRouting — query-param injection', () => {
  test('adds ?fast=1 when eligible', () => {
    const out = buildRelayUrlWithFastRouting(
      'https://convertmodel.net/v1/chat/completions',
      true,
    )
    const u = new URL(out)
    expect(u.searchParams.get('fast')).toBe('1')
    expect(u.pathname).toBe('/v1/chat/completions')
  })

  test('preserves other query params and adds ?fast=1', () => {
    const out = buildRelayUrlWithFastRouting(
      'https://convertmodel.net/v1/chat/completions?trace=abc',
      true,
    )
    const u = new URL(out)
    expect(u.searchParams.get('trace')).toBe('abc')
    expect(u.searchParams.get('fast')).toBe('1')
  })

  test('returns URL unchanged when not eligible', () => {
    const input = 'https://convertmodel.net/v1/chat/completions'
    expect(buildRelayUrlWithFastRouting(input, false)).toBe(input)
  })

  test('does not duplicate fast=1 when already present', () => {
    const out = buildRelayUrlWithFastRouting(
      'https://convertmodel.net/v1/chat/completions?fast=1',
      true,
    )
    const u = new URL(out)
    expect(u.searchParams.getAll('fast')).toEqual(['1'])
  })

  test('handles non-relay URLs (returns unchanged even when eligible)', () => {
    // Only convertmodel.net + similar relays should have fast routing applied.
    // For other hosts (e.g. a user's self-hosted gateway), don't presume.
    const input = 'https://api.openai.com/v1/chat/completions'
    expect(buildRelayUrlWithFastRouting(input, true)).toBe(input)
  })
})
