/**
 * Cross-process state isolation regression.
 *
 * Turn 1 with an unknown --model triggers the soft-override silent
 * pass-through path (no banner, no decision log entry). The relay leniently
 * answers anyway. Turn 2 in a SEPARATE process with a valid registered
 * --model must produce a clean banner — proving no sticky state leaks
 * between invocations and the routing layer correctly identifies the
 * registered model on a fresh start.
 *
 * Skipped only when no relay key is present.
 */

import { describe, expect, test } from 'bun:test'

import { assertNoHttpErrors, runLiveConversation, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

describeLive('live conversation — soft-override then valid model', () => {
  test(
    'after an unknown-model run, a follow-up with a registered model emits a clean banner',
    async () => {
      // Turn 1: bogus id → silent pass-through, no banner.
      const bad = await runLiveConversation({
        locale: 'zh-CN',
        model: 'totally-fake-model-9000',
        useOpenAIPath: true,
        conversation: [{ userInput: '你好', timeoutMs: 30_000 }],
      })
      const badStep = bad.steps[0]!
      expect(badStep.exitCode).toBe(0)
      expect(badStep.stderr).not.toContain('使用 model')

      // Turn 2: valid registered model → fresh process, banner appears,
      // no HTTP errors.
      const good = await runLiveConversation({
        locale: 'zh-CN',
        model: 'gpt-4o',
        useOpenAIPath: true,
        conversation: [{ userInput: '请用一句话回复', timeoutMs: 90_000 }],
      })
      const goodStep = good.steps[0]!
      assertNoHttpErrors(goodStep.events, goodStep.stderr, '[recovery]')
      expect(goodStep.exitCode).toBe(0)
      expect(goodStep.fullText.length).toBeGreaterThan(0)
      expect(goodStep.stderr).toContain('使用 model')
      expect(goodStep.stderr).toContain('gpt-4o')

      // eslint-disable-next-line no-console
      console.log(
        '[recovery] bogus-no-banner=',
        !badStep.stderr.includes('使用 model'),
        'good banner=',
        goodStep.stderr.slice(0, 80),
      )
    },
    180_000,
  )
})
