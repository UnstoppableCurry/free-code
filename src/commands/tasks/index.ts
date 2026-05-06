import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const tasks = {
  type: 'local-jsx',
  name: 'tasks',
  aliases: ['bashes'],
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.tasks.description')
  },
  load: () => import('./tasks.js'),
} satisfies Command

export default tasks
