import React, { type ReactNode } from 'react'
import { I18nProvider } from './context.js'
import { translations } from './locales/index.js'
import { resolveLocaleFromEnv, type Locale } from './translator.js'

/**
 * Wrap a React tree with <I18nProvider> using the locale resolved from
 * process.env (FREE_CODE_LANG / LANG / LC_ALL / LC_MESSAGES).
 *
 * The Ink shim in src/ink.ts already routes every render() and createRoot()
 * call through this wrapper, so handler files calling root.render(<X/>) get
 * I18n for free. This helper exists so direct, non-shim consumers (e.g.
 * standalone entrypoints, tests, future code that imports raw 'ink') can opt
 * into the same wrapping with one call.
 */
export function withI18n(node: ReactNode, locale?: Locale): ReactNode {
  const resolved = locale ?? resolveLocaleFromEnv(process.env)
  return (
    <I18nProvider locale={resolved} translations={translations}>
      {node}
    </I18nProvider>
  )
}

type Harness = {
  /** Wrap an element with <I18nProvider> using the current process.env locale. */
  wrap: (node: ReactNode) => ReactNode
}

/**
 * Convenience for use with raw ink / ink-testing-library renderers that don't
 * route through src/ink.ts (so they can't auto-inject the provider). Returns
 * a `wrap` function that re-resolves locale at call time.
 */
function harness(): Harness {
  return {
    wrap: node => withI18n(node),
  }
}

/**
 * `renderWithI18n(element, options?)` — convenience wrapper around the Ink
 * shim's render() that explicitly opts in to <I18nProvider>. Identical to
 * calling render() from src/ink.ts since that path already wraps with the
 * provider; provided as a named, discoverable helper for new code.
 */
export async function renderWithI18n(
  node: ReactNode,
  options?: Parameters<typeof import('../ink.js').render>[1],
) {
  const { render } = await import('../ink.js')
  // src/ink.ts already wraps with <I18nProvider>; pass the raw node through.
  return render(node, options)
}

renderWithI18n.harness = harness
renderWithI18n.withI18n = withI18n
