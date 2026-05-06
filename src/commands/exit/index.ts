import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../../i18n/translator.js'

const exit = {
  type: 'local-jsx',
  name: 'exit',
  aliases: ['quit'],
  get description() {
    const t = createTranslator(
      resolveLocaleFromEnv(process.env),
      translations,
    )
    return t('command.exit.description')
  },
  immediate: true,
  load: () => import('./exit.js'),
} satisfies Command

export default exit
