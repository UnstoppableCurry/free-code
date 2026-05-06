import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../../i18n/translator.js'

const agents = {
  type: 'local-jsx',
  name: 'agents',
  get description() {
    const t = createTranslator(
      resolveLocaleFromEnv(process.env),
      translations,
    )
    return t('command.agents.description')
  },
  load: () => import('./agents.js'),
} satisfies Command

export default agents
