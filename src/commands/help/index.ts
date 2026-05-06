import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../../i18n/translator.js'

const help = {
  type: 'local-jsx',
  name: 'help',
  get description() {
    const t = createTranslator(
      resolveLocaleFromEnv(process.env),
      translations,
    )
    return t('command.help.description')
  },
  load: () => import('./help.js'),
} satisfies Command

export default help
