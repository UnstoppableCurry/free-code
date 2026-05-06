import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const heapDump = {
  type: 'local',
  name: 'heapdump',
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.heapdump.description')
  },
  isHidden: true,
  supportsNonInteractive: true,
  load: () => import('./heapdump.js'),
} satisfies Command

export default heapDump
