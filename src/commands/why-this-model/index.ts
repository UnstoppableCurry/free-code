/**
 * /why-this-model — show the last N routing decisions.
 *
 * local-jsx command (renders an Ink panel) so the user can see the model id,
 * tier, source and per-decision reasons in a structured layout.
 */
import React from 'react'
import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../../i18n/translator.js'
import { I18nProvider } from '../../i18n/context.js'
import { WhyThisModelPanel } from './panel.js'

const whyThisModel = {
  type: 'local-jsx',
  name: 'why-this-model',
  get description() {
    const t = createTranslator(
      resolveLocaleFromEnv(process.env),
      translations,
    )
    return t('command.whyThisModel.description')
  },
  isHidden: false,
  load: async () => ({
    call: async (onDone: (r?: string) => void) => {
      const locale = resolveLocaleFromEnv(process.env)
      // Render with a one-shot completion when the user dismisses; the panel
      // itself is read-only, so onDone fires immediately on the next tick to
      // keep the REPL responsive.
      setTimeout(() => onDone(), 0)
      return React.createElement(
        I18nProvider,
        { locale, translations },
        React.createElement(WhyThisModelPanel),
      )
    },
  }),
} satisfies Command

export default whyThisModel
