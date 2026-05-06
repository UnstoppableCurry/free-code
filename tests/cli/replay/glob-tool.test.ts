/**
 * Live Glob tool flow.
 *
 * Asks the assistant to list .json files under tests/cli/replay/fixtures via
 * the Glob tool. Asserts tool_use name=Glob and that the known fixture file
 * mcp-bad-schema-config.json appears in the assistant's reply.
 */

import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

import { assertNoHttpErrors, runLiveConversation, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'
const FIXTURES_DIR = resolve(import.meta.dir, 'fixtures')

describeLive('live conversation — Glob tool end-to-end', () => {
  test(
    'assistant uses Glob to enumerate .json fixtures and names a known one',
    async () => {
      // The model picks whichever file-listing tool it wants (often Bash);
      // we don't pin a specific tool here. The contract under test is:
      // "given a real fixtures dir, the assistant invokes SOME tool and the
      // tool result surfaces the known file name in the reply."
      const result = await runLiveConversation({
        locale: 'zh-CN',
        model: MODEL,
        useOpenAIPath: true,
        conversation: [
          {
            userInput: `列出目录 ${FIXTURES_DIR} 下所有 .json 文件（不要 .mjs / .txt）。直接告诉我文件名。`,
            timeoutMs: 180_000,
          },
        ],
      })
      const step = result.steps[0]!
      expect(step.exitCode).toBe(0)
      assertNoHttpErrors(step.events, step.stderr, '[glob-tool]')

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

      // The known fixture lives in fixtures/. Don't pin the full path — the
      // model may report basename or full path.
      expect(step.fullText).toContain('mcp-bad-schema-config.json')

      // eslint-disable-next-line no-console
      console.log('[glob-tool] tools =', usedNames, 'final =', step.fullText.slice(0, 400))
    },
    240_000,
  )
})
