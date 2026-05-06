import React, { createContext, useContext, useMemo } from 'react'
import {
  createTranslator,
  type Locale,
  type TranslateFn,
  type Translations,
} from './translator.js'

const I18nContext = createContext<TranslateFn | null>(null)

export function I18nProvider(props: {
  locale: Locale
  translations: Translations
  children: React.ReactNode
}) {
  const t = useMemo(
    () => createTranslator(props.locale, props.translations),
    [props.locale, props.translations],
  )
  return (
    <I18nContext.Provider value={t}>{props.children}</I18nContext.Provider>
  )
}

export function useT(): TranslateFn {
  const t = useContext(I18nContext)
  if (!t) {
    throw new Error('useT must be used inside <I18nProvider>')
  }
  return t
}
