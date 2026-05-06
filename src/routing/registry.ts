// Model metadata, fully dynamic — no hardcoded list.
//
// Design (compatibility-first):
//   - MODEL_REGISTRY is INTENTIONALLY EMPTY. We do not maintain a list of
//     "supported" models. Whatever id the user passes — gpt-5.5, gemini-3,
//     kimi-k2-thinking, deepseek-v4-pro, glm-4.6, MiniMax-M1, qwen-max-latest,
//     or anything else the relay/API key accepts — flows through.
//   - getModelInfo(id) returns capabilities by pattern inference only.
//   - Auto-routing tier picking is a NO-OP without registered anchors. The
//     upstream CLI default model resolution still picks a default; explicit
//     --model X is the only path that has well-defined routing semantics.
//   - For /model menu population, dynamic /v1/models fetch is the right
//     answer (separate module).

export type ModelTier = 'light' | 'medium' | 'heavy'
export type ModelProvider = 'anthropic' | 'openai'

export type ModelInfo = {
  id: string
  provider: ModelProvider
  tier: ModelTier
  contextWindow: number
  supportsVision: boolean
  supportsTools: boolean
  priceInputPer1M: number
  priceOutputPer1M: number
  supportsReasoningEffort?: boolean
}

// EMPTY by design. Do not add hardcoded entries here.
export const MODEL_REGISTRY: ReadonlyArray<ModelInfo> = []

export function getById(id: string): ModelInfo | undefined {
  return MODEL_REGISTRY.find(m => m.id === id)
}

export function listForProvider(provider: ModelProvider): ModelInfo[] {
  return MODEL_REGISTRY.filter(m => m.provider === provider)
}

/**
 * Auto-routing tier picker. Returns undefined when no registered anchor
 * exists. Callers fall back to the explicit/default model from upstream
 * model resolution.
 */
export function getByTier(
  _provider: ModelProvider,
  _tier: ModelTier,
): ModelInfo | undefined {
  return undefined
}

// ── Pattern-based inference for any id ────────────────────────────────

const HEAVY_HINTS = [
  'opus',
  'pro',
  'max',
  'codex',
  'thinking',
  'r1',
  'reasoner',
  'ultra',
  'turbo',
] as const
const LIGHT_HINTS = ['mini', 'nano', 'flash', 'haiku', 'small', 'lite'] as const

const EFFORT_FAMILIES: ReadonlyArray<RegExp> = [
  /^o[1-9](\b|[a-z-])/,
  /^gpt-5/,
  /^deepseek-r/,
  /^deepseek-reasoner/,
  /thinking/i,
  /^claude-opus/,
]

const VISION_FAMILIES: ReadonlyArray<RegExp> = [
  /^claude-/,
  /^gpt-4o(?!-mini)/,
  /^gpt-4(\b|\.)/,
  /^gpt-5(\b|\.)/,
  /^o[34]/,
  /^gemini/,
  /^glm/,
  /^qwen/,
  /^chatgpt-/,
]

function inferTier(id: string): ModelTier {
  const lower = id.toLowerCase()
  // Light hints checked FIRST — 'gpt-5-mini' contains '5' but is light, not
  // a flagship. Same for nano/flash/haiku.
  for (const h of LIGHT_HINTS) if (lower.includes(h)) return 'light'
  for (const h of HEAVY_HINTS) if (lower.includes(h)) return 'heavy'
  // Bare vendor flagships (no size suffix) — version-cued.
  if (/^gpt-5(\b|\.)/.test(lower)) return 'heavy'
  if (/^claude-opus/.test(lower)) return 'heavy'
  if (/^gemini-(2\.5|3)/.test(lower)) return 'heavy'
  if (/^o[1-9](\b|[a-z-])/.test(lower)) return 'heavy'
  return 'medium'
}

function inferProvider(id: string): ModelProvider {
  if (/^claude-/i.test(id)) return 'anthropic'
  return 'openai'
}

function inferContextWindow(id: string): number {
  const lower = id.toLowerCase()
  if (lower.includes('gemini-3') || lower.includes('gemini-2.5'))
    return 2_000_000
  if (lower.includes('gemini-1.5')) return 1_000_000
  if (lower.includes('claude-opus-4-7') || lower.includes('1m')) return 1_000_000
  if (lower.includes('claude')) return 200_000
  if (lower.startsWith('gpt-5')) return 256_000
  if (lower.includes('deepseek-v4')) return 1_000_000
  if (lower.startsWith('deepseek')) return 128_000
  if (lower.includes('moonshot-v1-128k')) return 128_000
  if (lower.includes('kimi') || lower.startsWith('moonshot')) return 256_000
  if (lower.includes('minimax') || lower.startsWith('abab')) return 1_000_000
  if (lower.startsWith('glm')) return 200_000
  if (lower.startsWith('qwen')) return 256_000
  if (lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4'))
    return 200_000
  return 128_000
}

function inferSupportsReasoningEffort(id: string): boolean {
  return EFFORT_FAMILIES.some(re => re.test(id))
}

function inferSupportsVision(id: string): boolean {
  return VISION_FAMILIES.some(re => re.test(id))
}

/**
 * Look up model info by id. Pure pattern inference for tier/vision/context;
 * exact per-model pricing via routing/pricing.ts (with pattern fallback).
 *
 * Cost-tracker uses these prices for the relay path. Anthropic-native
 * still uses utils/modelCost.ts MODEL_COSTS (which knows cache pricing).
 */
export function getModelInfo(id: string): ModelInfo {
  const tier = inferTier(id)
  const provider = inferProvider(id)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getPricing } = require('./pricing.js') as {
    getPricing: (id: string) => { input: number; output: number }
  }
  const pricing = getPricing(id)
  return {
    id,
    provider,
    tier,
    contextWindow: inferContextWindow(id),
    supportsVision: inferSupportsVision(id),
    supportsTools: true,
    priceInputPer1M: pricing.input,
    priceOutputPer1M: pricing.output,
    supportsReasoningEffort: inferSupportsReasoningEffort(id),
  }
}
