import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const rename = {
  type: 'local-jsx',
  name: 'rename',
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.rename.description')
  },
  immediate: true,
  argumentHint: '[name]',
  load: () => import('./rename.js'),
} satisfies Command

export default rename
