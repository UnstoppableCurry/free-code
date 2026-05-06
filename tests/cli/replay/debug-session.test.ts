/**
 * Combined "debug session" flow.
 *
 * The user describes a small environment-style question, the assistant runs
 * Bash for diagnostics and explains what it found. Asserts the iterative
 * tool-use loop completes (>=1 Bash tool_use, matching tool_result, final
 * text references some output).
 *
 * Skipped when no relay key is set.
 */

import { describe, expect, test } from 'bun:test'

import { assertNoHttpErrors, runLiveConversation, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'

describeLive('live conversation — debug session via Bash diagnostics', () => {
  test(
    'assistant invokes Bash diagnostics and explains what it found',
    async () => {
      const result = await runLiveConversation({
        locale: 'zh-CN',
        model: MODEL,
        useOpenAIPath: true,
        extraArgs: ['--allowed-tools', 'Bash'],
        conversation: [
          {
            userInput:
              '我想知道当前 shell 进程能看到的 PATH 环境变量是什么。请用 Bash 工具运行 `echo $PATH`，然后用一句话告诉我里面是否包含 /usr/bin。',
            timeoutMs: 180_000,
          },
        ],
      })
      const step = result.steps[0]!
      expect(step.exitCode).toBe(0)
      assertNoHttpErrors(step.events, step.stderr, '[debug-session]')

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
      expect(usedNames).toContain('Bash')

      // Sanity: tool_use precedes tool_result.
      const useIdx = blocks.findIndex(b => b.type === 'tool_use')
      const resIdx = blocks.findIndex(b => b.type === 'tool_result')
      expect(useIdx).toBeGreaterThanOrEqual(0)
      expect(resIdx).toBeGreaterThan(useIdx)

      // The assistant's final answer should mention /usr/bin one way or another.
      expect(step.fullText.toLowerCase()).toContain('/usr/bin')

      // eslint-disable-next-line no-console
      console.log('[debug-session] tools =', usedNames, 'final =', step.fullText.slice(0, 300))
    },
    240_000,
  )
})
