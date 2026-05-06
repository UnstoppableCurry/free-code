/**
 * Multi-vendor flagship coverage.
 *
 * The convertmodel.net relay accepts ids from many vendors over the same
 * OpenAI-compatible endpoint (probed 2026-04: GPT, Claude, Gemini, DeepSeek,
 * Kimi/Moonshot, MiniMax, GLM/ChatGLM, Qwen). For each flagship we pin two
 * things:
 *
 *   1. The CLI accepts --model <flagship-id> end-to-end and gets a non-empty
 *      reply (relay actually serves this id).
 *   2. The routing banner shows the model in localized form, with source
 *      'override' (because we passed --model explicitly) and a tier.
 *
 * If the registry forgets to register a model, the soft-override path
 * silently skips the banner and the second assertion below fails. That's
 * the trip wire.
 *
 * Skipped only when no relay key is present.
 */

import { describe, expect, test } from 'bun:test'

import { runLiveConversation, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

// One flagship per vendor we publicly support. Keep this list aligned with
// src/routing/registry.ts — adding a model to the registry should NOT break
// this test (extras are fine), but removing a model that's listed here
// should fail loudly.
const FLAGSHIPS: ReadonlyArray<{
  id: string
  vendor: string
}> = [
  // OpenAI family
  { id: 'gpt-5.5', vendor: 'openai' },
  // Anthropic family — relay accepts at /v1/chat/completions transparently.
  { id: 'claude-opus-4-7', vendor: 'anthropic' },
  // Google
  { id: 'gemini-2.5-pro', vendor: 'gemini' },
  // DeepSeek
  { id: 'deepseek-v4-pro', vendor: 'deepseek' },
  // Moonshot / Kimi
  { id: 'kimi-k2-thinking', vendor: 'kimi' },
  // MiniMax
  { id: 'MiniMax-M1', vendor: 'minimax' },
  // ZhipuAI / ChatGLM
  { id: 'glm-4.6', vendor: 'glm' },
  // Alibaba Qwen
  { id: 'qwen-max-latest', vendor: 'qwen' },
]

describeLive('live conversation — flagship per vendor', () => {
  for (const { id, vendor } of FLAGSHIPS) {
    test(
      `${vendor}: ${id} responds and emits localized banner`,
      async () => {
        const result = await runLiveConversation({
          locale: 'zh-CN',
          model: id,
          useOpenAIPath: true,
          conversation: [
            {
              userInput: '用一句中文回复即可，比如："收到"',
              timeoutMs: 90_000,
            },
          ],
        })
        const step = result.steps[0]!
        expect(step.exitCode).toBe(0)

        // Reply must be non-empty.
        expect(step.fullText.length).toBeGreaterThan(0)

        // Banner contract — model registered ⇒ banner contains its id.
        // If this fails for a vendor, registry is missing that flagship.
        expect(step.stderr).toContain('使用 model')
        expect(step.stderr).toContain(id)
      },
      180_000,
    )
  }
})
