/**
 * Copy command - minimal metadata only.
 * Implementation is lazy-loaded from copy.tsx to reduce startup time.
 */
import type { Command } from '../../commands.js'
import { translations } from '../../i18n/locales/index.js'
import { createTranslator, resolveLocaleFromEnv } from '../../i18n/translator.js'

const copy = {
  type: 'local-jsx',
  name: 'copy',
  get description() {
    return createTranslator(resolveLocaleFromEnv(process.env), translations)('command.copy.description')
  },
  load: () => import('./copy.js'),
} satisfies Command

export default copy
