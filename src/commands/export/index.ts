import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const exportCommand = {
  type: 'local-jsx',
  name: 'export',
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.export.description')
  },
  argumentHint: '[filename]',
  load: () => import('./export.js'),
} satisfies Command

export default exportCommand
