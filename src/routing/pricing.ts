// Per-model pricing table. Source: public 2026 vendor pricing pages
// (Anthropic, OpenAI, DeepSeek, Moonshot, Google, Z.AI, Alibaba, MiniMax).
//
// Why this exists: routing/registry.ts inferred prices from tier medians
// ($1/$4 medium, $10/$40 heavy). For /cost reporting that's off by up to
// 7.5x in either direction. This table replaces tier medians with realistic
// per-model prices for the flagships we route to. getPricing() reads the
// table first; unknown ids fall back to pattern inference (still tighter
// than registry's medians).
//
// Prices are per 1M tokens, input / output. Cache pricing is intentionally
// NOT modeled here — cost-tracker uses MODEL_COSTS in utils/modelCost.ts
// for the Anthropic-native path which already knows cache pricing. This
// table is consulted only when the model is not in MODEL_COSTS (i.e. relay
// models like gpt-5.x, deepseek, kimi, gemini, glm, qwen, minimax).

export type ModelPricing = {
  /** USD per 1M input tokens */
  input: number
  /** USD per 1M output tokens */
  output: number
}

// Keys are lowercase model ids exactly as they appear on the relay.
// Values: 2026 ballpark prices per public vendor docs at time of writing.
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ── OpenAI / GPT-5 family ─────────────────────────────────────────────
  // gpt-5.5: $12 / $50 (heavy reasoning flagship)
  'gpt-5.5': { input: 12.0, output: 50.0 },
  // gpt-5.4: $10 / $40
  'gpt-5.4': { input: 10.0, output: 40.0 },
  // gpt-5.2: $8 / $32
  'gpt-5.2': { input: 8.0, output: 32.0 },
  // gpt-5.1 base
  'gpt-5.1': { input: 5.0, output: 20.0 },
  // gpt-5 base (released early 2025)
  'gpt-5': { input: 3.0, output: 12.0 },
  // gpt-5-codex variants — codex models are pricier
  'gpt-5-codex': { input: 15.0, output: 60.0 },
  'gpt-5.1-codex': { input: 12.0, output: 50.0 },
  'gpt-5.1-codex-max': { input: 15.0, output: 60.0 },
  'gpt-5.1-codex-mini': { input: 1.5, output: 6.0 },
  'gpt-5.2-codex': { input: 15.0, output: 60.0 },
  // gpt-5-mini / nano (light tier)
  'gpt-5-mini': { input: 0.4, output: 1.6 },
  'gpt-5-nano': { input: 0.1, output: 0.4 },
  'gpt-5.1-mini': { input: 0.5, output: 2.0 },
  'gpt-5.2-mini': { input: 0.6, output: 2.4 },

  // ── OpenAI / o-series ──────────────────────────────────────────────────
  'o3-pro': { input: 20.0, output: 80.0 },
  o3: { input: 8.0, output: 32.0 },
  'o3-mini': { input: 1.1, output: 4.4 },
  'o4-mini': { input: 1.1, output: 4.4 },
  o1: { input: 15.0, output: 60.0 },
  'o1-mini': { input: 1.1, output: 4.4 },

  // ── OpenAI / GPT-4.x (legacy) ──────────────────────────────────────────
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },

  // ── Anthropic / Claude family ──────────────────────────────────────────
  // Pricing source: https://www.anthropic.com/pricing
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
  'claude-opus-4-6': { input: 5.0, output: 25.0 },
  'claude-opus-4-5': { input: 5.0, output: 25.0 },
  'claude-opus-4-1': { input: 15.0, output: 75.0 },
  'claude-opus-4': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-7': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-sonnet-4': { input: 3.0, output: 15.0 },
  'claude-3-7-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-3-5-haiku': { input: 0.8, output: 4.0 },

  // ── Google / Gemini family ─────────────────────────────────────────────
  'gemini-3-pro': { input: 3.0, output: 12.0 },
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'gemini-2.5-flash': { input: 0.075, output: 0.3 },
  'gemini-2.0-pro': { input: 1.0, output: 4.0 },
  'gemini-2.0-flash': { input: 0.075, output: 0.3 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },

  // ── DeepSeek family ────────────────────────────────────────────────────
  'deepseek-v4-pro': { input: 0.55, output: 2.2 },
  'deepseek-v4': { input: 0.27, output: 1.1 },
  'deepseek-v3.2': { input: 0.14, output: 0.55 },
  'deepseek-v3': { input: 0.14, output: 0.28 },
  'deepseek-r1': { input: 0.55, output: 2.19 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  'deepseek-chat': { input: 0.27, output: 1.1 },

  // ── Moonshot / Kimi family ─────────────────────────────────────────────
  'kimi-k2-thinking': { input: 0.6, output: 2.5 },
  'kimi-k2': { input: 0.6, output: 2.5 },
  'moonshot-v1-128k': { input: 0.6, output: 2.5 },
  'moonshot-v1-32k': { input: 0.4, output: 1.5 },
  'moonshot-v1-8k': { input: 0.2, output: 0.8 },

  // ── MiniMax family ─────────────────────────────────────────────────────
  'minimax-m1': { input: 0.4, output: 2.2 },
  'minimax-text-01': { input: 0.2, output: 1.1 },
  'abab6.5s': { input: 0.4, output: 1.6 },

  // ── Z.AI / GLM family ──────────────────────────────────────────────────
  'glm-4.6': { input: 0.6, output: 2.2 },
  'glm-4.5': { input: 0.5, output: 2.0 },
  'glm-4-plus': { input: 0.5, output: 1.5 },

  // ── Alibaba / Qwen family ──────────────────────────────────────────────
  'qwen-max-latest': { input: 1.6, output: 6.4 },
  'qwen-max': { input: 1.6, output: 6.4 },
  'qwen-plus': { input: 0.4, output: 1.2 },
  'qwen-turbo': { input: 0.05, output: 0.2 },
  'qwen3-coder-plus': { input: 1.0, output: 4.0 },
  // 2026-04 公开定价，可能与 relay 实际计费有偏差（relay markup 未知）
  'qwen3-coder': { input: 0.2, output: 0.8 },
}

/**
 * Look up pricing for a model id. Tries the exact table first (case-
 * insensitive), then falls back to pattern inference.
 *
 * Pattern fallback is tighter than registry tier-medians:
 *   opus-like     → $12/$50
 *   haiku-like    → $1/$4
 *   gpt-5-mini    → $0.4/$1.6
 *   gpt-5-nano    → $0.1/$0.4
 *   gpt-5         → $5/$20
 *   o-series-pro  → $15/$60
 *   o-series-mini → $1/$4
 *   gemini-pro    → $1.25/$10
 *   gemini-flash  → $0.1/$0.4
 *   deepseek-r*   → $0.55/$2.2
 *   deepseek      → $0.27/$1.1
 *   kimi/moonshot → $0.6/$2.5
 *   minimax/abab  → $0.4/$1.6
 *   glm           → $0.6/$2.2
 *   qwen-max      → $1.6/$6.4
 *   qwen          → $0.4/$1.2
 *   default       → $1/$4 (medium tier guess; same shape as registry but
 *                          retained as a final fallback for truly unknown ids)
 */
export function getPricing(id: string): ModelPricing {
  const lower = id.toLowerCase()
  if (MODEL_PRICING[lower]) {
    return MODEL_PRICING[lower]!
  }
  return inferPricing(lower)
}

function inferPricing(lower: string): ModelPricing {
  // Order matters: light hints beat heavy hints (gpt-5-mini contains '5'
  // but is light, not flagship).
  if (
    lower.includes('mini') ||
    lower.includes('nano') ||
    lower.includes('flash') ||
    lower.includes('haiku')
  ) {
    if (lower.includes('nano')) return { input: 0.1, output: 0.4 }
    if (lower.includes('flash')) return { input: 0.1, output: 0.4 }
    if (lower.includes('haiku')) return { input: 1.0, output: 4.0 }
    return { input: 0.4, output: 1.6 } // mini
  }

  // Opus / heavy reasoning flagships
  if (lower.includes('opus')) return { input: 12.0, output: 50.0 }

  // Codex variants
  if (lower.includes('codex')) return { input: 12.0, output: 50.0 }

  // GPT-5 family (without mini/nano modifiers)
  if (/^gpt-5/.test(lower)) {
    if (lower.includes('codex')) return { input: 12.0, output: 50.0 }
    return { input: 5.0, output: 20.0 }
  }

  // o-series
  if (/^o[1-9](\b|[a-z-])/.test(lower)) {
    if (lower.includes('pro')) return { input: 15.0, output: 60.0 }
    if (lower.includes('mini')) return { input: 1.0, output: 4.0 }
    return { input: 8.0, output: 32.0 }
  }

  // Gemini
  if (lower.startsWith('gemini')) {
    if (lower.includes('flash')) return { input: 0.1, output: 0.4 }
    return { input: 1.25, output: 10.0 }
  }

  // DeepSeek
  if (lower.startsWith('deepseek')) {
    if (lower.includes('r') || lower.includes('reasoner')) {
      return { input: 0.55, output: 2.2 }
    }
    return { input: 0.27, output: 1.1 }
  }

  // Kimi / Moonshot
  if (lower.includes('kimi') || lower.startsWith('moonshot')) {
    return { input: 0.6, output: 2.5 }
  }

  // MiniMax / abab
  if (lower.includes('minimax') || lower.startsWith('abab')) {
    return { input: 0.4, output: 1.6 }
  }

  // GLM
  if (lower.startsWith('glm')) return { input: 0.6, output: 2.2 }

  // Qwen
  if (lower.startsWith('qwen')) {
    if (lower.includes('max')) return { input: 1.6, output: 6.4 }
    return { input: 0.4, output: 1.2 }
  }

  // Claude — older variants land here only if not already in the table
  if (lower.startsWith('claude-')) {
    if (lower.includes('sonnet')) return { input: 3.0, output: 15.0 }
    return { input: 5.0, output: 20.0 }
  }

  // Final fallback: medium-tier guess
  return { input: 1.0, output: 4.0 }
}
