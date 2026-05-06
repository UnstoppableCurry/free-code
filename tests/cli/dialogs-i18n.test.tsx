import { describe, test, expect } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { I18nProvider } from '../../src/i18n/context.js'
import { translations } from '../../src/i18n/locales/index.js'
import enUS from '../../src/i18n/locales/en-US.json' with { type: 'json' }
import zhCN from '../../src/i18n/locales/zh-CN.json' with { type: 'json' }
import { ApproveApiKey } from '../../src/components/ApproveApiKey.js'
import { IdleReturnDialog } from '../../src/components/IdleReturnDialog.js'
import { TerminalSizeContext } from '../../src/ink/components/TerminalSizeContext.js'

// Dialog uses Divider which calls useTerminalSize(). ink-testing-library doesn't
// mount an Ink <App> context, so we provide a synthetic terminal size here.
function Wrap({
  locale,
  children,
}: {
  locale: 'zh-CN' | 'en-US'
  children: React.ReactNode
}): React.ReactElement {
  return (
    <TerminalSizeContext.Provider value={{ columns: 80, rows: 24 }}>
      <I18nProvider locale={locale} translations={translations}>
        {children}
      </I18nProvider>
    </TerminalSizeContext.Provider>
  )
}

// Required dialog/error keys that must exist in BOTH bundles.
const REQUIRED_KEYS = [
  'dialog.approveApiKey.title',
  'dialog.approveApiKey.question',
  'dialog.approveApiKey.yes',
  'dialog.approveApiKey.noRecommended',
  'dialog.approveApiKey.recommended',
  'dialog.idleReturn.body',
  'dialog.idleReturn.continue',
  'dialog.invalidConfig.title',
  'dialog.invalidConfig.exit',
  'dialog.invalidConfig.reset',
] as const

describe('dialog string i18n bundle coverage', () => {
  for (const key of REQUIRED_KEYS) {
    test(`${key} exists in en-US`, () => {
      expect(
        (enUS as Record<string, string>)[key],
        `missing en-US key ${key}`,
      ).toBeTruthy()
    })
    test(`${key} exists in zh-CN`, () => {
      expect(
        (zhCN as Record<string, string>)[key],
        `missing zh-CN key ${key}`,
      ).toBeTruthy()
    })
  }

  // Glossary spot-checks: technical terms in zh-CN must stay English.
  test('approveApiKey title keeps "API key" English in zh-CN', () => {
    const zh = (zhCN as Record<string, string>)[
      'dialog.approveApiKey.title'
    ]!
    expect(zh.toLowerCase()).toContain('api')
  })

  test('idleReturn body keeps "token" English in zh-CN (core jargon)', () => {
    const zh = (zhCN as Record<string, string>)['dialog.idleReturn.body']!
    expect(zh.toLowerCase()).toContain('token')
    expect(zh).not.toContain('令牌')
  })

  test('invalidConfig title now translates "config" to 配置 in zh-CN', () => {
    const zh = (zhCN as Record<string, string>)[
      'dialog.invalidConfig.title'
    ]!
    expect(zh).toContain('配置')
  })
})

describe('<ApproveApiKey /> renders translated text', () => {
  test('zh-CN renders Chinese question + Yes/No labels', () => {
    const { lastFrame } = render(
      <Wrap locale="zh-CN">
        <ApproveApiKey customApiKeyTruncated="abcd" onDone={() => {}} />
      </Wrap>,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain(zhCN['dialog.approveApiKey.question']!)
    expect(frame).toContain(zhCN['dialog.approveApiKey.yes']!)
  })

  test('en-US renders English question', () => {
    const { lastFrame } = render(
      <Wrap locale="en-US">
        <ApproveApiKey customApiKeyTruncated="abcd" onDone={() => {}} />
      </Wrap>,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain(enUS['dialog.approveApiKey.question']!)
  })
})

describe('<IdleReturnDialog /> renders translated text', () => {
  test('zh-CN renders Chinese body copy', () => {
    const { lastFrame } = render(
      <Wrap locale="zh-CN">
        <IdleReturnDialog
          idleMinutes={10}
          totalInputTokens={1234}
          onDone={() => {}}
        />
      </Wrap>,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain(zhCN['dialog.idleReturn.body']!)
  })

  test('en-US renders English body copy', () => {
    const { lastFrame } = render(
      <Wrap locale="en-US">
        <IdleReturnDialog
          idleMinutes={10}
          totalInputTokens={1234}
          onDone={() => {}}
        />
      </Wrap>,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain(enUS['dialog.idleReturn.body']!)
  })
})
