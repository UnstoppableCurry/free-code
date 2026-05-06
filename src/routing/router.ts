// Orchestrator that combines override + heuristics + registry into a
// single decision. Pure function — same input → same output.

import {
  getModelInfo,
  getByTier,
  type ModelInfo,
  type ModelProvider,
  type ModelTier,
} from './registry.ts'
import { pickTier, type RoutingSignals } from './heuristics.ts'
import { RoutingError } from './errors.ts'

export type RouteOverride = {
  /** explicit model id; if matches registry, used as-is */
  model?: string
}

export type RouteDecision = {
  model: ModelInfo
  tier: ModelTier
  source: 'override' | 'auto'
  reasons: string[]
}

export function selectModel(args: {
  signals: RoutingSignals
  provider: ModelProvider
  override?: RouteOverride
}): RouteDecision {
  const { signals, provider, override } = args

  if (override?.model) {
    // No hardcoded list — getModelInfo infers capabilities for any id.
    // The relay is the authoritative source of truth on what's actually
    // accepted; if the relay rejects it we surface the error at request
    // time, not here.
    const info = getModelInfo(override.model)
    return {
      model: info,
      tier: info.tier,
      source: 'override',
      reasons: ['user override'],
    }
  }

  // Auto path: pick a tier from heuristics, then look for an anchor.
  // No anchors are registered (intentional — see registry.ts), so this
  // returns undefined and we throw a clear error pointing the user at
  // explicit model selection. The CLI's upstream getDefaultModel() runs
  // before this, so in practice override.model is always set.
  const { tier, reasons } = pickTier(signals)
  const model = getByTier(provider, tier)
  if (!model) {
    throw new RoutingError(
      `No tier anchor registered for provider=${provider}, tier=${tier}. ` +
        `Pass --model <id> explicitly. (Auto-routing requires registered anchors.)`,
    )
  }
  return { model, tier, source: 'auto', reasons }
}
