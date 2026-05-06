// Live regression: load every MCP-tool fixture into a single request and send
// it to convertmodel.net. Catches future schema validators getting stricter or
// new fixture variants slipping through the sanitizer.
//
// Skipped by default. Enable with:
//   RUN_LIVE_TESTS=1 RELAY_KEY=<token> bun test tests/protocol/mcp-catalog-live.test.ts
//
// Mirrors tests/cli/replay/harness.ts:324 for the gating convention. Reads
// RELAY_KEY from env — never hardcoded.

import { describe, test, expect } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  toOpenAIRequest,
  type NormalizedTool,
} from '../../src/services/api/adapter/normalize.js'

const FIXTURE_DIR = join(import.meta.dir, '..', 'fixtures', 'mcp-tools')
const RELAY_BASE = 'https://convertmodel.net'

function shouldRunLive(): boolean {
  return (
    process.env.RUN_LIVE_TESTS === '1' || process.env.RUN_LIVE_TESTS === 'true'
  )
}

function loadAllTools(): NormalizedTool[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8'))
      return {
        name: raw.name,
        description: raw.description,
        input_schema: raw.input_schema,
      }
    })
}

describe('Live: full MCP catalog clears convertmodel.net validation', () => {
  if (!shouldRunLive()) {
    test.skip('RUN_LIVE_TESTS not set — skipping live relay round-trip', () => {})
    return
  }

  const relayKey = process.env.RELAY_KEY ?? process.env.OPENAI_API_KEY
  if (!relayKey) {
    test.skip('RELAY_KEY (or OPENAI_API_KEY) not set — skipping', () => {})
    return
  }

  test('POST /v1/chat/completions with all fixtures loaded returns 200, not 400', async () => {
    const tools = loadAllTools()
    const body = toOpenAIRequest({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'reply with the single word: ok' }] },
      ],
      maxTokens: 32,
      tools,
    })

    const res = await fetch(`${RELAY_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${relayKey}`,
      },
      body: JSON.stringify({ ...body, stream: false }),
    })

    if (res.status === 400) {
      const err = await res.text()
      throw new Error(
        `Relay rejected the request as malformed (400). This means a fixture's schema slipped past the sanitizer.\n\n${err}`,
      )
    }

    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.choices?.[0]?.message).toBeDefined()
  }, 60_000)
})
