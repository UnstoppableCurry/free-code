import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../../i18n/translator.js'

export default {
  type: 'local-jsx',
  name: 'usage',
  get description() {
    const t = createTranslator(
      resolveLocaleFromEnv(process.env),
      translations,
    )
    return t('command.usage.description')
  },
  availability: ['claude-ai'],
  load: () => import('./usage.js'),
} satisfies Command
