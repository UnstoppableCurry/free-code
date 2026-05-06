import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const outputStyle = {
  type: 'local-jsx',
  name: 'output-style',
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.outputStyle.description')
  },
  isHidden: true,
  load: () => import('./output-style.js'),
} satisfies Command

export default outputStyle
