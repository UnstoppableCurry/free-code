import { describe, test, expect } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { I18nProvider } from '../../src/i18n/context.js'
import { WelcomeBanner } from '../../src/components/WelcomeBanner.js'

const dict = {
  'zh-CN': {
    'welcome.title': '欢迎使用 free-code',
    'welcome.subtitle': '当前 model: {{model}}',
  },
  'en-US': {
    'welcome.title': 'Welcome to free-code',
    'welcome.subtitle': 'Current model: {{model}}',
  },
} as const

describe('<WelcomeBanner /> renders translated text', () => {
  test('renders Chinese title when locale=zh-CN', () => {
    const { lastFrame } = render(
      <I18nProvider locale="zh-CN" translations={dict}>
        <WelcomeBanner model="claude-sonnet-4-6" />
      </I18nProvider>,
    )
    expect(lastFrame()).toContain('欢迎使用 free-code')
  })

  test('renders English title when locale=en-US', () => {
    const { lastFrame } = render(
      <I18nProvider locale="en-US" translations={dict}>
        <WelcomeBanner model="claude-sonnet-4-6" />
      </I18nProvider>,
    )
    expect(lastFrame()).toContain('Welcome to free-code')
  })

  test('preserves model name as English in Chinese subtitle', () => {
    const { lastFrame } = render(
      <I18nProvider locale="zh-CN" translations={dict}>
        <WelcomeBanner model="claude-opus-4-7" />
      </I18nProvider>,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('当前 model: claude-opus-4-7')
    // Technical term 'model' must NOT be rendered as 模型
    expect(frame).not.toContain('模型')
  })

  test('renders model name unchanged regardless of locale', () => {
    const zh = render(
      <I18nProvider locale="zh-CN" translations={dict}>
        <WelcomeBanner model="gpt-4o" />
      </I18nProvider>,
    )
    const en = render(
      <I18nProvider locale="en-US" translations={dict}>
        <WelcomeBanner model="gpt-4o" />
      </I18nProvider>,
    )
    expect(zh.lastFrame()).toContain('gpt-4o')
    expect(en.lastFrame()).toContain('gpt-4o')
  })
})
