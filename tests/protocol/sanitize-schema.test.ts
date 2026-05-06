import { describe, test, expect } from 'bun:test'
import {
  sanitizeJsonSchemaForOpenAI,
  toOpenAIRequest,
} from '../../src/services/api/adapter/normalize.js'

describe('sanitizeJsonSchemaForOpenAI', () => {
  test('adds items={} to array missing items at top level', () => {
    const out = sanitizeJsonSchemaForOpenAI({ type: 'array' })
    expect(out).toEqual({ type: 'array', items: {} })
  })

  test('adds items={} to array nested in properties', () => {
    const schema = {
      type: 'object',
      properties: {
        args: { type: 'array' },
      },
      required: ['args'],
    }
    const out = sanitizeJsonSchemaForOpenAI(schema) as any
    expect(out.properties.args.items).toEqual({})
    expect(out.required).toEqual(['args'])
  })

  test('preserves existing items', () => {
    const schema = {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
      },
    }
    const out = sanitizeJsonSchemaForOpenAI(schema) as any
    expect(out.properties.tags.items).toEqual({ type: 'string' })
  })

  test('recurses into oneOf / anyOf', () => {
    const schema = {
      oneOf: [{ type: 'array' }, { type: 'string' }],
    }
    const out = sanitizeJsonSchemaForOpenAI(schema) as any
    expect(out.oneOf[0].items).toEqual({})
    expect(out.oneOf[1]).toEqual({ type: 'string' })
  })

  test('handles nested arrays of arrays', () => {
    const schema = {
      type: 'array',
      items: { type: 'array' }, // inner array also missing items
    }
    const out = sanitizeJsonSchemaForOpenAI(schema) as any
    expect(out.items.items).toEqual({})
  })

  test('does not mutate input', () => {
    const schema = { type: 'array' }
    const out = sanitizeJsonSchemaForOpenAI(schema)
    expect(schema).toEqual({ type: 'array' })
    expect(out).not.toBe(schema)
  })

  test('passes primitives through', () => {
    expect(sanitizeJsonSchemaForOpenAI(null as any)).toBe(null)
    expect(sanitizeJsonSchemaForOpenAI('hi' as any)).toBe('hi')
    expect(sanitizeJsonSchemaForOpenAI(42 as any)).toBe(42)
  })
})

describe('toOpenAIRequest applies sanitisation to tool parameters', () => {
  test('flaky MCP-style tool with array missing items gets fixed in wire body', () => {
    const body = toOpenAIRequest({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      maxTokens: 64,
      tools: [
        {
          name: 'mcp__safari__safari_execute_script',
          description: 'Execute JS in Safari',
          input_schema: {
            type: 'object',
            properties: {
              args: { type: 'array' }, // ← the offender
              script: { type: 'string' },
            },
            required: ['script'],
          },
        },
      ],
    })
    const parameters = body.tools![0].function.parameters as any
    expect(parameters.properties.args.items).toEqual({})
    expect(parameters.properties.script).toEqual({ type: 'string' })
  })
})
