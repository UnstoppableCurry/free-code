import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const files = {
  type: 'local',
  name: 'files',
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.files.description')
  },
  isEnabled: () => process.env.USER_TYPE === 'ant',
  supportsNonInteractive: true,
  load: () => import('./files.js'),
} satisfies Command

export default files
