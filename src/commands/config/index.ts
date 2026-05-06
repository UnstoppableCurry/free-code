import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../../i18n/translator.js'

const config = {
  aliases: ['settings'],
  type: 'local-jsx',
  name: 'config',
  get description() {
    const t = createTranslator(
      resolveLocaleFromEnv(process.env),
      translations,
    )
    return t('command.config.description')
  },
  load: () => import('./config.js'),
} satisfies Command

export default config
