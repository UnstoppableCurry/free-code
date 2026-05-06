import { getIsRemoteMode } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const session = {
  type: 'local-jsx',
  name: 'session',
  aliases: ['remote'],
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.session.description')
  },
  isEnabled: () => getIsRemoteMode(),
  get isHidden() {
    return !getIsRemoteMode()
  },
  load: () => import('./session.js'),
} satisfies Command

export default session
