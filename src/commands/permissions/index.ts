import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const permissions = {
  type: 'local-jsx',
  name: 'permissions',
  aliases: ['allowed-tools'],
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.permissions.description')
  },
  load: () => import('./permissions.js'),
} satisfies Command

export default permissions
