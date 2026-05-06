/**
 * End-to-end tool-use replay scenario.
 *
 * The assistant is asked to call the Read tool on a small fixture file and
 * report the unique phrase inside it. We assert:
 *   1. A `tool_use` block appears in the event stream.
 *   2. A `tool_result` block follows it.
 *   3. The final assistant text contains the unique phrase from the fixture.
 *
 * This proves the full Anthropic-compatible tool-use loop works through the
 * relay/normalizer, not just plain text streaming.
 *
 * Skipped by default. Enable with RUN_LIVE_TESTS=1.
 */

import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

import { runLiveConversation, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'
const FIXTURE = resolve(import.meta.dir, 'fixtures/sample.txt')
const UNIQUE_PHRASE = 'PURPLE_PINEAPPLE_42'

describeLive('live conversation — tool use end-to-end (Read)', () => {
  test(
    'assistant calls Read tool, receives result, quotes the unique phrase',
    async () => {
      const result = await runLiveConversation({
        locale: 'zh-CN',
        model: MODEL,
        useOpenAIPath: true,
        // Keep the toolset narrow — only Read is needed, and we want to avoid
        // the assistant wandering off into Bash etc.
        extraArgs: ['--allowed-tools', 'Read'],
        conversation: [
          {
            userInput: `请使用 Read 工具读取文件 ${FIXTURE}，然后告诉我文件中那个全大写的独特短语是什么。直接给出这个短语。`,
            timeoutMs: 180_000,
          },
        ],
      })

      const step = result.steps[0]!
      expect(step.exitCode).toBe(0)

      // Walk every assistant envelope's content blocks to find tool_use
      // and tool_result types — they live inside `message.content[]`.
      type Block = { type?: string; name?: string; tool_use_id?: string }
      const blocks: Block[] = []
      for (const ev of step.events) {
        const message = (ev as { message?: { content?: unknown } }).message
        const content = message?.content
        if (!Array.isArray(content)) continue
        for (const b of content) {
          if (b && typeof b === 'object') blocks.push(b as Block)
        }
        // user envelopes carry tool_result in the SDK message shape.
        if ((ev as { type?: string }).type === 'user') {
          const userMsg = (ev as { message?: { content?: unknown } }).message
          const userContent = userMsg?.content
          if (Array.isArray(userContent)) {
            for (const b of userContent) {
              if (b && typeof b === 'object') blocks.push(b as Block)
            }
          }
        }
      }

      const toolUseIdx = blocks.findIndex(b => b.type === 'tool_use')
      const toolResultIdx = blocks.findIndex(b => b.type === 'tool_result')
      expect(toolUseIdx).toBeGreaterThanOrEqual(0)
      expect(toolResultIdx).toBeGreaterThan(toolUseIdx)

      // Tool name should be Read (the FILE_READ_TOOL_NAME constant).
      const usedNames = blocks
        .filter(b => b.type === 'tool_use')
        .map(b => b.name)
      expect(usedNames).toContain('Read')

      // Final assistant text must reference the unique phrase from the file.
      expect(step.fullText).toContain(UNIQUE_PHRASE)

      // eslint-disable-next-line no-console
      console.log('[tool-use] tools used =', usedNames)
      // eslint-disable-next-line no-console
      console.log('[tool-use] final text =', step.fullText.slice(0, 400))
    },
    240_000,
  )
})
