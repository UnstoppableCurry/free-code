/**
 * Edge paths real users hit.
 *
 *   1. Empty user message — CLI must NOT crash silently. We accept either:
 *      (a) graceful exit with a non-success result envelope, or
 *      (b) graceful exit code 0 with an assistant prompt-back.
 *      What we forbid: HTTP error / unhandled rejection / non-zero exit
 *      with no stderr explanation.
 *
 *   2. Very small max_tokens — when the user requests a long answer with
 *      a tiny token budget, the result envelope's stop_reason should
 *      surface as 'max_tokens'. The flag is plumbed via --max-tokens
 *      (verified in src/main.tsx). If the build doesn't expose it, we
 *      fall back to documenting what we observed.
 *
 *   3. Network blip mid-stream — DOCUMENTED as out-of-scope: the relay is
 *      a remote service we don't control, and killing the relay socket
 *      from the test would require a custom proxy. The cancellation
 *      scenario already exercises the related "abort mid-stream" UX.
 *
 *   4. Image attachment — SKIPPED: --print mode does not currently expose a
 *      first-class image-attachment flag, and synthesizing an image content
 *      block via stream-json input is provider-specific. Documented in the
 *      scenario list rather than shipped as a flaky test.
 *
 * Skipped when no relay key is set.
 */

import { describe, expect, test } from 'bun:test'

import { assertNoHttpErrors, runLiveConversation, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'

describeLive('live conversation — edge paths', () => {
  test(
    'empty user message exits gracefully (no HTTP error, no unhandled rejection)',
    async () => {
      const result = await runLiveConversation({
        locale: 'zh-CN',
        model: MODEL,
        useOpenAIPath: true,
        conversation: [
          { userInput: '', timeoutMs: 60_000 },
        ],
      })
      const step = result.steps[0]!
      // Don't assert exitCode === 0 — the CLI is allowed to reject empty input.
      // What we forbid: HTTP error envelope or stderr 4xx/5xx leakage.
      assertNoHttpErrors(step.events, step.stderr, '[empty-input]')
      // Process must have terminated rather than hanging until timeout.
      // Our timeout path sets exitCode = -1 in the harness; assert NOT that.
      expect(step.exitCode).not.toBe(-1)
      // No unhandled rejection markers.
      expect(step.stderr).not.toContain('UnhandledPromiseRejection')
      expect(step.stderr).not.toContain('Uncaught (in promise)')
      // eslint-disable-next-line no-console
      console.log('[empty-input] exit =', step.exitCode, 'stderr =', step.stderr.slice(0, 300))
    },
    90_000,
  )

  test(
    'stop_reason envelope is well-formed on a normal turn (max_tokens path documented)',
    async () => {
      // Note: free-code does not currently expose a --max-tokens CLI flag
      // (only the SDK control schema accepts maxTokens). We can't force
      // truncation from --print without invasive plumbing. Instead this test
      // asserts the GENERAL invariant the truncation case would rely on:
      // every assistant envelope's `message.stop_reason` field is one of the
      // known Anthropic-compatible values when present. If the relay ever
      // returns a malformed stop_reason, this test catches it; once a real
      // --max-tokens flag lands, swap the prompt body and tighten the assert.
      const result = await runLiveConversation({
        locale: 'zh-CN',
        model: MODEL,
        useOpenAIPath: true,
        conversation: [
          { userInput: '只用一句话回答：1+1=?', timeoutMs: 60_000 },
        ],
      })
      const step = result.steps[0]!
      expect(step.exitCode).toBe(0)
      assertNoHttpErrors(step.events, step.stderr, '[stop-reason]')

      const stopReasons: string[] = []
      for (const ev of step.events) {
        const msg = (ev as { message?: { stop_reason?: string | null } }).message
        if (msg && typeof msg.stop_reason === 'string') stopReasons.push(msg.stop_reason)
      }
      const allowed = new Set([
        'end_turn',
        'max_tokens',
        'stop_sequence',
        'tool_use',
        'pause_turn',
        'refusal',
      ])
      for (const r of stopReasons) {
        expect(allowed.has(r)).toBe(true)
      }
      // eslint-disable-next-line no-console
      console.log('[stop-reason] reasons =', stopReasons, 'preview =', step.fullText.slice(0, 200))
    },
    120_000,
  )
})

describe.skip('live conversation — edge paths NOT runnable here', () => {
  test('network blip mid-stream: would need a relay-proxy fixture; cancellation.test.ts covers the closest UX', () => {})
  test('image attachment: --print has no first-class image flag; would need a custom stream-json input shaper', () => {})
  test('forced truncation: free-code does not expose a --max-tokens CLI flag; would need SDK control-channel plumbing', () => {})
})
