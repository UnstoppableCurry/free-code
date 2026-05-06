import { describe, test, expect, beforeEach } from 'bun:test'
import { createTranslator, type Locale } from '../../src/i18n/translator.js'

describe('translator', () => {
  test('returns Chinese string when locale=zh-CN', () => {
    const t = createTranslator('zh-CN', {
      'zh-CN': { 'cli.welcome': '欢迎使用 free-code' },
      'en-US': { 'cli.welcome': 'Welcome to free-code' },
    })
    expect(t('cli.welcome')).toBe('欢迎使用 free-code')
  })

  test('returns English string when locale=en-US', () => {
    const t = createTranslator('en-US', {
      'zh-CN': { 'cli.welcome': '欢迎使用 free-code' },
      'en-US': { 'cli.welcome': 'Welcome to free-code' },
    })
    expect(t('cli.welcome')).toBe('Welcome to free-code')
  })

  test('falls back to en-US when key missing in current locale', () => {
    const t = createTranslator('zh-CN', {
      'zh-CN': {},
      'en-US': { 'cli.welcome': 'Welcome' },
    })
    expect(t('cli.welcome')).toBe('Welcome')
  })

  test('returns key itself when missing in all locales', () => {
    const t = createTranslator('zh-CN', { 'zh-CN': {}, 'en-US': {} })
    expect(t('missing.key')).toBe('missing.key')
  })

  test('interpolates {{var}} placeholders', () => {
    const t = createTranslator('zh-CN', {
      'zh-CN': { 'cli.tokens': '已使用 {{used}} token，剩余 {{remaining}}' },
      'en-US': { 'cli.tokens': 'Used {{used}} tokens, {{remaining}} remaining' },
    })
    expect(t('cli.tokens', { used: '1.2K', remaining: '8.8K' })).toBe(
      '已使用 1.2K token，剩余 8.8K',
    )
  })

  test('preserves technical terms in placeholders (no auto-translate)', () => {
    const t = createTranslator('zh-CN', {
      'zh-CN': { 'cli.using_model': '正在使用 model {{model}}' },
      'en-US': { 'cli.using_model': 'Using model {{model}}' },
    })
    expect(t('cli.using_model', { model: 'claude-opus-4-7' })).toBe(
      '正在使用 model claude-opus-4-7',
    )
  })
})

describe('locale resolution', () => {
  test('resolveLocaleFromEnv detects zh from LANG=zh_CN.UTF-8', async () => {
    const { resolveLocaleFromEnv } = await import(
      '../../src/i18n/translator.js'
    )
    expect(resolveLocaleFromEnv({ LANG: 'zh_CN.UTF-8' })).toBe('zh-CN')
    expect(resolveLocaleFromEnv({ LANG: 'en_US.UTF-8' })).toBe('en-US')
    expect(resolveLocaleFromEnv({})).toBe('en-US')
    expect(resolveLocaleFromEnv({ FREE_CODE_LANG: 'zh-CN' })).toBe('zh-CN')
  })

  test('FREE_CODE_LANG overrides LANG', async () => {
    const { resolveLocaleFromEnv } = await import(
      '../../src/i18n/translator.js'
    )
    expect(
      resolveLocaleFromEnv({ LANG: 'en_US.UTF-8', FREE_CODE_LANG: 'zh-CN' }),
    ).toBe('zh-CN')
  })
})
