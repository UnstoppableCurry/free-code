/**
 * Live conversation replay harness.
 *
 * Drives the actual `bun run ./src/entrypoints/cli.tsx` binary in
 * `--print --output-format stream-json` mode and captures every stream-json
 * envelope as it arrives. This is the closest thing we have to a "what does
 * the user see, frame by frame" recording, without coupling to ink internals.
 *
 * Why stream-json instead of a TTY render: the CLI emits one JSON object per
 * line in this mode (system init, assistant deltas, tool_use, tool_result,
 * final result). Each line IS an intermediate frame from the user's POV — the
 * CLI is rendering these envelopes into the visible UI. Asserting on them is
 * a faithful proxy for "the user saw a streaming reply" without needing a
 * pty.
 *
 * Multi-turn: free-code's print mode is single-shot. To carry conversation
 * state across steps we pass `--session-id <uuid>` to step 1, then
 * `--resume <uuid>` to subsequent steps. (See src/main.tsx around the
 * `--session-id` / `--resume` option definitions.) If session resume across
 * processes proves fragile in the live relay, the second test scenario falls
 * back to documenting that as a limitation.
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

export type ConversationStep = {
  /** What the user types at this turn. */
  userInput: string
  /** Substrings that must appear in the assembled assistant text. */
  expectedFragments?: string[]
  /** Ordered list of envelope `type` values we expect to observe (subset, in order). */
  expectedEventTypes?: string[]
  /** Per-step timeout. Default 60s. */
  timeoutMs?: number
}

export type LiveTestOptions = {
  locale?: 'zh-CN' | 'en-US'
  /** Model name passed via --model. Must be in registry. */
  model?: string
  /** When true, sets FREE_CODE_MULTI_PROVIDER_NORMALIZED=1 + CLAUDE_CODE_USE_OPENAI=1. */
  useOpenAIPath?: boolean
  /** When true, pass --include-partial-messages so we get streaming deltas. */
  includePartialMessages?: boolean
  /** When true, share a session id across steps so turn 2 sees turn 1's history. */
  shareSession?: boolean
  conversation: ConversationStep[]
  /** Extra env overrides (e.g. ANTHROPIC_BASE_URL). Falls through to the spawn env. */
  extraEnv?: Record<string, string | undefined>
  /** Extra CLI flags appended to every spawned step (e.g. ['--allowed-tools', 'Read']). */
  extraArgs?: string[]
  /**
   * Pass --bare to skip MCP/hooks/etc. Default true (matches launcher behavior).
   * Set false to exercise the full MCP-tool-loading path used by interactive REPL.
   */
  bare?: boolean
}

export type StepResult = {
  step: ConversationStep
  events: Array<Record<string, unknown>>
  /** Concatenation of every assistant text we saw across delta + final messages. */
  fullText: string
  durationMs: number
  exitCode: number | null
  stderr: string
  sessionId: string
}

export type LiveResult = {
  steps: StepResult[]
}

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..')
const CLI_ENTRY = resolve(REPO_ROOT, 'src/entrypoints/cli.tsx')

function buildEnv(opts: LiveTestOptions): Record<string, string> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    FREE_CODE_LANG: opts.locale ?? 'zh-CN',
    // CRITICAL: bun test sets NODE_ENV=test by default. The CLI's VCR layer
    // (src/services/vcr.ts:shouldUseVCR) treats NODE_ENV=test as a signal to
    // replay cached fixtures from disk INSTEAD of hitting the real model.
    // For LIVE tests this is exactly the wrong behavior — we want real network
    // calls. Override NODE_ENV in the child so the real path runs.
    NODE_ENV: 'development',
  }
  if (opts.useOpenAIPath) {
    env.FREE_CODE_MULTI_PROVIDER_NORMALIZED = '1'
    env.CLAUDE_CODE_USE_OPENAI = '1'
  }
  for (const [k, v] of Object.entries(opts.extraEnv ?? {})) {
    if (v === undefined) delete env[k]
    else env[k] = v
  }
  return env
}

function buildArgs(
  opts: LiveTestOptions,
  step: ConversationStep,
  sessionId: string,
  isFirstTurn: boolean,
): string[] {
  const args = [
    'run',
    CLI_ENTRY,
    '--dangerously-skip-permissions',
    '-p',
    step.userInput,
    '--output-format',
    'stream-json',
    '--verbose',
  ]
  // --bare unless caller explicitly opts out (e.g. to load MCP tool catalog).
  if (opts.bare !== false) {
    args.splice(2, 0, '--bare')
  }
  if (opts.model) {
    args.push('--model', opts.model)
  }
  if (opts.includePartialMessages) {
    args.push('--include-partial-messages')
  }
  if (opts.shareSession) {
    if (isFirstTurn) {
      args.push('--session-id', sessionId)
    } else {
      args.push('--resume', sessionId)
    }
  }
  if (opts.extraArgs && opts.extraArgs.length > 0) {
    args.push(...opts.extraArgs)
  }
  return args
}

/**
 * Lower-level spawn that returns the live ChildProcess plus accumulators.
 * Used for cancellation tests that need to send SIGINT mid-stream.
 *
 * Caller is responsible for awaiting `done` (resolves on close) or killing
 * the child themselves.
 */
export type LiveSpawn = {
  child: ReturnType<typeof spawn>
  /** Resolves with the final state once the child exits or is killed. */
  done: Promise<{
    events: Array<Record<string, unknown>>
    stderr: string
    exitCode: number | null
    signal: NodeJS.Signals | null
  }>
}

export function spawnLiveStep(
  opts: LiveTestOptions,
  step: ConversationStep,
): LiveSpawn {
  const env = buildEnv(opts)
  const sessionId = randomUUID()
  const args = buildArgs(opts, step, sessionId, true)
  const child = spawn('bun', args, {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const events: Array<Record<string, unknown>> = []
  let stdoutBuf = ''
  let stderrBuf = ''

  child.stdout!.setEncoding('utf8')
  child.stdout!.on('data', (chunk: string) => {
    stdoutBuf += chunk
    let idx: number
    while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, idx).trim()
      stdoutBuf = stdoutBuf.slice(idx + 1)
      if (!line) continue
      try {
        events.push(JSON.parse(line) as Record<string, unknown>)
      } catch {
        /* ignore non-JSON lines */
      }
    }
  })
  child.stderr!.setEncoding('utf8')
  child.stderr!.on('data', (chunk: string) => {
    stderrBuf += chunk
  })

  const done = new Promise<{
    events: Array<Record<string, unknown>>
    stderr: string
    exitCode: number | null
    signal: NodeJS.Signals | null
  }>(resolveDone => {
    child.on('close', (code, signal) => {
      const trailing = stdoutBuf.trim()
      if (trailing) {
        try {
          events.push(JSON.parse(trailing) as Record<string, unknown>)
        } catch {
          /* ignore */
        }
      }
      resolveDone({ events, stderr: stderrBuf, exitCode: code, signal })
    })
  })

  return { child, done }
}

function extractAssistantText(events: Array<Record<string, unknown>>): string {
  const chunks: string[] = []
  for (const ev of events) {
    if (ev.type !== 'assistant') continue
    const message = ev.message as { content?: unknown } | undefined
    const content = message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (
        block &&
        typeof block === 'object' &&
        (block as { type?: string }).type === 'text'
      ) {
        const text = (block as { text?: string }).text
        if (typeof text === 'string') chunks.push(text)
      }
    }
  }
  // Also pull `stream_event` partial deltas if present (--include-partial-messages).
  for (const ev of events) {
    if (ev.type !== 'stream_event') continue
    const inner = ev.event as { type?: string; delta?: { text?: string } } | undefined
    if (inner?.type === 'content_block_delta' && typeof inner.delta?.text === 'string') {
      chunks.push(inner.delta.text)
    }
  }
  return chunks.join('')
}

async function runStep(
  opts: LiveTestOptions,
  step: ConversationStep,
  sessionId: string,
  isFirstTurn: boolean,
): Promise<StepResult> {
  const env = buildEnv(opts)
  const args = buildArgs(opts, step, sessionId, isFirstTurn)
  const timeoutMs = step.timeoutMs ?? 60_000
  const startedAt = Date.now()

  return await new Promise<StepResult>((resolveStep, rejectStep) => {
    const child = spawn('bun', args, {
      cwd: REPO_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const events: Array<Record<string, unknown>> = []
    let stdoutBuf = ''
    let stderrBuf = ''
    let killed = false

    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGTERM')
    }, timeoutMs)

    child.stdout!.setEncoding('utf8')
    child.stdout!.on('data', (chunk: string) => {
      stdoutBuf += chunk
      let idx: number
      while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, idx).trim()
        stdoutBuf = stdoutBuf.slice(idx + 1)
        if (!line) continue
        try {
          events.push(JSON.parse(line) as Record<string, unknown>)
        } catch {
          // Non-JSON line — keep moving; could be a banner the launcher prints to stdout.
        }
      }
    })

    child.stderr!.setEncoding('utf8')
    child.stderr!.on('data', (chunk: string) => {
      stderrBuf += chunk
    })

    child.on('error', (err: Error) => {
      clearTimeout(timer)
      rejectStep(err)
    })

    child.on('close', (code: number | null) => {
      clearTimeout(timer)
      // Flush any trailing JSON line that didn't end with \n.
      const trailing = stdoutBuf.trim()
      if (trailing) {
        try {
          events.push(JSON.parse(trailing) as Record<string, unknown>)
        } catch {
          /* ignore */
        }
      }
      resolveStep({
        step,
        events,
        fullText: extractAssistantText(events),
        durationMs: Date.now() - startedAt,
        exitCode: killed ? -1 : code,
        stderr: stderrBuf,
        sessionId,
      })
    })
  })
}

export async function runLiveConversation(opts: LiveTestOptions): Promise<LiveResult> {
  const sessionId = randomUUID()
  const steps: StepResult[] = []
  for (let i = 0; i < opts.conversation.length; i++) {
    const step = opts.conversation[i]!
    const result = await runStep(opts, step, sessionId, i === 0)
    steps.push(result)
  }
  return { steps }
}

/**
 * Live tests are opt-OUT: if a relay key is in the env they run automatically.
 * Set FREE_CODE_SKIP_LIVE_TESTS=1 to force-skip even when a key is present.
 *
 * The legacy RUN_LIVE_TESTS=1 toggle is still honored for back-compat — if it's
 * explicitly set we prefer it. Otherwise we use key presence.
 */
export function shouldRunLive(): boolean {
  if (process.env.FREE_CODE_SKIP_LIVE_TESTS === '1') return false
  if (process.env.RUN_LIVE_TESTS === '1' || process.env.RUN_LIVE_TESTS === 'true') {
    return true
  }
  // NOTE: we deliberately do NOT consult ANTHROPIC_API_KEY here. Several i18n
  // tests set it to a dummy via `process.env.ANTHROPIC_API_KEY ??= 'test-dummy'`
  // and never restore it; if we treated that as "live tests on" the full
  // `bun test tests/` run would try to drive the relay with a junk key.
  const key = process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN
  if (!key) {
    // Print once per process so CI surfaces the reason.
    if (!(globalThis as { __liveSkipLogged?: boolean }).__liveSkipLogged) {
      ;(globalThis as { __liveSkipLogged?: boolean }).__liveSkipLogged = true
      // eslint-disable-next-line no-console
      console.log(
        '[live tests] skipped — set OPENAI_API_KEY (or ANTHROPIC_AUTH_TOKEN) to run',
      )
    }
    return false
  }
  return true
}

/**
 * Scan an event stream + stderr for HTTP error envelopes / status codes.
 * Throws an Error with the offending body if any are found, so the failing
 * test message points directly at the regression instead of "expected X got
 * undefined".
 */
export function assertNoHttpErrors(
  events: Array<Record<string, unknown>>,
  stderr: string,
  label = '',
): void {
  // 1. Final result envelope must not be is_error.
  const resultEv = events.find(e => e.type === 'result') as
    | { is_error?: boolean; result?: unknown; error?: unknown }
    | undefined
  if (resultEv?.is_error === true) {
    throw new Error(
      `${label} result envelope is_error=true: ${JSON.stringify(resultEv).slice(0, 800)}`,
    )
  }
  // 2. No `error` typed envelopes in the stream.
  const errEv = events.find(e => e.type === 'error')
  if (errEv) {
    throw new Error(
      `${label} stream contained error envelope: ${JSON.stringify(errEv).slice(0, 800)}`,
    )
  }
  // 3. stderr must not contain HTTP 4xx / 5xx markers.
  const httpFailRe =
    /HTTP\s+(4\d\d|5\d\d)|status[:= ]+(4\d\d|5\d\d)|"status":\s*(4\d\d|5\d\d)|\b400 Bad Request\b|\b500 Internal\b/
  const m = httpFailRe.exec(stderr)
  if (m) {
    // Capture the surrounding context so the regression body shows up.
    const idx = m.index
    const window = stderr.slice(Math.max(0, idx - 200), Math.min(stderr.length, idx + 600))
    throw new Error(`${label} stderr surfaced HTTP error: ...${window}...`)
  }
  // 4. Schema-related markers from the just-fixed bug.
  if (
    stderr.includes('array schema missing items') ||
    stderr.includes('Invalid schema for function')
  ) {
    throw new Error(
      `${label} stderr surfaced JSON-schema validation error: ${stderr.slice(-800)}`,
    )
  }
}

/**
 * Single-process multi-turn conversation via stream-json input/output.
 *
 * Spawns ONE child process with --print --input-format stream-json
 * --output-format stream-json, then writes one user envelope per turn on
 * stdin, awaits the corresponding `result` envelope on stdout, and moves on.
 *
 * Returns one entry per user turn with the events that arrived between the
 * previous boundary and that turn's `result`.
 *
 * If the CLI doesn't accept additional input lines after a `result` (the SDK
 * stream-json semantics are "one prompt per process" in some builds), the
 * follow-up turns may simply hang until our per-turn timeout fires — in that
 * case the returned entry will have `timedOut=true` and the caller can treat
 * it as a documented limitation rather than a regression.
 */
export type StreamJsonTurnResult = {
  events: Array<Record<string, unknown>>
  fullText: string
  timedOut: boolean
}

export type StreamJsonConversationResult = {
  turns: StreamJsonTurnResult[]
  stderr: string
  exitCode: number | null
  signal: NodeJS.Signals | null
}

export async function streamJsonConversation(
  opts: LiveTestOptions,
  turns: string[],
  perTurnTimeoutMs = 60_000,
): Promise<StreamJsonConversationResult> {
  const env = buildEnv(opts)
  const args: string[] = [
    'run',
    CLI_ENTRY,
    '--dangerously-skip-permissions',
    '-p',
    '',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
  ]
  if (opts.bare !== false) args.splice(2, 0, '--bare')
  if (opts.model) args.push('--model', opts.model)
  if (opts.includePartialMessages) args.push('--include-partial-messages')
  if (opts.extraArgs?.length) args.push(...opts.extraArgs)

  const child = spawn('bun', args, {
    cwd: REPO_ROOT,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let stdoutBuf = ''
  let stderrBuf = ''
  const allEvents: Array<Record<string, unknown>> = []
  let pendingResolve: ((ev: Record<string, unknown>) => void) | null = null

  child.stdout!.setEncoding('utf8')
  child.stdout!.on('data', (chunk: string) => {
    stdoutBuf += chunk
    let idx: number
    while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, idx).trim()
      stdoutBuf = stdoutBuf.slice(idx + 1)
      if (!line) continue
      try {
        const ev = JSON.parse(line) as Record<string, unknown>
        allEvents.push(ev)
        if (ev.type === 'result' && pendingResolve) {
          const r = pendingResolve
          pendingResolve = null
          r(ev)
        }
      } catch {
        /* ignore */
      }
    }
  })
  child.stderr!.setEncoding('utf8')
  child.stderr!.on('data', (chunk: string) => {
    stderrBuf += chunk
  })

  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(res => {
    child.on('close', (code, signal) => res({ code, signal }))
  })

  const turnResults: StreamJsonTurnResult[] = []
  let cursor = 0

  for (const userText of turns) {
    const envelope = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: userText },
    })
    child.stdin!.write(envelope + '\n')

    let timedOut = false
    const resultEv = await new Promise<Record<string, unknown> | null>(resolve => {
      const t = setTimeout(() => {
        timedOut = true
        pendingResolve = null
        resolve(null)
      }, perTurnTimeoutMs)
      pendingResolve = ev => {
        clearTimeout(t)
        resolve(ev)
      }
    })
    const sliceEnd = resultEv ? allEvents.length : allEvents.length
    const turnEvents = allEvents.slice(cursor, sliceEnd)
    cursor = sliceEnd
    const fullText = extractAssistantText(turnEvents)
    turnResults.push({ events: turnEvents, fullText, timedOut })
    if (timedOut) break
  }

  // Close stdin so the CLI can exit.
  try {
    child.stdin!.end()
  } catch {
    /* already closed */
  }
  // Give the process a brief grace period to exit; kill if it lingers.
  const finalState = await Promise.race([
    closed,
    new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(res => {
      setTimeout(() => {
        try {
          child.kill('SIGTERM')
        } catch {
          /* already gone */
        }
        res({ code: null, signal: 'SIGTERM' })
      }, 5_000)
    }),
  ])

  return {
    turns: turnResults,
    stderr: stderrBuf,
    exitCode: finalState.code,
    signal: finalState.signal,
  }
}
