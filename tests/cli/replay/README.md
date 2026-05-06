# Live conversation replay tests

Integration tests that drive the real `bun run ./src/entrypoints/cli.tsx` binary
against a live relay (convertmodel.net) and assert on the stream-json frames
the user would see flowing through the UI.

## Why this exists

Unit tests cover the protocol adapter, i18n resolver, and routing logic in
isolation. The HTTP smoke (`tools/smoke-relay.mjs`) hits the relay once. What
we did NOT have until now: a test that mimics the **real user experience** —
multi-turn dialogue with intermediate UI feedback (system init banner,
streaming assistant deltas, routing decisions, final result envelope) captured
as test assertions.

## Why opt-in

These tests:

1. Spawn a real subprocess for every step (slow — tens of seconds each).
2. Hit a live relay over the network (flaky — depends on relay uptime).
3. Cost real tokens.

So they are gated on `RUN_LIVE_TESTS=1`. The default `bun test` run skips them
entirely; `bun test tests/` stays green and fast on CI without a network.

## How to run

```sh
RUN_LIVE_TESTS=1 \
  ANTHROPIC_BASE_URL=https://convertmodel.net/anthropic \
  ANTHROPIC_AUTH_TOKEN=$RELAY_KEY \
  OPENAI_BASE_URL=https://convertmodel.net \
  OPENAI_API_KEY=$RELAY_KEY \
  FREE_CODE_MULTI_PROVIDER_NORMALIZED=1 \
  CLAUDE_CODE_USE_OPENAI=1 \
  FREE_CODE_LANG=zh-CN \
  bun test tests/cli/replay/
```

`$RELAY_KEY` is exported by `./run-zh.sh` — source it locally or copy the value
out. **Never commit the key to source.**

To pin a specific model (must be in `src/services/api/registry.ts`):

```sh
LIVE_TEST_MODEL=gpt-4o RUN_LIVE_TESTS=1 ... bun test tests/cli/replay/
```

## What the harness captures

Every step records:

- `events`: every parsed JSON envelope, in arrival order. Each line of
  stream-json output IS one frame — the CLI renders these into the visible UI.
- `fullText`: assembled assistant text across `assistant` envelopes plus
  `stream_event content_block_delta` partials when
  `--include-partial-messages` is on.
- `durationMs`, `exitCode`, `stderr`.

Inspect them in test failures via `console.log(step.events)` for postmortem.

## Multi-turn

Turns share state via `--session-id <uuid>` on turn 1 and `--resume <uuid>` on
later turns. If the relay drops the session between processes, the second
turn will not "remember" the first turn's content — that is a known fragility
of doing multi-turn through an out-of-process print mode rather than a single
REPL.

## Limitations

- **No visual frame capture.** stream-json is a structured proxy for what the
  user sees, but it does NOT exercise the actual ink render output. The
  separate `tests/cli/welcome.test.tsx` and `tests/cli/why-this-model.test.tsx`
  cover ink visuals on synthetic components.
- **Non-deterministic content.** We assert on the *shape* of the stream
  (event types, partial-delta count, non-empty text) rather than exact wording,
  because the model output varies run to run.
- **Memory-probe fallback.** If `--session-id` resume across process
  boundaries proves too brittle on the relay, the second scenario degrades to
  a protocol-pipeline check rather than a memory check.
