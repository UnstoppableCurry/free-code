// Regression suite: the OpenAI sanitizer must handle every shape we see in
// the wild. Backed by tests/fixtures/mcp-tools/*.json — drop a new fixture
// in that directory and it gets picked up automatically.
//
// The unit tests in `sanitize-schema.test.ts` cover the sanitizer's logic on
// synthetic schemas. This file pins the sanitizer against representative
// real-world MCP tool schemas, so future MCP additions can't reintroduce the
// HTTP 400 bug fixed in f0f50b3.

import { describe, test, expect } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  sanitizeJsonSchemaForOpenAI,
  toOpenAIRequest,
  type NormalizedTool,
} from '../../src/services/api/adapter/normalize.js'

const FIXTURE_DIR = join(import.meta.dir, '..', 'fixtures', 'mcp-tools')

type Fixture = {
  name: string
  description: string
  input_schema: Record<string, unknown>
  _source?: string
}

function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8'))
      return {
        name: raw.name,
        description: raw.description,
        input_schema: raw.input_schema,
        _source: raw._source,
        _file: f,
      } as Fixture & { _file: string }
    })
}

function asTool(f: Fixture): NormalizedTool {
  return {
    name: f.name,
    description: f.description,
    input_schema: f.input_schema,
  }
}

// Walk a JSON Schema (post-sanitize) and collect rule violations. Returns the
// list of dotted paths that fail. Empty list = clean.
function findArrayWithoutItems(node: unknown, path: string[] = []): string[] {
  const offences: string[] = []
  if (node == null || typeof node !== 'object') return offences
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      offences.push(...findArrayWithoutItems(v, [...path, String(i)]))
    })
    return offences
  }
  const obj = node as Record<string, unknown>
  if (obj.type === 'array' && obj.items === undefined) {
    offences.push(path.join('.') || '<root>')
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') {
      offences.push(...findArrayWithoutItems(v, [...path, k]))
    }
  }
  return offences
}

function findAdditionalPropertiesFalseAdded(
  before: unknown,
  after: unknown,
  path: string[] = [],
): string[] {
  // Check the sanitizer didn't sneak `additionalProperties: false` in.
  const offences: string[] = []
  if (after == null || typeof after !== 'object') return offences
  if (Array.isArray(after)) {
    if (Array.isArray(before)) {
      after.forEach((v, i) =>
        offences.push(
          ...findAdditionalPropertiesFalseAdded(before[i], v, [...path, String(i)]),
        ),
      )
    }
    return offences
  }
  const a = after as Record<string, unknown>
  const b = (before ?? {}) as Record<string, unknown>
  if (a.additionalProperties === false && b.additionalProperties !== false) {
    offences.push(path.join('.') || '<root>')
  }
  for (const k of Object.keys(a)) {
    if (a[k] && typeof a[k] === 'object') {
      offences.push(...findAdditionalPropertiesFalseAdded(b[k], a[k], [...path, k]))
    }
  }
  return offences
}

const FIXTURES = loadFixtures()

describe('MCP catalog regression: every fixture survives toOpenAIRequest()', () => {
  test('fixture directory is non-empty (catches accidental deletion)', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(5)
  })

  for (const f of FIXTURES) {
    test(`${(f as any)._file}: parameters has no array-without-items`, () => {
      const body = toOpenAIRequest({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
        maxTokens: 64,
        tools: [asTool(f)],
      })
      const params = body.tools![0].function.parameters
      const offences = findArrayWithoutItems(params)
      expect(offences).toEqual([])
    })

    test(`${(f as any)._file}: sanitizer does not add additionalProperties:false`, () => {
      const offences = findAdditionalPropertiesFalseAdded(
        f.input_schema,
        sanitizeJsonSchemaForOpenAI(f.input_schema),
      )
      expect(offences).toEqual([])
    })
  }
})

describe('MCP catalog regression: pinned bug — Safari execute_script', () => {
  // If someone removes the sanitizer call from toOpenAIRequest, this test
  // goes red. Pre-sanitize the schema must contain the broken pattern;
  // post-sanitize it must be clean.
  const safari = FIXTURES.find(
    (f) => f.name === 'mcp__safari__safari_execute_script',
  )

  test('the failing schema fixture exists', () => {
    expect(safari).toBeDefined()
  })

  test('pre-sanitize: the broken pattern is present (proves the fixture still bites)', () => {
    const offences = findArrayWithoutItems(safari!.input_schema)
    expect(offences.length).toBeGreaterThan(0)
    expect(offences).toContain('properties.args')
  })

  test('post-sanitize via toOpenAIRequest: the broken pattern is gone', () => {
    const body = toOpenAIRequest({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      maxTokens: 64,
      tools: [asTool(safari!)],
    })
    const offences = findArrayWithoutItems(body.tools![0].function.parameters)
    expect(offences).toEqual([])
  })
})

describe('MCP catalog regression: extension safety / corner cases', () => {
  test('empty schema {} passes through unchanged', () => {
    expect(sanitizeJsonSchemaForOpenAI({})).toEqual({})
  })

  test('schema with $ref is left alone (no dereference attempt)', () => {
    const schema = {
      type: 'object',
      properties: {
        ref_field: { $ref: '#/definitions/Foo' },
      },
      definitions: {
        Foo: { type: 'string' },
      },
    }
    const out = sanitizeJsonSchemaForOpenAI(schema) as any
    expect(out.properties.ref_field).toEqual({ $ref: '#/definitions/Foo' })
    expect(out.definitions.Foo).toEqual({ type: 'string' })
  })

  test('enum of arrays is preserved literally (enum values are not schemas)', () => {
    const schema = {
      type: 'array',
      items: { type: 'string' },
      enum: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    }
    const out = sanitizeJsonSchemaForOpenAI(schema) as any
    expect(out.enum).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  test('deeply nested arrays (5+ levels) all get items', () => {
    // 5-level array nest, every level missing items.
    let leaf: any = { type: 'array' }
    for (let i = 0; i < 5; i++) leaf = { type: 'array', items: leaf }
    // Make the innermost-original missing — outer wrappers already supply items
    // for the level below them, but the innermost one has no items field.
    const out = sanitizeJsonSchemaForOpenAI(leaf) as any
    const offences = findArrayWithoutItems(out)
    expect(offences).toEqual([])
  })

  test('large schema (100 properties) sanitizes in <50ms', () => {
    const properties: Record<string, unknown> = {}
    for (let i = 0; i < 100; i++) {
      // Half have arrays missing items, half are fine.
      properties[`field_${i}`] =
        i % 2 === 0
          ? { type: 'array' }
          : { type: 'string' }
    }
    const schema = { type: 'object', properties }
    const t0 = performance.now()
    const out = sanitizeJsonSchemaForOpenAI(schema)
    const dt = performance.now() - t0
    expect(findArrayWithoutItems(out)).toEqual([])
    expect(dt).toBeLessThan(50)
  })
})
