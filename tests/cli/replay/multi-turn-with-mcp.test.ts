/**
 * Regression coverage for the f0f50b3 schema-sanitizer fix.
 *
 * The bug: turn 1 of the interactive REPL succeeded, but turn 2 silently
 * failed with HTTP 400 ("array schema missing items") because MCP-provided
 * tools shipped `{type:"array"}` without `items`, which strict OpenAI
 * validators reject. Anthropic's API tolerated it; the convertmodel.net relay
 * (and real OpenAI) did not.
 *
 * This scenario forces that exact code path:
 *   1. Loads a stdio MCP fixture (mcp-bad-schema-server.mjs) that registers
 *      ONE tool with the offending schema shape.
 *   2. Drops --bare-only constraints and uses --strict-mcp-config so ONLY the
 *      fixture's servers load — keeps the test hermetic regardless of the
 *      runner's global MCP config.
 *   3. Drives multiple turns through stream-json STDIN PIPE in a single
 *      process (NOT --session-id resume across spawns, which is unreliable
 *      across host/VM environments). One process, multiple user envelopes,
 *      same MCP catalog and same OpenAI request body shape on every turn.
 *   4. Asserts no HTTP error / schema-validator error / is_error envelope on
 *      ANY turn. If the sanitizer regresses, this test fails with the
 *      relay's 400 body in the message.
 *
 * Skipped only when no relay key is present.
 */

import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

import {
  assertNoHttpErrors,
  shouldRunLive,
  streamJsonConversation,
} from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'
const MCP_CONFIG = resolve(import.meta.dir, 'fixtures/mcp-bad-schema-config.json')

describeLive('live conversation — multi-turn WITH MCP tool catalog (schema regression)', () => {
  test(
    'turn 2 succeeds even when the loaded MCP catalog includes an array-without-items schema',
    async () => {
      const result = await streamJsonConversation(
        {
          locale: 'zh-CN',
          model: MODEL,
          useOpenAIPath: true,
          // --bare keeps startup fast and matches the launcher. The explicit
          // --mcp-config below DOES load the fixture's MCP server — what
          // --bare skips is auto-discovery of user/project servers, not
          // --mcp-config-supplied ones.
          bare: true,
          extraArgs: ['--mcp-config', MCP_CONFIG, '--strict-mcp-config'],
        },
        [
          '你好，先用一句话回应即可',
          '再说一句话，确认你还能回复',
        ],
        180_000,
      )

      const [turn1, turn2] = result.turns
      expect(turn1).toBeDefined()
      expect(turn2).toBeDefined()

      // The crucial assertion: neither turn produced an HTTP error or a
      // schema-validator error. assertNoHttpErrors is exactly what would have
      // caught the f0f50b3 bug — it scans for 'array schema missing items'
      // and 'Invalid schema for function' in stderr plus is_error=true on
      // result envelopes.
      assertNoHttpErrors(turn1!.events, result.stderr, '[mcp turn1]')
      assertNoHttpErrors(turn2!.events, result.stderr, '[mcp turn2]')

      // Each turn must have produced an assistant envelope (silent failure
      // would mean the response stream stopped before any assistant text).
      const turn1HasAssistant = turn1!.events.some(e => e.type === 'assistant')
      const turn2HasAssistant = turn2!.events.some(e => e.type === 'assistant')
      expect(turn1HasAssistant).toBe(true)
      expect(turn2HasAssistant).toBe(true)

      expect(turn1!.fullText.length).toBeGreaterThan(0)
      expect(turn2!.fullText.length).toBeGreaterThan(0)

      // eslint-disable-next-line no-console
      console.log(
        '[mcp regression] turn1 events=',
        turn1!.events.length,
        'turn2 events=',
        turn2!.events.length,
        'turn1 text=',
        turn1!.fullText.slice(0, 120),
        'turn2 text=',
        turn2!.fullText.slice(0, 120),
      )
    },
    300_000,
  )
})
