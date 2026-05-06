#!/usr/bin/env bun
import React from 'react'
import { render } from 'ink'
import { I18nProvider } from '../i18n/context.js'
import { resolveLocaleFromEnv } from '../i18n/translator.js'
import { WelcomeBanner } from '../components/WelcomeBanner.js'
import { translations } from '../i18n/locales/index.js'

function parseModelArg(argv: string[]): string {
  const idx = argv.indexOf('--model')
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]
  return 'claude-sonnet-4-6'
}

const locale = resolveLocaleFromEnv(process.env)
const model = parseModelArg(process.argv.slice(2))

const { unmount, waitUntilExit } = render(
  <I18nProvider locale={locale} translations={translations}>
    <WelcomeBanner model={model} />
  </I18nProvider>,
)

// Static, non-interactive demo — render once and exit.
setImmediate(() => unmount())
await waitUntilExit()
