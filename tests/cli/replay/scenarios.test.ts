/**
 * Live conversation scenarios — opt-in integration tests.
 *
 * Skipped by default. Enable with:
 *
 *   RUN_LIVE_TESTS=1 \
 *     ANTHROPIC_BASE_URL=https://convertmodel.net/anthropic \
 *     ANTHROPIC_AUTH_TOKEN=sk-... \
 *     OPENAI_BASE_URL=https://convertmodel.net \
 *     OPENAI_API_KEY=sk-... \
 *     FREE_CODE_MULTI_PROVIDER_NORMALIZED=1 \
 *     CLAUDE_CODE_USE_OPENAI=1 \
 *     FREE_CODE_LANG=zh-CN \
 *     bun test tests/cli/replay/scenarios.test.ts
 */

import { describe, expect, test } from 'bun:test'

import { runLiveConversation, shouldRunLive, streamJsonConversation } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'

describeLive('live conversation — Chinese single turn', () => {
  test(
    'Single-turn Chinese hello produces system → assistant → result frames',
    async () => {
      const result = await runLiveConversation({
        locale: 'zh-CN',
        model: MODEL,
        useOpenAIPath: true,
        conversation: [
          {
            userInput: '你好，请用一句话自我介绍',
            timeoutMs: 90_000,
          },
        ],
      })

      const step = result.steps[0]!
      // The CLI must terminate cleanly.
      expect(step.exitCode).toBe(0)

      // Frames we expect: system init, at least one assistant, and a final result.
      const types = step.events.map(e => e.type)
      expect(types).toContain('system')
      expect(types).toContain('assistant')
      expect(types).toContain('result')

      // The assembled assistant text must be non-empty.
      expect(step.fullText.length).toBeGreaterThan(0)

      // The final `result` envelope must signal success.
      const resultEvent = step.events.find(e => e.type === 'result') as
        | { is_error?: boolean }
        | undefined
      expect(resultEvent).toBeDefined()
      expect(resultEvent?.is_error).toBe(false)

      // Surface the captured frames so the failing-test diff is useful.
      // eslint-disable-next-line no-console
      console.log('[scenario] event types =', types)
      // eslint-disable-next-line no-console
      console.log('[scenario] fullText =', step.fullText.slice(0, 400))
    },
    120_000,
  )
})

describeLive('live conversation — two-turn memory probe', () => {
  test(
    'Turn 2 references the name set in turn 1 via stream-json multi-turn',
    async () => {
      // Use stream-json stdin pipe (single process, multi-turn) instead of
      // --session-id resume — the latter relies on disk session persistence
      // which doesn't reliably exist across host/VM environments.
      const result = await streamJsonConversation(
        { locale: 'zh-CN', model: MODEL, useOpenAIPath: true },
        [
          '我叫小明，请记住我的名字，并用一句话回复确认',
          '我刚才告诉你的名字是什么？只回答名字本身',
        ],
        90_000,
      )

      const turn2 = result.turns[1]!
      expect(turn2).toBeDefined()
      expect(turn2.fullText).toContain('小明')
    },
    240_000,
  )
})
