/**
 * Combined "code review walkthrough" flow.
 *
 * Two-turn realistic user task: the assistant first reads a fixture file
 * and proposes an improvement, then in turn 2 it applies the improvement
 * via Edit. Asserts:
 *   - Turn 1 calls Read, no Edit yet, suggests something about the file.
 *   - Turn 2 calls Edit, the file on disk reflects the new content.
 *
 * Uses shareSession so turn 2 has the prior context. Allowed tools scoped
 * to Read,Edit only.
 *
 * Skipped when no relay key is set.
 */

import { describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { assertNoHttpErrors, shouldRunLive, streamJsonConversation } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'

describeLive('live conversation — code review walkthrough (Read then Edit)', () => {
  test(
    'turn 1 reads, turn 2 applies an edit; disk reflects the change',
    async () => {
      const workDir = resolve(tmpdir(), `fc-review-${Date.now()}`)
      mkdirSync(workDir, { recursive: true })
      const filePath = resolve(workDir, 'snippet.ts')
      // A trivially improvable snippet: typo in a string literal.
      const original = `export const greeting = "Helo, world"\n`
      writeFileSync(filePath, original, 'utf8')
      try {
        const result = await streamJsonConversation(
          {
            locale: 'zh-CN',
            model: MODEL,
            useOpenAIPath: true,
            extraArgs: ['--allowed-tools', 'Read,Edit'],
          },
          [
            `请使用 Read 工具读取文件 ${filePath}，找出其中的拼写错误（不要修改），告诉我应该改成什么。`,
            `好，请使用 Edit 工具按你刚才的建议修复这个拼写错误。完成后简短确认。`,
          ],
          180_000,
        )

        const [t1, t2] = result.turns
        expect(t1).toBeDefined()
        expect(t2).toBeDefined()
        assertNoHttpErrors(t1!.events, result.stderr, '[review t1]')
        assertNoHttpErrors(t2!.events, result.stderr, '[review t2]')

        type Block = { type?: string; name?: string }
        const collect = (events: Array<Record<string, unknown>>): Block[] => {
          const blocks: Block[] = []
          for (const ev of events) {
            const message = (ev as { message?: { content?: unknown } }).message
            const content = message?.content
            if (Array.isArray(content)) {
              for (const b of content) if (b && typeof b === 'object') blocks.push(b as Block)
            }
          }
          return blocks
        }

        const t1Tools = collect(t1!.events).filter(b => b.type === 'tool_use').map(b => b.name)
        const t2Tools = collect(t2!.events).filter(b => b.type === 'tool_use').map(b => b.name)
        expect(t1Tools).toContain('Read')
        expect(t2Tools).toContain('Edit')

        // Disk-level assertion: typo gone.
        const finalContent = readFileSync(filePath, 'utf8')
        expect(finalContent).toContain('Hello')
        expect(finalContent).not.toContain('Helo,')

        // eslint-disable-next-line no-console
        console.log(
          '[review] t1 tools =', t1Tools,
          't2 tools =', t2Tools,
          'final disk =', finalContent.trim(),
        )
      } finally {
        rmSync(workDir, { recursive: true, force: true })
      }
    },
    360_000,
  )
})
