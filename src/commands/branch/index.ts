import { feature } from 'src/utils/featureFlag.js'
import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const branch = {
  type: 'local-jsx',
  name: 'branch',
  // 'fork' alias only when /fork doesn't exist as its own command
  aliases: feature('FORK_SUBAGENT') ? [] : ['fork'],
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.branch.description')
  },
  argumentHint: '[name]',
  load: () => import('./branch.js'),
} satisfies Command

export default branch
