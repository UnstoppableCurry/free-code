import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const tag = {
  type: 'local-jsx',
  name: 'tag',
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.tag.description')
  },
  isEnabled: () => process.env.USER_TYPE === 'ant',
  argumentHint: '<tag-name>',
  load: () => import('./tag.js'),
} satisfies Command

export default tag
