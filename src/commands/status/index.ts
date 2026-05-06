import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../../i18n/translator.js'

const status = {
  type: 'local-jsx',
  name: 'status',
  get description() {
    const t = createTranslator(
      resolveLocaleFromEnv(process.env),
      translations,
    )
    return t('command.status.description')
  },
  immediate: true,
  load: () => import('./status.js'),
} satisfies Command

export default status
