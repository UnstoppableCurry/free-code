/**
 * Live Edit tool flow.
 *
 * Creates a temp file with a known sentinel, asks the assistant to use Edit
 * to replace the sentinel with a different one, then asserts:
 *   1. tool_use with name=Edit was emitted.
 *   2. The file on disk reflects the replacement after the run.
 *
 * Scoped via --allowed-tools=Read,Edit (Read is needed for Edit's safety
 * pre-read in many tool flows).
 *
 * Skipped when no relay key is set.
 */

import { describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { assertNoHttpErrors, runLiveConversation, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'

describeLive('live conversation — Edit tool end-to-end', () => {
  test(
    'assistant uses Edit to replace a sentinel string and the file on disk changes',
    async () => {
      const workDir = resolve(tmpdir(), `fc-edit-${Date.now()}`)
      mkdirSync(workDir, { recursive: true })
      const filePath = resolve(workDir, 'note.txt')
      const before = 'OLD_SENTINEL_AAA'
      const after = 'NEW_SENTINEL_BBB'
      writeFileSync(filePath, `header line\n${before}\nfooter line\n`, 'utf8')
      try {
        const result = await runLiveConversation({
          locale: 'zh-CN',
          model: MODEL,
          useOpenAIPath: true,
          extraArgs: ['--allowed-tools', 'Read,Edit'],
          conversation: [
            {
              userInput: `请使用 Edit 工具把文件 ${filePath} 中的字符串 "${before}" 替换为 "${after}"。完成后简短确认。`,
              timeoutMs: 180_000,
            },
          ],
        })
        const step = result.steps[0]!
        expect(step.exitCode).toBe(0)
        assertNoHttpErrors(step.events, step.stderr, '[edit-tool]')

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
        expect(usedNames).toContain('Edit')

        // Disk-level proof: the file was actually mutated.
        const finalContent = readFileSync(filePath, 'utf8')
        expect(finalContent).toContain(after)
        expect(finalContent).not.toContain(before)

        // eslint-disable-next-line no-console
        console.log('[edit-tool] tools =', usedNames, 'final disk =', finalContent.trim())
      } finally {
        rmSync(workDir, { recursive: true, force: true })
      }
    },
    240_000,
  )
})
