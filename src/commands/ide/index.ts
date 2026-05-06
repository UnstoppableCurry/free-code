import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../../i18n/translator.js'

const ide = {
  type: 'local-jsx',
  name: 'ide',
  get description() {
    const t = createTranslator(
      resolveLocaleFromEnv(process.env),
      translations,
    )
    return t('command.ide.description')
  },
  argumentHint: '[open]',
  load: () => import('./ide.js'),
} satisfies Command

export default ide
