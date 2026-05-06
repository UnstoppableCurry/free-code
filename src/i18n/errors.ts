import {
  createTranslator,
  resolveLocaleFromEnv,
  type Locale,
  type TranslateFn,
} from './translator.js'
import { translations } from './locales/index.js'

/**
 * Global translator for non-React sites (CLI handlers, throw new Error, etc.).
 *
 * Most user-facing errors live in code that runs outside any I18nProvider, so
 * useT() is unavailable. This module holds a single translator initialized at
 * startup (or lazily from process.env).
 */

let translator: TranslateFn | null = null

/**
 * Initialize once at process startup. Subsequent calls override.
 */
export function initErrorTranslator(locale?: Locale): void {
  const resolved = locale ?? resolveLocaleFromEnv(process.env)
  translator = createTranslator(resolved, translations)
}

/**
 * Reset internal state (testing only).
 */
export function resetErrorTranslator(): void {
  translator = null
}

/**
 * Translate an error key. Lazily initializes from process.env on first use.
 *
 * IMPORTANT: named tError (not errorMessage) to avoid name collision with the
 * upstream src/utils/errors.ts:errorMessage(e: unknown) helper which stringifies
 * an Error object. Several files import both modules; a duplicate name would
 * silently shadow whichever import landed first.
 */
export function tError(
  key: string,
  vars?: Record<string, string | number>,
): string {
  if (!translator) {
    const locale = resolveLocaleFromEnv(process.env)
    translator = createTranslator(locale, translations)
  }
  return translator(key, vars)
}

/**
 * @deprecated Use tError instead. errorMessage was the original export name
 * but it shadowed the upstream errorMessage(Error)→string helper. Kept as an
 * alias for back-compat with already-migrated callers; new code should use
 * tError directly.
 */
export const errorMessage = tError
