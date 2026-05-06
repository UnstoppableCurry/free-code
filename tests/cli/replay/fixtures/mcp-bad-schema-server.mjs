#!/usr/bin/env node
/**
 * Stdio MCP server fixture.
 *
 * Registers a single tool whose `inputSchema` has `{type:"array"}` WITHOUT
 * an `items` member at the top level — exactly the shape that strict OpenAI
 * validators reject and that the f0f50b3 fix sanitizes.
 *
 * Hand-rolled JSON-RPC over stdio (no SDK dep) so the fixture is self-contained
 * and starts in <50ms. We only implement the methods free-code calls during
 * tool discovery: `initialize`, `tools/list`, and `tools/call`.
 */
import { createInterface } from 'node:readline'

const send = (msg) => {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

const rl = createInterface({ input: process.stdin })

rl.on('line', (line) => {
  let req
  try { req = JSON.parse(line) } catch { return }
  if (!req || typeof req !== 'object' || !('method' in req)) return

  const id = req.id ?? null

  if (req.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'bad-schema-fixture', version: '0.0.1' },
      },
    })
    return
  }

  if (req.method === 'notifications/initialized') {
    return
  }

  if (req.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'badArrayTool',
            description:
              'Regression fixture: array schema missing items. Sanitizer must patch this.',
            inputSchema: {
              // Top-level object property whose type is array, with NO items.
              // This is the exact shape from mcp__safari__safari_execute_script
              // that broke turn 2 of the live REPL before f0f50b3.
              type: 'object',
              properties: {
                tags: { type: 'array' },
                nested: {
                  type: 'object',
                  properties: {
                    extra: { type: 'array' },
                  },
                },
              },
            },
          },
          {
            name: 'echo',
            description: 'Echo a string back. Used to verify tool plumbing.',
            inputSchema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
            },
          },
        ],
      },
    })
    return
  }

  if (req.method === 'tools/call') {
    const params = req.params ?? {}
    const name = params.name
    const args = params.arguments ?? {}
    if (name === 'echo') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: String(args.text ?? '') }],
        },
      })
    } else {
      send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: 'ok' }] },
      })
    }
    return
  }

  // Unknown method — return method-not-found.
  send({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${req.method}` },
  })
})

rl.on('close', () => process.exit(0))
