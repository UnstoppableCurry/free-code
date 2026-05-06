/**
 * Live Bash tool flow.
 *
 * Asks the assistant to run a deterministic shell command and report what it
 * sees. Asserts a `tool_use` block with name=Bash appears, a tool_result
 * follows, and stdout content surfaces in the final assistant text.
 *
 * Scoped via --allowed-tools=Bash so the model can't wander off; we point it
 * at /tmp/<unique>/ to avoid touching anything real.
 *
 * Skipped when no relay key is set.
 */

import { describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { assertNoHttpErrors, runLiveConversation, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'

describeLive('live conversation — Bash tool end-to-end', () => {
  test(
    'assistant runs a deterministic shell command and reports a unique marker from stdout',
    async () => {
      // Build a hermetic workdir with one marker file the model is asked to ls.
      const workDir = resolve(tmpdir(), `fc-bash-${Date.now()}`)
      mkdirSync(workDir, { recursive: true })
      const markerName = 'BANANA_TOKEN_99.txt'
      writeFileSync(resolve(workDir, markerName), 'placeholder', 'utf8')
      try {
        const result = await runLiveConversation({
          locale: 'zh-CN',
          model: MODEL,
          useOpenAIPath: true,
          extraArgs: ['--allowed-tools', 'Bash'],
          conversation: [
            {
              userInput: `请使用 Bash 工具运行命令 \`ls ${workDir}\`，然后告诉我目录里有哪些文件名。直接列出文件名。`,
              timeoutMs: 180_000,
            },
          ],
        })
        const step = result.steps[0]!
        expect(step.exitCode).toBe(0)
        assertNoHttpErrors(step.events, step.stderr, '[bash-tool]')

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
        const toolUseIdx = blocks.findIndex(b => b.type === 'tool_use')
        const toolResultIdx = blocks.findIndex(b => b.type === 'tool_result')
        expect(toolUseIdx).toBeGreaterThanOrEqual(0)
        expect(toolResultIdx).toBeGreaterThan(toolUseIdx)

        // Final assistant text must reference the unique marker filename.
        expect(step.fullText).toContain(markerName)

        // eslint-disable-next-line no-console
        console.log('[bash-tool] tools =', usedNames, 'final =', step.fullText.slice(0, 300))
      } finally {
        rmSync(workDir, { recursive: true, force: true })
      }
    },
    240_000,
  )
})
