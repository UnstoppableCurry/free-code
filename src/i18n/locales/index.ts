import type { Translations } from '../translator.js'
import zhCN from './zh-CN.json' with { type: 'json' }
import enUS from './en-US.json' with { type: 'json' }

export const translations: Translations = {
  'zh-CN': zhCN,
  'en-US': enUS,
}
