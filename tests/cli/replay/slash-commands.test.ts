/**
 * Slash command behavior in --print mode.
 *
 * Most slash commands are flagged supportsNonInteractive=false (clear, model,
 * resume, etc.) — they exist only inside the interactive REPL because they
 * mutate REPL state (session, model picker UI, history). --print mode is
 * single-shot and can't simulate those flows; we document those as out of
 * scope and instead exercise the commands that DO declare
 * supportsNonInteractive=true.
 *
 * Coverage here:
 *   - /cost: prints session cost summary (supportsNonInteractive=true)
 *   - /context: prints context window usage (supportsNonInteractive=true)
 *   - /model via the --model FLAG (slash form is REPL-only): asserts the
 *     init envelope reflects the requested model id.
 *
 * Documented as not-runnable in --print:
 *   - /clear: REPL-only (supportsNonInteractive=false). Can't be simulated
 *     across two -p invocations because each -p spawns a fresh CLI process
 *     by design — there is no in-process memory to "clear". The closest
 *     proxy would be "do not pass --resume", which is the default.
 *   - /resume <sid>: covered indirectly by every shareSession test in this
 *     suite (multiturn.test.ts, multi-turn-with-mcp.test.ts).
 *   - /version: requires USER_TYPE=ant in env to be enabled, and prints
 *     build metadata via MACRO.* — test would lock to build-time string.
 *
 * Skipped when no relay key is set.
 */

import { describe, expect, test } from 'bun:test'

import { assertNoHttpErrors, runLiveConversation, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'
const ALT_MODEL = process.env.LIVE_TEST_ALT_MODEL ?? 'gpt-4o-mini'

describeLive('live conversation — slash command behavior (--print supported subset)', () => {
  test(
    '/cost runs non-interactively and exits cleanly with a result envelope',
    async () => {
      const result = await runLiveConversation({
        locale: 'zh-CN',
        model: MODEL,
        useOpenAIPath: true,
        conversation: [
          { userInput: '/cost', timeoutMs: 60_000 },
        ],
      })
      const step = result.steps[0]!
      // /cost is local — exit 0, has a result envelope, no HTTP errors.
      expect(step.exitCode).toBe(0)
      assertNoHttpErrors(step.events, step.stderr, '[/cost]')
      const types = step.events.map(e => e.type)
      expect(types).toContain('result')
      // eslint-disable-next-line no-console
      console.log('[/cost] events =', types.join(','), 'text =', step.fullText.slice(0, 200))
    },
    90_000,
  )

  test(
    '/context runs non-interactively and exits cleanly',
    async () => {
      const result = await runLiveConversation({
        locale: 'zh-CN',
        model: MODEL,
        useOpenAIPath: true,
        conversation: [
          { userInput: '/context', timeoutMs: 60_000 },
        ],
      })
      const step = result.steps[0]!
      expect(step.exitCode).toBe(0)
      assertNoHttpErrors(step.events, step.stderr, '[/context]')
      const types = step.events.map(e => e.type)
      expect(types).toContain('result')
      // eslint-disable-next-line no-console
      console.log('[/context] events =', types.join(','), 'text =', step.fullText.slice(0, 200))
    },
    90_000,
  )

  test(
    '--model flag is the non-interactive equivalent of /model: init envelope reflects override',
    async () => {
      const result = await runLiveConversation({
        locale: 'zh-CN',
        model: ALT_MODEL,
        useOpenAIPath: true,
        conversation: [
          { userInput: '只用一个英文单词回应：ok', timeoutMs: 60_000 },
        ],
      })
      const step = result.steps[0]!
      expect(step.exitCode).toBe(0)
      assertNoHttpErrors(step.events, step.stderr, '[/model-flag]')

      // The first system envelope advertises the active model id.
      const sysEv = step.events.find(e => e.type === 'system') as
        | { model?: string; tools?: unknown[] }
        | undefined
      expect(sysEv).toBeDefined()
      // Some builds nest the model field; tolerate both shapes.
      const advertised =
        (sysEv as Record<string, unknown> | undefined)?.model ??
        ((sysEv as Record<string, unknown> | undefined)?.session as
          | { model?: string }
          | undefined)?.model
      // Banner mention as belt-and-braces.
      expect(step.stderr).toContain(ALT_MODEL)
      if (typeof advertised === 'string') {
        expect(advertised).toBe(ALT_MODEL)
      }
      // eslint-disable-next-line no-console
      console.log('[/model-flag] advertised =', advertised, 'banner contains alt =', step.stderr.includes(ALT_MODEL))
    },
    90_000,
  )
})

// Not a runnable test: documenting the gap explicitly so future maintainers
// don't think we forgot. Bun's test runner accepts test.skip with a body.
describe.skip('live conversation — slash commands NOT runnable in --print', () => {
  test('/clear: REPL-only, no cross-process state to clear in --print', () => {})
  test('/resume <sid>: covered transitively by shareSession tests', () => {})
  test('/version: USER_TYPE=ant gated and asserts only on MACRO build metadata', () => {})
})
