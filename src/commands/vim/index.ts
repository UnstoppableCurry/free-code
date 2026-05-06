import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const command = {
  name: 'vim',
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.vim.description')
  },
  supportsNonInteractive: false,
  type: 'local',
  load: () => import('./vim.js'),
} satisfies Command

export default command
