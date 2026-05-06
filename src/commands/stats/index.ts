import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const stats = {
  type: 'local-jsx',
  name: 'stats',
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.stats.description')
  },
  load: () => import('./stats.js'),
} satisfies Command

export default stats
