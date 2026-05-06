import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../../i18n/translator.js'

const skills = {
  type: 'local-jsx',
  name: 'skills',
  get description() {
    const t = createTranslator(
      resolveLocaleFromEnv(process.env),
      translations,
    )
    return t('command.skills.description')
  },
  load: () => import('./skills.js'),
} satisfies Command

export default skills
