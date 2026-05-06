import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const addDir = {
  type: 'local-jsx',
  name: 'add-dir',
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.addDir.description')
  },
  argumentHint: '<path>',
  load: () => import('./add-dir.js'),
} satisfies Command

export default addDir
