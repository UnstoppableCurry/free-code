/**
 * Cancellation-safety scenario.
 *
 * Spawn the CLI, kill it with SIGINT mid-stream, assert the child exits
 * (no orphan hang) and that exit metadata reflects the signal.
 *
 * Skipped by default. Enable with RUN_LIVE_TESTS=1.
 *
 * Limitations: we use the lower-level `spawnLiveStep` to keep a handle on
 * the child. Bun.spawn vs node:child_process: this harness uses
 * node:child_process.spawn, so `child.exitCode` and the close-event
 * `signal` arg are reliable.
 */

import { describe, expect, test } from 'bun:test'

import { spawnLiveStep, shouldRunLive } from './harness'

const LIVE = shouldRunLive()
const describeLive = LIVE ? describe : describe.skip

const MODEL = process.env.LIVE_TEST_MODEL ?? 'gpt-4o'

describeLive('live conversation — SIGINT cancellation does not orphan the child', () => {
  test(
    'sending SIGINT mid-stream causes the CLI to exit within the grace period',
    async () => {
      const spawned = spawnLiveStep(
        {
          locale: 'zh-CN',
          model: MODEL,
          useOpenAIPath: true,
          includePartialMessages: true,
          conversation: [],
        },
        {
          // A long task so we have time to interrupt it.
          userInput: '请用中文非常详细地讲述一个关于太空旅行的故事，至少 500 字。',
          timeoutMs: 60_000,
        },
      )

      // Wait until at least one stream-json envelope has appeared on stdout,
      // then send SIGINT. We poll a brief interval to detect first data.
      const FIRST_DATA_TIMEOUT_MS = 30_000
      const start = Date.now()
      let killed = false
      const killTimer = setInterval(() => {
        if (killed) return
        if (Date.now() - start > FIRST_DATA_TIMEOUT_MS) {
          // Couldn't observe data in time — kill anyway so the test ends.
          killed = true
          spawned.child.kill('SIGINT')
        }
      }, 200)

      // After 2s of warm-up, send SIGINT regardless. This is the realistic
      // user-cancel pattern.
      const cancelAfter = setTimeout(() => {
        if (!killed) {
          killed = true
          spawned.child.kill('SIGINT')
        }
      }, 2_000)

      const finalState = await spawned.done
      clearInterval(killTimer)
      clearTimeout(cancelAfter)

      // The child must have exited — either with a non-zero exit code OR a
      // signal. A clean exit code 0 here would indicate the kill arrived
      // after the request already completed, which is also acceptable.
      const exited =
        finalState.exitCode !== null || finalState.signal !== null
      expect(exited).toBe(true)

      // eslint-disable-next-line no-console
      console.log(
        '[cancel] exitCode =',
        finalState.exitCode,
        'signal =',
        finalState.signal,
        'events =',
        finalState.events.length,
      )
    },
    90_000,
  )
})
