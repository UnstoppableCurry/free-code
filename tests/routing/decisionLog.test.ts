// RED: contract for the in-memory decision log used by /why-this-model.
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  recordDecision,
  getRecentDecisions,
  clearDecisionLog,
} from '../../src/routing/decisionLog.ts'
import { decideModelForRequest } from '../../src/routing/integration.ts'

beforeEach(() => clearDecisionLog())

describe('routing/decisionLog', () => {
  test('records a decision and returns it from getRecentDecisions', () => {
    const d = decideModelForRequest({
      userPromptText: 'hi',
      historyTurnCount: 1,
      hasImages: false,
      hasTools: false,
      provider: 'anthropic',
      explicitModel: 'claude-opus-4-7',
    })
    recordDecision(d, { provider: 'anthropic' })
    const out = getRecentDecisions()
    expect(out.length).toBe(1)
    expect(out[0].decision.model.id).toBe(d.model.id)
    expect(out[0].ctx.provider).toBe('anthropic')
    expect(typeof out[0].at).toBe('number')
  })

  test('queue keeps only last 10 decisions', () => {
    for (let i = 0; i < 15; i++) {
      const d = decideModelForRequest({
        userPromptText: `q${i}`,
        historyTurnCount: i,
        hasImages: false,
        hasTools: false,
        provider: 'anthropic',
        explicitModel: 'claude-sonnet-4-6',
      })
      recordDecision(d, { provider: 'anthropic' })
    }
    const out = getRecentDecisions()
    expect(out.length).toBe(10)
    const lastCtx = out[out.length - 1].ctx
    expect(lastCtx.provider).toBe('anthropic')
  })

  test('getRecentDecisions returns a frozen array (no caller mutation)', () => {
    const d = decideModelForRequest({
      userPromptText: 'x',
      historyTurnCount: 1,
      hasImages: false,
      hasTools: false,
      provider: 'openai',
      explicitModel: 'gpt-4o',
    })
    recordDecision(d, { provider: 'openai' })
    const out = getRecentDecisions()
    expect(Object.isFrozen(out)).toBe(true)
  })
})
