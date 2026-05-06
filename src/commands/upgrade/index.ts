import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../../i18n/translator.js'
import { getSubscriptionType } from '../../utils/auth.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

const upgrade = {
  type: 'local-jsx',
  name: 'upgrade',
  get description() {
    const t = createTranslator(
      resolveLocaleFromEnv(process.env),
      translations,
    )
    return t('command.upgrade.description')
  },
  availability: ['claude-ai'],
  isEnabled: () =>
    !isEnvTruthy(process.env.DISABLE_UPGRADE_COMMAND) &&
    getSubscriptionType() !== 'enterprise',
  load: () => import('./upgrade.js'),
} satisfies Command

export default upgrade
