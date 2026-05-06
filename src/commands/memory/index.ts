import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../../i18n/translator.js'

const memory: Command = {
  type: 'local-jsx',
  name: 'memory',
  get description() {
    const t = createTranslator(
      resolveLocaleFromEnv(process.env),
      translations,
    )
    return t('command.memory.description')
  },
  load: () => import('./memory.js'),
}

export default memory
