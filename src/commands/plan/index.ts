import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const plan = {
  type: 'local-jsx',
  name: 'plan',
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.plan.description')
  },
  argumentHint: '[open|<description>]',
  load: () => import('./plan.js'),
} satisfies Command

export default plan
