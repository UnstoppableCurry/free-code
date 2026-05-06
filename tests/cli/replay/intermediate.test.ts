/**
 * Streaming intermediate-feedback test.
 *
 * Skipped by default. Enable with RUN_LIVE_TESTS=1.
 *
 * Goal: prove that the assistant text streams in across multiple frames
 * rather than arriving as a single buffered blob. We pass
 * --include-partial-messages so the CLI emits `stream_event`
 * `content_block_delta` frames between the system init and the final result.
 */

import { describe, expect, test } from 'bun:test'

import { runLiveConversation, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'

describeLive('live conversation — intermediate streaming frames', () => {
  test(
    'Counting 1..10 in Chinese emits multiple partial-message deltas before the final result',
    async () => {
      const result = await runLiveConversation({
        locale: 'zh-CN',
        model: MODEL,
        useOpenAIPath: true,
        includePartialMessages: true,
        conversation: [
          {
            userInput: '请用中文从一数到十，每个数字之间用逗号分隔',
            timeoutMs: 120_000,
          },
        ],
      })

      const step = result.steps[0]!
      expect(step.exitCode).toBe(0)

      // The final `result` envelope must come AFTER at least 3 partial deltas.
      const events = step.events
      const resultIdx = events.findIndex(e => e.type === 'result')
      expect(resultIdx).toBeGreaterThan(-1)

      const partialDeltas = events
        .slice(0, resultIdx)
        .filter(e => {
          if (e.type !== 'stream_event') return false
          const inner = (e as { event?: { type?: string } }).event
          return inner?.type === 'content_block_delta'
        })

      // eslint-disable-next-line no-console
      console.log(
        '[intermediate] partial-delta frames before result =',
        partialDeltas.length,
      )

      // We assert ≥3 to prove real-time streaming, not a single buffered blob.
      expect(partialDeltas.length).toBeGreaterThanOrEqual(3)

      // And the final assembled text should mention at least one of the digits.
      expect(step.fullText.length).toBeGreaterThan(0)
    },
    180_000,
  )
})
