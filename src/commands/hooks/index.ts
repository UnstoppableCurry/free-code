import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../../i18n/translator.js'

const hooks = {
  type: 'local-jsx',
  name: 'hooks',
  get description() {
    const t = createTranslator(
      resolveLocaleFromEnv(process.env),
      translations,
    )
    return t('command.hooks.description')
  },
  immediate: true,
  load: () => import('./hooks.js'),
} satisfies Command

export default hooks
