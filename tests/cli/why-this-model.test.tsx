// RED: /why-this-model slash command renders recent routing decisions.
import { describe, test, expect, beforeEach } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import {
  recordDecision,
  clearDecisionLog,
} from '../../src/routing/decisionLog.ts'
import { decideModelForRequest } from '../../src/routing/integration.ts'
import { I18nProvider } from '../../src/i18n/context.js'
import { WhyThisModelPanel } from '../../src/commands/why-this-model/panel.tsx'

const dict = {
  'zh-CN': {
    'command.whyThisModel.title': '最近的 model 路由决策',
    'command.whyThisModel.empty': '暂无路由决策记录',
  },
  'en-US': {
    'command.whyThisModel.title': 'Recent model routing decisions',
    'command.whyThisModel.empty': 'No routing decisions recorded yet',
  },
} as const

beforeEach(() => clearDecisionLog())

describe('<WhyThisModelPanel />', () => {
  test('shows empty state in en-US when no decisions', () => {
    const { lastFrame } = render(
      <I18nProvider locale="en-US" translations={dict}>
        <WhyThisModelPanel />
      </I18nProvider>,
    )
    expect(lastFrame()).toContain('No routing decisions recorded yet')
  })

  test('shows empty state in zh-CN when no decisions', () => {
    const { lastFrame } = render(
      <I18nProvider locale="zh-CN" translations={dict}>
        <WhyThisModelPanel />
      </I18nProvider>,
    )
    expect(lastFrame()).toContain('暂无路由决策记录')
  })

  test('lists model id, tier, source for each preloaded decision', () => {
    const d = decideModelForRequest({
      userPromptText: 'please refactor everything',
      historyTurnCount: 3,
      hasImages: false,
      hasTools: false,
      provider: 'anthropic',
      explicitModel: 'claude-opus-4-7',
    })
    recordDecision(d, { provider: 'anthropic' })

    const { lastFrame } = render(
      <I18nProvider locale="en-US" translations={dict}>
        <WhyThisModelPanel />
      </I18nProvider>,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain(d.model.id)
    expect(frame).toContain('heavy')
    expect(frame).toContain('override')
  })

  test('renders zh-CN title when locale is Chinese', () => {
    const d = decideModelForRequest({
      userPromptText: 'hi',
      historyTurnCount: 1,
      hasImages: false,
      hasTools: false,
      provider: 'openai',
      explicitModel: 'gpt-4o',
    })
    recordDecision(d, { provider: 'openai' })

    const { lastFrame } = render(
      <I18nProvider locale="zh-CN" translations={dict}>
        <WhyThisModelPanel />
      </I18nProvider>,
    )
    expect(lastFrame()).toContain('最近的 model 路由决策')
  })
})
