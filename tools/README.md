# tools/

Manual smokes that exercise the live relay. Not part of `bun test`.

## smoke-relay.mjs

Sends the SAME logical request over BOTH wire protocols (Anthropic and OpenAI)
to `convertmodel.net` and prints the normalized stream events from each path.
Validates that the inlined slice of `src/services/api/adapter/normalize.ts`
produces wire-compatible payloads the relay accepts.

### Scenarios

1. **text** — single-word reply ("hello"). Confirms basic text streaming +
   stop-reason normalization on both paths.
2. **tool_use** — defines `get_weather(city: string)` and asks the model to
   call it for Tokyo. Confirms:
   - tool definitions translate correctly in both wire shapes
     (Anthropic `{name, description, input_schema}` vs.
     OpenAI `{type:"function", function:{name, description, parameters}}`),
   - both paths emit a normalized `tool_use_start` with `name=get_weather`,
   - the assembled `tool_input_delta` partials parse to an object with a
     `city` field,
   - stop reason normalizes to `tool_use` on both sides.

### Run

```sh
ANTHROPIC_BASE_URL=https://convertmodel.net/anthropic \
ANTHROPIC_AUTH_TOKEN=sk-... \
OPENAI_API_KEY=sk-... \
  node tools/smoke-relay.mjs
```

`OPENAI_BASE_URL` defaults to `https://convertmodel.net`. `OPENAI_API_KEY`
falls back to `ANTHROPIC_AUTH_TOKEN` if unset.

Optional model overrides: `SMOKE_ANTHROPIC_MODEL`, `SMOKE_OPENAI_MODEL`
(defaults: `claude-sonnet-4-5`, `gpt-5-codex`).

### Expected output (abridged)

```
text scenario: PASS
tool scenario: PASS

========== overall ==========
text:     PASS
tool_use: PASS
```

Exit code is non-zero if any scenario fails. Any 4xx/5xx surfaces the
response body (truncated to 600 chars) and aborts that scenario without
retries.

### Notes

- Pure read against the relay (POST messages, stream the response).
- The relay does not actually execute the tool — we only assert the model
  emits a syntactically valid tool call in both wire shapes.
- Keep the inlined `fromAnthropicStreamEvent` / `fromOpenAIStreamChunk` in
  sync if `src/services/api/adapter/normalize.ts` changes.
