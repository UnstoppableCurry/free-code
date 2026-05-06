// In-memory ring buffer of routing decisions. Used by /why-this-model.
//
// Why a module-level array (and not a class):
//   The dispatch path needs to record decisions from multiple call sites
//   (claude.ts and claude-openai.ts), and the slash command needs to read
//   them from yet another site. A class instance would have to be threaded
//   through both — module-level state is the simplest thing that works
//   for a process-local read-only-mostly log.

import type { RouteDecision } from './router.ts'
import type { RoutingContext } from './integration.ts'

const MAX_ENTRIES = 10

export type DecisionLogEntry = {
  at: number
  decision: RouteDecision
  ctx: Partial<RoutingContext>
}

let buffer: DecisionLogEntry[] = []

export function recordDecision(
  decision: RouteDecision,
  ctx: Partial<RoutingContext>,
): void {
  buffer.push({ at: Date.now(), decision, ctx })
  if (buffer.length > MAX_ENTRIES) {
    buffer = buffer.slice(buffer.length - MAX_ENTRIES)
  }
}

export function getRecentDecisions(): ReadonlyArray<DecisionLogEntry> {
  return Object.freeze(buffer.slice())
}

/** Test-only: reset the buffer between cases. */
export function clearDecisionLog(): void {
  buffer = []
}
