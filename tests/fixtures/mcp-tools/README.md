# MCP Tool Fixtures — Sanitizer Regression Corpus

These fixtures back `tests/protocol/mcp-catalog.test.ts` and
`tests/protocol/mcp-catalog-live.test.ts`. Each file is `{ name, description,
input_schema, _source }`. The `_source` field is metadata only and is stripped
before feeding the schema through `toOpenAIRequest`.

## Why these exist

The sanitizer at `src/services/api/adapter/normalize.ts:331`
(`sanitizeJsonSchemaForOpenAI`) was added in commit `f0f50b3` after a real
118-tool REPL session 400'd against `convertmodel.net`. The offender was
`mcp__safari__safari_execute_script` declaring `properties.args` as
`type: 'array'` with no `items` field. OpenAI's strict validator rejects that;
Anthropic's permissive validator accepts it.

The unit tests next door (`sanitize-schema.test.ts`) prove the sanitizer's
internal logic against synthetic schemas. These fixtures pin the sanitizer
against representatives of the actual MCP zoo a user has loaded, so future MCP
additions don't reintroduce the same class of bug.

## Capture method

Two paths were considered:

1. Live dump from the running CLI's tool registry — has privacy implications
   (leaks the user's installed MCP set).
2. Reconstruct from the deferred-tool list visible in the harness's
   `<system-reminder>` (the names are public knowledge from each MCP's docs)
   plus a faithful reproduction of the originally-failing schema shape.

We chose path 2. Schemas are reconstructed from MCP server docs and the known
shape of the Safari bug. The aim is realistic shape coverage, not pixel-perfect
parity with any specific MCP version.

## Fixture inventory

| File | Tool | Variation it represents |
| --- | --- | --- |
| `safari-execute-script.json` | `mcp__safari__safari_execute_script` | The original 400-trigger: top-level object with `properties.args` of `type: 'array'` and no `items`. This is the bug the sanitizer was written for. |
| `playwright-fill-form.json` | `mcp__playwright__browser_fill_form` | Nested array-without-items inside an items.properties subtree — sanitizer must recurse, not just patch the top level. |
| `playwright-navigate.json` | `mcp__playwright__browser_navigate` | Pristine, no arrays. Control: sanitizer output must be deep-equal to input. |
| `engram-mem-search.json` | `mcp__engram__mem_search` | `oneOf` branch where one alternative has an inner array missing items. Exercises the `oneOf` recursion path. |
| `browser-use-deep-research.json` | `mcp__browser-use__run_deep_research` | A second top-level array-without-items (`tools_allowed`) plus a properly-formed `sources` array. Catches mixed valid/invalid array peers. |
| `filesystem-read.json` | `Read` | Built-in filesystem tool. No arrays, all primitives — should pass through unchanged. |
| `playwright-evaluate.json` | `mcp__playwright__browser_evaluate` | `anyOf` whose branches include an array missing items. Sanitizer must recurse through `anyOf`. |
| `safari-list-sessions.json` | `mcp__safari__safari_list_sessions` | Empty `properties` object. Edge case: sanitizer must not add stray fields. |

## Adding a new fixture

1. Drop the file in this directory with the same `{ name, description,
   input_schema, _source }` shape.
2. The catalog test discovers it automatically.
3. Update the table above.

## Constraints

- No real API keys, no real session ids.
- `_source` must explain what schema variation the fixture covers — the
  fixture earns its keep by representing a concrete shape, not by piling on.
