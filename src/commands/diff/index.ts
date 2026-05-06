import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

export default {
  type: 'local-jsx',
  name: 'diff',
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.diff.description')
  },
  load: () => import('./diff.js'),
} satisfies Command
