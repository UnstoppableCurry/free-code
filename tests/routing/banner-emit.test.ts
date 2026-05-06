// RED: emitBannerForDecision writes the banner to process.stderr exactly once
// and records the decision in the in-memory log. This is the unit-testable
// surface that claude-openai.ts uses (instead of trying to spin up the full
// queryModel pipeline in tests).
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  emitBannerForDecision,
  decideModelForRequest,
} from '../../src/routing/integration.ts'
import {
  getRecentDecisions,
  clearDecisionLog,
} from '../../src/routing/decisionLog.ts'

beforeEach(() => clearDecisionLog())

describe('routing/integration.emitBannerForDecision', () => {
  test('writes a single line to stderr and records decision', () => {
    const original = process.stderr.write.bind(process.stderr)
    const captured: string[] = []
    // @ts-expect-error - simple monkey patch for test scope
    process.stderr.write = (chunk: string | Uint8Array): boolean => {
      captured.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
      return true
    }
    try {
      const d = decideModelForRequest({
        userPromptText: 'hello',
        historyTurnCount: 1,
        hasImages: false,
        hasTools: false,
        provider: 'anthropic',
        explicitModel: 'claude-sonnet-4-6',
      })
      emitBannerForDecision(d, { provider: 'anthropic' }, 'en-US')
      expect(captured.length).toBe(1)
      expect(captured[0]).toContain(d.model.id)
      expect(captured[0].endsWith('\n')).toBe(true)
    } finally {
      // @ts-expect-error - restore
      process.stderr.write = original
    }
    expect(getRecentDecisions().length).toBe(1)
  })

  test('zh-CN banner uses Chinese phrasing', () => {
    const original = process.stderr.write.bind(process.stderr)
    const captured: string[] = []
    // @ts-expect-error
    process.stderr.write = (chunk: string | Uint8Array): boolean => {
      captured.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
      return true
    }
    try {
      const d = decideModelForRequest({
        userPromptText: 'hi',
        historyTurnCount: 1,
        hasImages: false,
        hasTools: false,
        provider: 'openai',
        explicitModel: 'gpt-4o',
      })
      emitBannerForDecision(d, { provider: 'openai' }, 'zh-CN')
      expect(captured[0]).toContain('使用 model')
      expect(captured[0]).toContain('档')
    } finally {
      // @ts-expect-error
      process.stderr.write = original
    }
  })
})
