// Pure scoring function. Given signals → produce (tier, reasons).
// No I/O, no randomness, no clock — fully deterministic so it can be
// unit-tested by equality.
//
// Decision order (later rules can override earlier ones EXCEPT the budget
// guard, which is final):
//   1. start at medium
//   2. light keyword → light
//   3. heavy keyword → heavy
//   4. promptTokens > 100k → heavy; > 20k → at least medium
//   5. turnCount > 10 → at least medium
//   6. hasImages → at least medium (vision required, light tier may lack it)
//   7. budgetRemainingUsd < 1 → light (FINAL — cost guard wins)

import type { ModelTier } from './registry.ts'

export type RoutingSignals = {
  promptTokens: number
  turnCount: number
  hasTools: boolean
  hasImages: boolean
  /** lowercased best, but the function lowercases defensively anyway */
  keywords: string[]
  /** 999999 if effectively unlimited */
  budgetRemainingUsd: number
}

export type TierDecision = {
  tier: ModelTier
  reasons: string[]
}

const HEAVY_KEYWORDS = [
  'refactor',
  '重构',
  'architect',
  'design from scratch',
  'ultraplan',
  'ultrathink',
]

const LIGHT_KEYWORDS = ['hello', 'what is', 'explain briefly']

const TIER_ORDER: ModelTier[] = ['light', 'medium', 'heavy']
function atLeast(current: ModelTier, floor: ModelTier): ModelTier {
  return TIER_ORDER.indexOf(current) >= TIER_ORDER.indexOf(floor)
    ? current
    : floor
}

export function pickTier(signals: RoutingSignals): TierDecision {
  const reasons: string[] = []
  let tier: ModelTier = 'medium'
  reasons.push('default → medium')

  const kws = signals.keywords.map(k => k.toLowerCase())

  // Light keywords — only meaningful as a downgrade signal when nothing
  // else escalates. Apply tentatively; later rules can override.
  const lightHit = LIGHT_KEYWORDS.find(k => kws.some(w => w.includes(k)))
  if (lightHit) {
    tier = 'light'
    reasons.push(`light keyword:${lightHit} → light`)
  }

  // Heavy keywords win over light keywords.
  const heavyHit = HEAVY_KEYWORDS.find(k => kws.some(w => w.includes(k)))
  if (heavyHit) {
    tier = 'heavy'
    reasons.push(`keyword:${heavyHit} → heavy`)
  }

  // Prompt-size escalation.
  if (signals.promptTokens > 100_000) {
    tier = 'heavy'
    reasons.push(`promptTokens=${signals.promptTokens} → heavy`)
  } else if (signals.promptTokens > 20_000) {
    const next = atLeast(tier, 'medium')
    if (next !== tier) reasons.push(`promptTokens=${signals.promptTokens} → bump to medium`)
    tier = next
  }

  // Long conversation → at least medium.
  if (signals.turnCount > 10) {
    const next = atLeast(tier, 'medium')
    if (next !== tier) reasons.push(`turnCount=${signals.turnCount} → bump to medium`)
    tier = next
  }

  // Vision requirement: the light tier may lack vision (e.g., gpt-4o-mini).
  // Bump to at least medium so both providers' tier models support images.
  if (signals.hasImages) {
    const next = atLeast(tier, 'medium')
    if (next !== tier) reasons.push('hasImages → bump for vision support')
    else reasons.push('hasImages noted (current tier already supports vision)')
    tier = next
  }

  // FINAL: cost guard. Cheap-only mode regardless of complexity.
  if (signals.budgetRemainingUsd < 1) {
    tier = 'light'
    reasons.push(`budget=$${signals.budgetRemainingUsd} < $1 → force light (cost guard)`)
  }

  return { tier, reasons }
}
