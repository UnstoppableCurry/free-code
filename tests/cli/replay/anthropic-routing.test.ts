/**
 * Anthropic-path routing banner — covers Phase B's last gap.
 *
 * Previously the routing layer (registry + heuristics + banner + decision log)
 * only fired in the OpenAI dispatch path. The Anthropic SDK path bypassed it.
 * This scenario flips USE_OPENAI off so the request goes through the
 * Anthropic SDK against the relay's /anthropic endpoint, and asserts the
 * banner appears just like it does on the OpenAI side.
 *
 * Skipped only when no relay key is present.
 */

import { describe, expect, test } from 'bun:test'

import { runLiveConversation, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

describeLive('live conversation — Anthropic path emits routing banner', () => {
  test(
    'banner shows on stderr for a registered Anthropic model id',
    async () => {
      const result = await runLiveConversation({
        locale: 'zh-CN',
        // Registered in src/routing/registry.ts under provider:'anthropic'.
        // The relay's /anthropic endpoint accepts this id transparently.
        model: 'claude-sonnet-4-6',
        // useOpenAIPath omitted — defaults to false, so we go through the
        // existing Anthropic SDK code path with our new in-line routing call.
        conversation: [{ userInput: '请用一句中文打招呼即可。', timeoutMs: 90_000 }],
      })

      const step = result.steps[0]!
      expect(step.exitCode).toBe(0)

      // Banner contract identical to the OpenAI path.
      expect(step.stderr).toContain('使用 model')
      expect(step.stderr).toContain('claude-sonnet-4-6')
      expect(step.stderr).toContain('档')
      expect(step.stderr).not.toContain('using model')

      // eslint-disable-next-line no-console
      console.log('[anthropic-routing] stderr =', step.stderr.split('\n')[0])
    },
    180_000,
  )
})
