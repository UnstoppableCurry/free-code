export type Locale = 'zh-CN' | 'en-US'

export type TranslationDict = Record<string, string>

export type Translations = Record<Locale, TranslationDict>

export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string

const FALLBACK_LOCALE: Locale = 'en-US'

export function createTranslator(
  locale: Locale,
  translations: Translations,
): TranslateFn {
  return (key, vars) => {
    const primary = translations[locale]?.[key]
    const fallback = translations[FALLBACK_LOCALE]?.[key]
    const template = primary ?? fallback ?? key
    return interpolate(template, vars)
  }
}

function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
    return name in vars ? String(vars[name]) : match
  })
}

export function resolveLocaleFromEnv(
  env: Record<string, string | undefined>,
): Locale {
  const explicit = env.FREE_CODE_LANG
  if (explicit) return normalizeLocale(explicit)
  const lang = env.LANG ?? env.LC_ALL ?? env.LC_MESSAGES
  if (lang) return normalizeLocale(lang)
  return FALLBACK_LOCALE
}

function normalizeLocale(raw: string): Locale {
  const lower = raw.toLowerCase()
  if (lower.startsWith('zh')) return 'zh-CN'
  return 'en-US'
}
