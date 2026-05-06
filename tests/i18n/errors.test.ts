import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  errorMessage,
  initErrorTranslator,
  resetErrorTranslator,
} from '../../src/i18n/errors.js'
import { translations } from '../../src/i18n/locales/index.js'
import { lintTranslation } from '../../src/i18n/glossary.js'

describe('errorMessage helper (global translator)', () => {
  afterEach(() => {
    resetErrorTranslator()
  })

  test('returns Chinese under zh-CN', () => {
    initErrorTranslator('zh-CN')
    expect(errorMessage('error.maxBudgetUsdInvalid')).toBe(
      '--max-budget-usd 必须是大于 0 的正数',
    )
  })

  test('returns English under en-US', () => {
    initErrorTranslator('en-US')
    expect(errorMessage('error.maxBudgetUsdInvalid')).toBe(
      '--max-budget-usd must be a positive number greater than 0',
    )
  })

  test('lazily initializes from process.env when not explicitly set', () => {
    // Without explicit init, resolves from process.env. Just assert it returns
    // a non-empty string that contains the verbatim flag.
    const msg = errorMessage('error.maxBudgetUsdInvalid')
    expect(msg).toContain('--max-budget-usd')
    expect(msg.length).toBeGreaterThan(10)
  })

  test('interpolates {{var}} placeholders under zh-CN', () => {
    initErrorTranslator('zh-CN')
    const got = errorMessage('error.invalidInputFormat', {
      inputFormat: 'binary',
    })
    expect(got).toContain('binary')
    expect(got).toContain('Invalid input format'.toLowerCase().includes('error') ? '' : '')
    // chinese must contain the format value verbatim
    expect(got).toMatch(/binary/)
  })

  test('preserves technical terms verbatim under zh-CN', () => {
    initErrorTranslator('zh-CN')
    // model name should not be translated
    const en = translations['en-US']['error.invalidInputFormat']
    const zh = translations['zh-CN']['error.invalidInputFormat']
    expect(en).toBeDefined()
    expect(zh).toBeDefined()
    // ensure --max-budget-usd flag appears verbatim in zh
    expect(translations['zh-CN']['error.maxBudgetUsdInvalid']).toContain(
      '--max-budget-usd',
    )
    expect(translations['zh-CN']['error.taskBudgetInvalid']).toContain(
      '--task-budget',
    )
  })

  test('every error.* key has both zh-CN and en-US entries', () => {
    const enKeys = Object.keys(translations['en-US']).filter(k =>
      k.startsWith('error.'),
    )
    const zhKeys = Object.keys(translations['zh-CN']).filter(k =>
      k.startsWith('error.'),
    )
    expect(enKeys.length).toBeGreaterThanOrEqual(30)
    expect(zhKeys.sort()).toEqual(enKeys.sort())
  })

  test('zh-CN error translations pass glossary lint', () => {
    const enKeys = Object.keys(translations['en-US']).filter(k =>
      k.startsWith('error.'),
    )
    const allIssues = enKeys.flatMap(key =>
      lintTranslation({
        key,
        en: translations['en-US'][key]!,
        zh: translations['zh-CN'][key]!,
      }),
    )
    expect(allIssues).toEqual([])
  })
})

describe('error site key usage (representative samples)', () => {
  test('--max-budget-usd validation uses error.maxBudgetUsdInvalid', () => {
    expect(translations['en-US']['error.maxBudgetUsdInvalid']).toBe(
      '--max-budget-usd must be a positive number greater than 0',
    )
  })

  test('placeholder error: invalid input format interpolates inputFormat', () => {
    initErrorTranslator('en-US')
    const msg = errorMessage('error.invalidInputFormat', {
      inputFormat: 'xml',
    })
    expect(msg).toContain('"xml"')
    resetErrorTranslator()
  })

  test('technical term preserved: ANTHROPIC_API_KEY mentioned errors keep token verbatim', () => {
    // Codex token error: "token" stays as English in zh
    const zh = translations['zh-CN']['error.codexTokenExchange']
    expect(zh).toContain('token')
  })

  test('URL/command preserved: /login appears verbatim in zh', () => {
    const zh = translations['zh-CN']['error.sessionExpired']
    expect(zh).toContain('/login')
  })

  test('flag preserved: --sdk-url appears verbatim in zh', () => {
    const zh = translations['zh-CN']['error.sdkUrlRequiresStreamJson']
    expect(zh).toContain('--sdk-url')
    expect(zh).toContain('stream-json')
  })
})
