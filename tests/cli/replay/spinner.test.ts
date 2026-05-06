/**
 * Spinner-verb localization test.
 *
 * Why a unit test, not a live replay: stream-json mode does NOT surface
 * the in-progress spinner verb. The spinner is rendered by ink while the
 * CLI waits for tokens, and stream-json is a structured backchannel — no
 * "current spinner verb" envelope exists. So we directly test the
 * locale-aware getter that the Spinner component reads from.
 *
 * Runs in default `bun test` — no live env required.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test'

import {
  getLocalizedSpinnerVerbs,
  SPINNER_VERBS,
  SPINNER_VERBS_ZH,
} from '../../../src/constants/spinnerVerbs'

describe('spinner verbs — locale-aware', () => {
  const originalLang = process.env.FREE_CODE_LANG
  const originalEnvLang = process.env.LANG
  const originalLcAll = process.env.LC_ALL

  beforeEach(() => {
    delete process.env.FREE_CODE_LANG
    delete process.env.LANG
    delete process.env.LC_ALL
  })

  afterEach(() => {
    if (originalLang === undefined) delete process.env.FREE_CODE_LANG
    else process.env.FREE_CODE_LANG = originalLang
    if (originalEnvLang === undefined) delete process.env.LANG
    else process.env.LANG = originalEnvLang
    if (originalLcAll === undefined) delete process.env.LC_ALL
    else process.env.LC_ALL = originalLcAll
  })

  test('returns the Chinese verb list when FREE_CODE_LANG=zh-CN', () => {
    process.env.FREE_CODE_LANG = 'zh-CN'
    const verbs = getLocalizedSpinnerVerbs()
    expect(verbs).toBe(SPINNER_VERBS_ZH)
    // Chinese verbs include CJK characters; English ones don't.
    const cjkRe = /[一-鿿]/
    expect(verbs.some(v => cjkRe.test(v))).toBe(true)
  })

  test('returns the English verb list when locale is not Chinese', () => {
    process.env.FREE_CODE_LANG = 'en-US'
    const verbs = getLocalizedSpinnerVerbs()
    expect(verbs).toBe(SPINNER_VERBS)
    // First entry of the English list is "Accomplishing" — sanity check.
    expect(verbs[0]).toBe('Accomplishing')
  })

  test('Chinese list contains real Chinese verbs (no English leakage)', () => {
    // Sample 20 verbs at random positions; every one must contain a CJK char.
    const cjkRe = /[一-鿿]/
    const sampleIdx = [0, 5, 10, 25, 50, 75, 100, 125, 150, 175]
    for (const i of sampleIdx) {
      if (i >= SPINNER_VERBS_ZH.length) continue
      const verb = SPINNER_VERBS_ZH[i]!
      expect(cjkRe.test(verb)).toBe(true)
    }
  })
})
