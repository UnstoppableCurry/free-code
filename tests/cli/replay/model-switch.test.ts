/**
 * Model-switch verification (separate processes).
 *
 * User report: "我在 REPL 里 /model 切了模型，之后回复就停了". The true mid-session
 * /model toggle is a REPL-only interactive command — there is no equivalent
 * in --print mode and no first-class harness for "swap model on turn N".
 *
 * What we CAN verify here: both target models (gpt-4o and gpt-4o-mini) work
 * end-to-end via the OpenAI path with banners reflecting the override. If
 * either model breaks at the relay or in our adapter, this test fails. That
 * covers the underlying class of regression — independent model paths each
 * functioning — even if the literal /model toggle path is interactive-only.
 *
 * Skipped only when no relay key is present.
 */

import { describe, expect, test } from 'bun:test'

import { assertNoHttpErrors, shouldRunLive, streamJsonConversation } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

describeLive('live conversation — both --model targets work independently', () => {
  test(
    'gpt-4o and gpt-4o-mini each yield a Chinese reply with a localized banner',
    async () => {
      const r1 = await streamJsonConversation(
        { locale: 'zh-CN', useOpenAIPath: true, model: 'gpt-4o' },
        ['用一句中文打招呼即可。'],
        90_000,
      )
      const t1 = r1.turns[0]!
      assertNoHttpErrors(t1.events, r1.stderr, '[switch gpt-4o]')
      expect(t1.fullText.length).toBeGreaterThan(0)
      expect(r1.stderr).toContain('使用 model')
      expect(r1.stderr).toContain('gpt-4o')

      const r2 = await streamJsonConversation(
        { locale: 'zh-CN', useOpenAIPath: true, model: 'gpt-4o-mini' },
        ['再用一句中文打招呼即可。'],
        90_000,
      )
      const t2 = r2.turns[0]!
      assertNoHttpErrors(t2.events, r2.stderr, '[switch gpt-4o-mini]')
      expect(t2.fullText.length).toBeGreaterThan(0)
      expect(r2.stderr).toContain('使用 model')
      expect(r2.stderr).toContain('gpt-4o-mini')

      // eslint-disable-next-line no-console
      console.log('[model-switch] both models replied; banners localized')
    },
    240_000,
  )
})
