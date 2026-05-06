import { describe, test, expect, afterEach } from 'bun:test'

const ORIGINAL_LANG = process.env.FREE_CODE_LANG

afterEach(() => {
  if (ORIGINAL_LANG === undefined) delete process.env.FREE_CODE_LANG
  else process.env.FREE_CODE_LANG = ORIGINAL_LANG
})

describe('spinner verbs i18n', () => {
  test('en-US locale returns the original English verb list', async () => {
    process.env.FREE_CODE_LANG = 'en-US'
    const mod = await import('../../src/constants/spinnerVerbs.js')
    expect(mod.SPINNER_VERBS).toContain('Gusting')
    expect(mod.SPINNER_VERBS).toContain('Pondering')
    expect(mod.SPINNER_VERBS).toContain('Brewing')
  })

  test('zh-CN locale yields Chinese verbs of the same length', async () => {
    const mod = await import('../../src/constants/spinnerVerbs.js')
    const en = mod.SPINNER_VERBS
    const zh = mod.SPINNER_VERBS_ZH
    expect(zh.length).toBe(en.length)
    // Each zh-CN entry must contain at least one CJK character (rough lint).
    const cjk = /[一-鿿]/
    for (const v of zh) {
      expect(v, `non-CJK spinner verb: ${v}`).toMatch(cjk)
    }
  })

  test('getLocalizedSpinnerVerbs returns Chinese list when zh-CN', async () => {
    process.env.FREE_CODE_LANG = 'zh-CN'
    const mod = await import('../../src/constants/spinnerVerbs.js')
    const verbs = mod.getLocalizedSpinnerVerbs()
    // Sample a handful of expected Chinese translations.
    expect(verbs).toContain('拂动')
    expect(verbs).toContain('思忖')
    expect(verbs).toContain('酝酿')
    expect(verbs).toContain('琢磨')
    expect(verbs).toContain('推算')
  })

  test('getLocalizedSpinnerVerbs returns English list when en-US', async () => {
    process.env.FREE_CODE_LANG = 'en-US'
    const mod = await import('../../src/constants/spinnerVerbs.js')
    const verbs = mod.getLocalizedSpinnerVerbs()
    expect(verbs).toContain('Gusting')
    expect(verbs).toContain('Pondering')
  })
})
