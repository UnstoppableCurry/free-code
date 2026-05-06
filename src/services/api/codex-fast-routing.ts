// Codex /fast subscription routing — relay path.
//
// Background: ChatGPT Plus/Pro users have a "fast" route on OpenAI's
// backend that gives them faster turnaround. The convertmodel.net relay
// MAY honor a `fast=1` query param to opt into this lane.
//
// Probe results recorded 2026-04 against convertmodel.net:
//   /v1/fast/chat/completions  → 404 (path does not exist)
//   /fast/v1/chat/completions  → 405 (legacy nginx mount, not real)
//   /v1/chat/completions?fast=1 → 401 (auth check happens first; path valid,
//                                      query param accepted by request parser)
//   /v1/pricing                → 404 (not exposed)
//
// We CANNOT positively confirm the relay actually honors `fast=1` without
// a live API key + Codex OAuth token. So this implementation is opt-in
// behind FREE_CODE_CODEX_FAST=1. Worst case when the relay ignores the
// param: it's a no-op (the URL has an extra query param the relay drops).
//
// Activation conditions (all must hold):
//   1. FREE_CODE_CODEX_FAST=1 (or any truthy value: 1/true/yes/on)
//   2. Codex OAuth token present (CODEX_OAUTH_TOKEN env or auth payload)
//   3. Model is not light-tier (haiku/mini/nano/flash) — those don't
//      benefit from fast routing
//   4. URL host is a known relay (convertmodel.net or similar) — we don't
//      inject query params into a user's self-hosted gateway

const FAST_ROUTING_ELIGIBLE_RELAY_HOSTS = new Set([
  'convertmodel.net',
  'www.convertmodel.net',
  // Add additional relays here as they confirm fast-routing support.
])

/**
 * Reads any of: CODEX_OAUTH_TOKEN env var, or (in future) the persisted
 * auth payload. For now env-only; payload integration is a follow-up.
 */
function hasCodexAuth(): boolean {
  if (process.env.CODEX_OAUTH_TOKEN && process.env.CODEX_OAUTH_TOKEN.length > 0) {
    return true
  }
  // Future: peek at the auth payload via getCodexOAuthTokens() — left out
  // for now to keep this module dependency-free for testing.
  return false
}

function isEnvFlagOn(name: string): boolean {
  const v = process.env[name]
  if (!v) return false
  const lower = v.toLowerCase()
  return lower === '1' || lower === 'true' || lower === 'yes' || lower === 'on'
}

function isLightTierModel(model: string): boolean {
  const m = model.toLowerCase()
  return (
    m.includes('haiku') ||
    m.includes('mini') ||
    m.includes('nano') ||
    m.includes('flash') ||
    m.includes('lite') ||
    m.includes('small')
  )
}

/**
 * Decides whether the current request should be routed through the relay's
 * fast lane. Returns true only when ALL gating conditions hold.
 */
export function isCodexFastEligible(model: string): boolean {
  if (!isEnvFlagOn('FREE_CODE_CODEX_FAST')) return false
  if (!hasCodexAuth()) return false
  if (isLightTierModel(model)) return false
  return true
}

/**
 * Returns the URL with `?fast=1` injected when eligible, otherwise
 * returns the URL unchanged. Idempotent: calling on a URL that already
 * has fast=1 doesn't duplicate it. Only injects on known relay hosts.
 */
export function buildRelayUrlWithFastRouting(
  rawUrl: string,
  eligible: boolean,
): string {
  if (!eligible) return rawUrl
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return rawUrl
  }
  if (!FAST_ROUTING_ELIGIBLE_RELAY_HOSTS.has(parsed.host)) {
    return rawUrl
  }
  // Idempotent: don't append a duplicate fast=1.
  if (parsed.searchParams.get('fast') === '1') {
    return rawUrl
  }
  parsed.searchParams.set('fast', '1')
  return parsed.toString()
}
