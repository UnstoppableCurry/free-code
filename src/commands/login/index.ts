import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../../i18n/translator.js'
import { hasAnthropicApiKeyAuth } from '../../utils/auth.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

export default () => {
  const t = createTranslator(
    resolveLocaleFromEnv(process.env),
    translations,
  )
  return {
    type: 'local-jsx',
    name: 'login',
    description: hasAnthropicApiKeyAuth()
      ? t('command.login.description.switch')
      : t('command.login.description'),
    isEnabled: () => !isEnvTruthy(process.env.DISABLE_LOGIN_COMMAND),
    load: () => import('./login.js'),
  } satisfies Command
}
