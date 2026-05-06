import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const btw = {
  type: 'local-jsx',
  name: 'btw',
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.btw.description')
  },
  immediate: true,
  argumentHint: '<question>',
  load: () => import('./btw.js'),
} satisfies Command

export default btw
