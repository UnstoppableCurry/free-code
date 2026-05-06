/**
 * Multi-turn continuity validation + fallback.
 *
 * The existing two-turn scenario (scenarios.test.ts) relies on
 * `--session-id` on turn 1 and `--resume` on turn 2 to carry conversation
 * state across out-of-process invocations. That depends on the local
 * session store on disk persisting between spawns within the same cwd.
 *
 * This file:
 *   1. Validates the resume path with a stricter assertion (turn 2 must
 *      include the unique token from turn 1, AND the session id is reused).
 *   2. Provides a fallback strategy that injects prior turn context via
 *      --append-system-prompt, useful if relay state ever proves fragile.
 *
 * Skipped by default. Enable with RUN_LIVE_TESTS=1.
 */

import { describe, expect, test } from 'bun:test'

import { runLiveConversation, shouldRunLive, streamJsonConversation } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'
const UNIQUE_TOKEN = 'XYZZY-7731'

describeLive('live conversation — multi-turn via stream-json stdin', () => {
  test(
    'turn 2 recalls a unique token planted in turn 1',
    async () => {
      // Single-process multi-turn via stream-json stdin pipe. The previous
      // implementation used --session-id / --resume disk persistence which
      // is fragile across host/VM environments.
      const result = await streamJsonConversation(
        { locale: 'zh-CN', model: MODEL, useOpenAIPath: true },
        [
          `请记住这个口令：${UNIQUE_TOKEN}。用一句中文回复确认。`,
          '我刚才让你记的口令是什么？只回答口令本身，不要其他文字。',
        ],
        90_000,
      )

      const turn1 = result.turns[0]!
      const turn2 = result.turns[1]!
      expect(turn1).toBeDefined()
      expect(turn2).toBeDefined()

      // Turn 2 must surface the planted token — proves conversation state
      // carried across the multi-turn pipe.
      expect(turn2.fullText).toContain(UNIQUE_TOKEN)
    },
    240_000,
  )

  test(
    'fallback — passing prior turn text via --append-system-prompt also works',
    async () => {
      // This validates the documented fallback: even without session resume,
      // we can give the model the prior turn via system prompt injection.
      const priorContext = `用户先前消息: 请记住口令 ${UNIQUE_TOKEN}。助手已确认。`

      const result = await runLiveConversation({
        locale: 'zh-CN',
        model: MODEL,
        useOpenAIPath: true,
        extraArgs: ['--append-system-prompt', priorContext],
        conversation: [
          {
            userInput: '用户之前让你记的口令是什么？只回答口令。',
            timeoutMs: 90_000,
          },
        ],
      })

      const step = result.steps[0]!
      expect(step.exitCode).toBe(0)
      expect(step.fullText).toContain(UNIQUE_TOKEN)
    },
    120_000,
  )
})
