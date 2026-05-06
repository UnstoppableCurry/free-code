import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const theme = {
  type: 'local-jsx',
  name: 'theme',
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.theme.description')
  },
  load: () => import('./theme.js'),
} satisfies Command

export default theme
