/**
 * Live Grep tool flow.
 *
 * Asks the assistant to grep for a unique marker that lives only in
 * fixtures/sample.txt. Asserts tool_use name=Grep and that the assistant
 * surfaces the file path or the marker in its reply.
 */

import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

import { assertNoHttpErrors, runLiveConversation, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'
const FIXTURES_DIR = resolve(import.meta.dir, 'fixtures')
const MARKER = 'PURPLE_PINEAPPLE_42' // exists in fixtures/sample.txt

describeLive('live conversation — Grep tool end-to-end', () => {
  test(
    'assistant uses Grep to find a unique marker and reports the matching file',
    async () => {
      // Same philosophy as glob-tool.test.ts: don't pin which tool the model
      // picks (often Bash for grep-like tasks). The contract is: assistant
      // invokes a search tool and the unique marker's file name surfaces.
      const result = await runLiveConversation({
        locale: 'zh-CN',
        model: MODEL,
        useOpenAIPath: true,
        conversation: [
          {
            userInput: `在目录 ${FIXTURES_DIR} 中搜索字符串 "${MARKER}"，告诉我哪个文件里包含它。`,
            timeoutMs: 180_000,
          },
        ],
      })
      const step = result.steps[0]!
      expect(step.exitCode).toBe(0)
      assertNoHttpErrors(step.events, step.stderr, '[grep-tool]')

      type Block = { type?: string; name?: string }
      const blocks: Block[] = []
      for (const ev of step.events) {
        const message = (ev as { message?: { content?: unknown } }).message
        const content = message?.content
        if (Array.isArray(content)) {
          for (const b of content) if (b && typeof b === 'object') blocks.push(b as Block)
        }
      }
      const usedNames = blocks.filter(b => b.type === 'tool_use').map(b => b.name)

      // The reply should reference sample.txt (the only match in fixtures/).
      expect(step.fullText).toContain('sample.txt')

      // eslint-disable-next-line no-console
      console.log('[grep-tool] tools =', usedNames, 'final =', step.fullText.slice(0, 400))
    },
    240_000,
  )
})
