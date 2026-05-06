/**
 * Unknown-model soft-override regression.
 *
 * Behavior contract (per claude-openai.ts soft-override design):
 *   - User passes --model <unknown-id>: NOT in our registry, NOT a registered
 *     family. RoutingError is caught silently inside queryModelOpenAI; the id
 *     is passed through to the relay as-is, no banner emitted, no decision log
 *     entry recorded.
 *   - The convertmodel.net relay is lenient and answers anyway with some
 *     default model. So the CLI MUST NOT crash, MUST NOT hang, and MUST
 *     return cleanly with exit=0 (the run succeeded, even if the routing
 *     module didn't recognise the id).
 *   - The localized banner '→ 使用 model …（auto/override: …档）' MUST NOT
 *     appear, because the router didn't decide anything.
 *
 * If we ever tighten the soft-override to throw on unknown id, this test
 * inverts naturally — flip the assertions.
 *
 * Skipped only when no relay key is present.
 */

import { describe, expect, test } from 'bun:test'

import { runLiveConversation, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

describeLive('live conversation — unknown model id silent pass-through', () => {
  test(
    'CLI does not crash, does not hang, and emits NO routing banner for unknown ids',
    async () => {
      const result = await runLiveConversation({
        locale: 'zh-CN',
        model: 'nonexistent-model-9999',
        useOpenAIPath: true,
        conversation: [{ userInput: '你好', timeoutMs: 30_000 }],
      })

      const step = result.steps[0]!
      // No crash, no hang.
      expect(step.exitCode).toBe(0)
      expect(step.durationMs).toBeLessThan(30_000)

      // Soft override: no banner appears for unrecognised ids.
      expect(step.stderr).not.toContain('使用 model')
      expect(step.stderr).not.toContain('using model')

      // Run must still produce SOME assistant output (relay leniency).
      const types = step.events.map(e => e.type)
      expect(types).toContain('assistant')
      expect(types).toContain('result')

      // eslint-disable-next-line no-console
      console.log('[unknown-model] exit=', step.exitCode, 'duration=', step.durationMs)
    },
    60_000,
  )
})
