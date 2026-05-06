#!/usr/bin/env node
// Self-contained smoke test for free-code's protocol adapter against
// convertmodel.net. Sends the SAME prompt over BOTH wire protocols and
// prints the normalized stream events from each, so we can see whether
// our adapter produces wire-compatible payloads that the relay accepts.
//
// Two scenarios:
//   1. text  — plain "say hello" round-trip
//   2. tool  — model is asked to call a get_weather(city) tool; we assert
//              both protocols emit a tool_use_start with name=get_weather
//              and an assembled JSON input containing a "city" field.
//
// Usage:
//   ANTHROPIC_BASE_URL=https://convertmodel.net/anthropic \
//   ANTHROPIC_AUTH_TOKEN=sk-... \
//   OPENAI_BASE_URL=https://convertmodel.net \
//   OPENAI_API_KEY=sk-... \
//     node tools/smoke-relay.mjs
//
// No mutation of the relay state — pure read (POST messages, stream the response).

const ANTHROPIC_BASE = process.env.ANTHROPIC_BASE_URL
const ANTHROPIC_KEY = process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY
const OPENAI_BASE = process.env.OPENAI_BASE_URL ?? 'https://convertmodel.net'
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ANTHROPIC_KEY

const ANTHROPIC_MODEL = process.env.SMOKE_ANTHROPIC_MODEL ?? 'claude-sonnet-4-5'
const OPENAI_MODEL = process.env.SMOKE_OPENAI_MODEL ?? 'gpt-5-codex'

if (!ANTHROPIC_BASE || !ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN')
  process.exit(2)
}

// ---- Inlined fragment of src/services/api/adapter/normalize.ts ----
// Only the bits we need for this smoke. Keep in sync if normalize.ts changes.

function fromAnthropicStreamEvent(event) {
  if (event.type === 'content_block_start') {
    const cb = event.content_block
    if (cb?.type === 'tool_use') {
      return { kind: 'tool_use_start', id: cb.id, name: cb.name }
    }
    return null
  }
  if (event.type === 'content_block_delta') {
    const d = event.delta
    if (d.type === 'text_delta') return { kind: 'text_delta', text: d.text }
    if (d.type === 'input_json_delta')
      return { kind: 'tool_input_delta', partial: d.partial_json }
    return null
  }
  if (event.type === 'message_delta') {
    const r = event.delta?.stop_reason
    return r ? { kind: 'message_stop', reason: r } : null
  }
  return null
}

function fromOpenAIStreamChunk(chunk) {
  const choice = chunk.choices?.[0]
  if (!choice) return null
  if (choice.finish_reason) {
    const map = { stop: 'end_turn', tool_calls: 'tool_use', length: 'max_tokens' }
    return { kind: 'message_stop', reason: map[choice.finish_reason] ?? 'end_turn' }
  }
  const delta = choice.delta
  if (!delta) return null
  if (delta.tool_calls?.length) {
    const tc = delta.tool_calls[0]
    if (tc.id && tc.function?.name) {
      return { kind: 'tool_use_start', id: tc.id, name: tc.function.name }
    }
    if (tc.function?.arguments !== undefined) {
      return { kind: 'tool_input_delta', partial: tc.function.arguments }
    }
  }
  if (typeof delta.content === 'string' && delta.content.length) {
    return { kind: 'text_delta', text: delta.content }
  }
  return null
}

// ---- Streaming SSE reader ----

async function* readSSE(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const dataLines = part
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
      if (dataLines.length === 0) continue
      const payload = dataLines.join('\n')
      if (payload === '[DONE]') return
      try {
        yield JSON.parse(payload)
      } catch {
        // ignore non-JSON keepalive
      }
    }
  }
}

// ---- HTTP drivers (parameterised so both scenarios share the same code) ----

async function anthropicStream({ prompt, tools }) {
  const url = `${ANTHROPIC_BASE.replace(/\/+$/, '')}/v1/messages`
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 256,
    stream: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
  }
  if (tools) body.tools = tools
  const t0 = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_KEY,
      authorization: `Bearer ${ANTHROPIC_KEY}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Anthropic HTTP ${res.status}: ${text.slice(0, 600)}`)
  }
  const events = []
  for await (const ev of readSSE(res)) {
    const norm = fromAnthropicStreamEvent(ev)
    if (norm) events.push(norm)
  }
  return { events, ms: Date.now() - t0 }
}

async function openaiStream({ prompt, tools }) {
  const url = `${OPENAI_BASE.replace(/\/+$/, '')}/v1/chat/completions`
  const body = {
    model: OPENAI_MODEL,
    max_tokens: 256,
    stream: true,
    messages: [{ role: 'user', content: prompt }],
  }
  if (tools) body.tools = tools
  const t0 = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 600)}`)
  }
  const events = []
  for await (const chunk of readSSE(res)) {
    const norm = fromOpenAIStreamChunk(chunk)
    if (norm) events.push(norm)
  }
  return { events, ms: Date.now() - t0 }
}

// ---- Per-scenario summarizers ----

function summarizeText(label, result) {
  const text = result.events
    .filter((e) => e.kind === 'text_delta')
    .map((e) => e.text)
    .join('')
  const stop = result.events.find((e) => e.kind === 'message_stop')
  console.log(`\n--- ${label} (${result.ms}ms) ---`)
  console.log(`events: ${result.events.length}`)
  console.log(`text:   ${JSON.stringify(text)}`)
  console.log(`stop:   ${stop?.reason ?? '(none)'}`)
  return { text, stop, count: result.events.length }
}

function summarizeTool(label, result) {
  const starts = result.events.filter((e) => e.kind === 'tool_use_start')
  const partials = result.events
    .filter((e) => e.kind === 'tool_input_delta')
    .map((e) => e.partial)
    .join('')
  const stop = result.events.find((e) => e.kind === 'message_stop')
  let parsed = null
  let parseErr = null
  if (partials.length) {
    try {
      parsed = JSON.parse(partials)
    } catch (e) {
      parseErr = e.message
    }
  }
  console.log(`\n--- ${label} (${result.ms}ms) ---`)
  console.log(`events:           ${result.events.length}`)
  console.log(`tool_use_starts:  ${starts.length}`)
  console.log(`tool name:        ${starts[0]?.name ?? '(none)'}`)
  console.log(`tool input raw:   ${JSON.stringify(partials)}`)
  console.log(`tool input parse: ${parsed ? JSON.stringify(parsed) : `FAILED (${parseErr})`}`)
  console.log(`stop:             ${stop?.reason ?? '(none)'}`)
  return { starts, partials, parsed, stop }
}

// ---- Scenarios ----

const TEXT_PROMPT = 'Reply with exactly one word: hello'

const TOOL_NAME = 'get_weather'
const TOOL_DESC = 'Return the weather for a city'
const TOOL_SCHEMA = {
  type: 'object',
  properties: { city: { type: 'string' } },
  required: ['city'],
}
const TOOL_PROMPT = "What's the weather in Tokyo? Use the tool."

async function runTextScenario() {
  console.log(`\n========== SCENARIO 1: text ==========`)
  console.log(`prompt: ${JSON.stringify(TEXT_PROMPT)}`)
  let anth, oai, fail = false
  try {
    anth = summarizeText('Anthropic via ' + ANTHROPIC_BASE, await anthropicStream({ prompt: TEXT_PROMPT }))
  } catch (e) {
    console.error('Anthropic path FAILED:', e.message)
    fail = true
  }
  try {
    oai = summarizeText('OpenAI via ' + OPENAI_BASE, await openaiStream({ prompt: TEXT_PROMPT }))
  } catch (e) {
    console.error('OpenAI path FAILED:', e.message)
    fail = true
  }
  console.log('\n--- text comparison ---')
  if (anth && oai) {
    console.log(`both succeeded: ${anth.text === oai.text ? 'IDENTICAL' : 'DIFFERENT'} text`)
    console.log(`anth length=${anth.text.length}, oai length=${oai.text.length}`)
    const pass = !!anth.text && !!oai.text && !!anth.stop && !!oai.stop
    console.log(`text scenario: ${pass ? 'PASS' : 'FAIL'}`)
    return pass && !fail
  }
  console.log('text scenario: FAIL (one or both paths errored)')
  return false
}

async function runToolScenario() {
  console.log(`\n========== SCENARIO 2: tool_use ==========`)
  console.log(`prompt: ${JSON.stringify(TOOL_PROMPT)}`)
  console.log(`tool:   ${TOOL_NAME}(${JSON.stringify(TOOL_SCHEMA)})`)

  const anthTools = [{ name: TOOL_NAME, description: TOOL_DESC, input_schema: TOOL_SCHEMA }]
  const oaiTools = [
    { type: 'function', function: { name: TOOL_NAME, description: TOOL_DESC, parameters: TOOL_SCHEMA } },
  ]

  let anth, oai, fail = false
  try {
    anth = summarizeTool(
      'Anthropic via ' + ANTHROPIC_BASE,
      await anthropicStream({ prompt: TOOL_PROMPT, tools: anthTools }),
    )
  } catch (e) {
    console.error('Anthropic path FAILED:', e.message)
    fail = true
  }
  try {
    oai = summarizeTool(
      'OpenAI via ' + OPENAI_BASE,
      await openaiStream({ prompt: TOOL_PROMPT, tools: oaiTools }),
    )
  } catch (e) {
    console.error('OpenAI path FAILED:', e.message)
    fail = true
  }

  console.log('\n--- tool_use acceptance ---')
  function ok(side, r) {
    if (!r) return false
    const hasStart = r.starts.some((s) => s.name === TOOL_NAME)
    const hasCity = r.parsed && typeof r.parsed === 'object' && typeof r.parsed.city === 'string'
    console.log(`${side}: tool_use_start(get_weather)=${hasStart}  parsed.city=${hasCity ? JSON.stringify(r.parsed.city) : 'NO'}`)
    return hasStart && hasCity
  }
  const anthOk = ok('anthropic', anth)
  const oaiOk = ok('openai   ', oai)
  const pass = anthOk && oaiOk && !fail
  console.log(`tool scenario: ${pass ? 'PASS' : 'FAIL'}`)
  return pass
}

;(async () => {
  console.log(`anthropic model: ${ANTHROPIC_MODEL}`)
  console.log(`openai model:    ${OPENAI_MODEL}`)

  const textOk = await runTextScenario()
  const toolOk = await runToolScenario()

  console.log('\n========== overall ==========')
  console.log(`text:     ${textOk ? 'PASS' : 'FAIL'}`)
  console.log(`tool_use: ${toolOk ? 'PASS' : 'FAIL'}`)
  if (!(textOk && toolOk)) process.exit(1)
})()
