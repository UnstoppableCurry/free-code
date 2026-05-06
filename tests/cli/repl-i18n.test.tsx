import { describe, test, expect } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { useT } from '../../src/i18n/context.js'
import { renderWithI18n } from '../../src/i18n/render.js'

// A component that consumes useT() WITHOUT manually wrapping <I18nProvider>.
// Proves the renderWithI18n helper injects the provider for free, which is the
// pattern every CLI handler render site needs in order to safely call useT().
function StartupGreeting() {
  const t = useT()
  return <>{t('startup.greeting')}</>
}

describe('renderWithI18n auto-injects I18nProvider', () => {
  test('useT() works without manual provider when locale=zh-CN', () => {
    const prev = process.env.FREE_CODE_LANG
    process.env.FREE_CODE_LANG = 'zh-CN'
    try {
      const { wrap } = renderWithI18n.harness()
      const { lastFrame } = render(wrap(<StartupGreeting />))
      expect(lastFrame()).toContain('启动中')
    } finally {
      if (prev === undefined) delete process.env.FREE_CODE_LANG
      else process.env.FREE_CODE_LANG = prev
    }
  })

  test('useT() works without manual provider when locale=en-US', () => {
    const prev = process.env.FREE_CODE_LANG
    process.env.FREE_CODE_LANG = 'en-US'
    try {
      const { wrap } = renderWithI18n.harness()
      const { lastFrame } = render(wrap(<StartupGreeting />))
      expect(lastFrame()).toContain('Starting')
    } finally {
      if (prev === undefined) delete process.env.FREE_CODE_LANG
      else process.env.FREE_CODE_LANG = prev
    }
  })

  test('startup.tip is translated to Chinese', () => {
    const prev = process.env.FREE_CODE_LANG
    process.env.FREE_CODE_LANG = 'zh-CN'
    try {
      const { wrap } = renderWithI18n.harness()
      function Tip() {
        const t = useT()
        return <>{t('startup.tip')}</>
      }
      const { lastFrame } = render(wrap(<Tip />))
      expect(lastFrame()).toContain('提示')
      // Technical term 'CLI' must NOT be translated
      expect(lastFrame()).toContain('CLI')
    } finally {
      if (prev === undefined) delete process.env.FREE_CODE_LANG
      else process.env.FREE_CODE_LANG = prev
    }
  })
})
