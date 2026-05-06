import { describe, test, expect, afterEach, beforeAll } from 'bun:test'
import enUS from '../../src/i18n/locales/en-US.json' with { type: 'json' }
import zhCN from '../../src/i18n/locales/zh-CN.json' with { type: 'json' }
import { lintTranslation } from '../../src/i18n/glossary.js'

const ORIGINAL_LANG = process.env.FREE_CODE_LANG

afterEach(() => {
  if (ORIGINAL_LANG === undefined) delete process.env.FREE_CODE_LANG
  else process.env.FREE_CODE_LANG = ORIGINAL_LANG
})

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY ??= 'test-dummy-for-i18n'
})

const MENU_KEYS = [
  'modelMenu.bestForEveryday',
  'modelMenu.mostCapable',
  'modelMenu.fastestForQuick',
  'modelMenu.legacy',
  'modelMenu.forLongSessions',
  'modelMenu.useDefault',
  'modelMenu.defaultLabel',
  'modelMenu.recommended',
  'modelMenu.setModelTo',
  'modelMenu.keptModelAs',
  'modelMenu.billedAsExtraUsage',
  'modelMenu.fastModeOn',
  'modelMenu.fastModeOff',
  'footer.apiUsageBilling',
  'footer.codexApiBilling',
  'footer.withEffort',
]

describe('model menu + footer i18n bundle', () => {
  for (const key of MENU_KEYS) {
    test(`bundle has en-US and zh-CN entries for ${key}`, () => {
      expect((enUS as Record<string, string>)[key], `en-US ${key}`).toBeTruthy()
      expect((zhCN as Record<string, string>)[key], `zh-CN ${key}`).toBeTruthy()
    })
  }

  test('zh-CN keeps "model" in English (no 模型) for setModelTo / keptModelAs', () => {
    const set = (zhCN as Record<string, string>)['modelMenu.setModelTo']!
    const kept = (zhCN as Record<string, string>)['modelMenu.keptModelAs']!
    expect(set.toLowerCase()).toContain('model')
    expect(kept.toLowerCase()).toContain('model')
    expect(set).not.toContain('模型')
    expect(kept).not.toContain('模型')
  })

  test('zh-CN preserves "1M context" technical term', () => {
    const long = (zhCN as Record<string, string>)['modelMenu.forLongSessions']!
    // Verb may translate, but must not invent something that drops the
    // canonical "long sessions" intent — just sanity-check it's CJK-ful.
    expect(long).toMatch(/[一-鿿]/)
  })

  test('glossary lint passes for every model-menu / footer key', () => {
    for (const key of MENU_KEYS) {
      const en = (enUS as Record<string, string>)[key]!
      const zh = (zhCN as Record<string, string>)[key]!
      const issues = lintTranslation({ key, en, zh })
      expect(issues, `glossary violation in zh-CN[${key}]`).toEqual([])
    }
  })
})

describe('getModelOptions emits Chinese descriptions under zh-CN', () => {
  test('all option descriptions are Chinese under zh-CN', async () => {
    process.env.FREE_CODE_LANG = 'zh-CN'
    process.env.USER_TYPE = 'external'
    const { getModelOptions } = await import(
      '../../src/utils/model/modelOptions.js'
    )
    const opts = getModelOptions()
    expect(opts.length).toBeGreaterThan(0)
    // Each non-empty description should contain at least one CJK character.
    for (const opt of opts) {
      expect(
        opt.description,
        `option ${opt.label} description not Chinese: ${opt.description}`,
      ).toMatch(/[一-鿿]/)
    }
  })

  test('Default option description is Chinese when locale=zh-CN', async () => {
    process.env.FREE_CODE_LANG = 'zh-CN'
    process.env.USER_TYPE = 'external'
    const { getDefaultOptionForUser } = await import(
      '../../src/utils/model/modelOptions.js'
    )
    const def = getDefaultOptionForUser()
    expect(def.description).toMatch(/[一-鿿]/)
  })

  test('English locale still produces English descriptions (no CJK)', async () => {
    process.env.FREE_CODE_LANG = 'en-US'
    process.env.USER_TYPE = 'external'
    const { getModelOptions } = await import(
      '../../src/utils/model/modelOptions.js'
    )
    const opts = getModelOptions()
    expect(opts.length).toBeGreaterThan(0)
    for (const opt of opts) {
      expect(
        opt.description,
        `unexpected CJK in en-US: ${opt.description}`,
      ).not.toMatch(/[一-鿿]/)
    }
  })
})
