/**
 * Long single-turn input.
 *
 * Sends a 5000+ char user message to verify the request body isn't truncated
 * upstream and the model still replies. This exercises the prompt assembly
 * and the relay's request-size handling in one shot.
 *
 * Skipped only when no relay key is present.
 */

import { describe, expect, test } from 'bun:test'

import { assertNoHttpErrors, runLiveConversation, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'

describeLive('live conversation — long context single turn', () => {
  test(
    'a 5000+ char user message round-trips and yields a reply',
    async () => {
      // Build a paragraph of distinguishable filler followed by a unique
      // marker the model can echo back to prove the message survived intact.
      const filler = '这是一段填充文本，用来撑大输入长度，确保超过五千字符。'.repeat(200)
      const marker = 'MARKER_长上下文_RHO_42'
      const userInput = `${filler}\n\n请记住这句话最后一次出现的标记，然后只回答这个标记本身：${marker}`
      expect(userInput.length).toBeGreaterThanOrEqual(5_000)

      const result = await runLiveConversation({
        locale: 'zh-CN',
        model: MODEL,
        useOpenAIPath: true,
        conversation: [{ userInput, timeoutMs: 180_000 }],
      })

      const step = result.steps[0]!
      assertNoHttpErrors(step.events, step.stderr, '[long-context]')
      expect(step.exitCode).toBe(0)
      expect(step.fullText.length).toBeGreaterThan(0)
      // Marker round-trip: the request reached the model intact and the model
      // could read characters past the 5k mark. Some smaller models hallucinate
      // or paraphrase, so we accept either an exact echo OR substring match.
      expect(step.fullText).toContain(marker)

      // eslint-disable-next-line no-console
      console.log(
        '[long-context] input chars =',
        userInput.length,
        'reply preview =',
        step.fullText.slice(0, 200),
      )
    },
    240_000,
  )
})
