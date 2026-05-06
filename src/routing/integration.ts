// Integration adapter — the only bridge between messy runtime context and
// the pure selectModel router. Anyone who wants the auto-routing decision
// goes through here.
//
// Why a separate file (rather than expanding router.ts):
//   router.ts is intentionally pure (no I/O, no clock, no env). This file
//   reads process.env.FREE_CODE_LANG, writes to process.stderr, touches the
//   in-memory decisionLog. Keeping the impure surface here means the core
//   routing logic stays trivially unit-testable.
//
// The token-estimation rule (text.length / 4) is a deliberate
// approximation — good enough to detect the >100k threshold without
// pulling in a real tokenizer. Tighter estimates can land in a follow-up.

import { selectModel, type RouteDecision } from './router.ts'
import type { ModelProvider } from './registry.ts'
import { tError } from '../i18n/errors.ts'
import { resolveLocaleFromEnv, type Locale } from '../i18n/translator.ts'
import { recordDecision } from './decisionLog.ts'

export type RoutingContext = {
  /** Last user message text (used for keyword detection + token estimate). */
  userPromptText: string
  /** Total messages so far in the conversation. */
  historyTurnCount: number
  hasImages: boolean
  hasTools: boolean
  /** Optional pre-computed estimate; otherwise ceil(text.length / 4). */
  promptTokensEstimate?: number
  /** 999_999 if effectively unlimited. */
  budgetRemainingUsd?: number
  /** From CLI/config. If set, takes precedence over auto routing. */
  explicitModel?: string
  provider: ModelProvider
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

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase()
  const hits: string[] = []
  for (const kw of HEAVY_KEYWORDS) {
    if (lower.includes(kw)) hits.push(kw)
  }
  for (const kw of LIGHT_KEYWORDS) {
    if (lower.includes(kw)) hits.push(kw)
  }
  return hits
}

export function decideModelForRequest(ctx: RoutingContext): RouteDecision {
  const promptTokens =
    ctx.promptTokensEstimate ?? Math.ceil(ctx.userPromptText.length / 4)

  const decision = selectModel({
    signals: {
      promptTokens,
      turnCount: ctx.historyTurnCount,
      hasTools: ctx.hasTools,
      hasImages: ctx.hasImages,
      keywords: extractKeywords(ctx.userPromptText),
      budgetRemainingUsd: ctx.budgetRemainingUsd ?? 999_999,
    },
    provider: ctx.provider,
    override: ctx.explicitModel ? { model: ctx.explicitModel } : undefined,
  })
  return decision
}

/**
 * Render the single-line banner that goes to stderr. Pure function — takes
 * the locale explicitly so tests don't have to fiddle with env vars.
 *
 * Format (zh-CN):  → 使用 model {{modelId}}（{{source}}: {{tier}} 档）
 * Format (en-US):  → using model {{modelId}} ({{source}}: {{tier}} tier)
 */
export function formatBanner(decision: RouteDecision, locale: Locale): string {
  const key =
    decision.source === 'override'
      ? 'routing.banner.override'
      : 'routing.banner.auto'
  // We deliberately call errorMessage with locale-aware translator. errorMessage
  // is process-global and picks up FREE_CODE_LANG; for deterministic locale
  // selection we build the string by hand from the chosen locale's dict.
  const dict = locale === 'zh-CN' ? bannerDict.zh : bannerDict.en
  const template = dict[key]
  return interpolate(template, {
    modelId: decision.model.id,
    source: decision.source,
    tier: decision.tier,
  })
}

const bannerDict = {
  zh: {
    'routing.banner.auto': '→ 使用 model {{modelId}}（{{source}}: {{tier}} 档）',
    'routing.banner.override':
      '→ 使用 model {{modelId}}（{{source}}: {{tier}} 档）',
  },
  en: {
    'routing.banner.auto':
      '→ using model {{modelId}} ({{source}}: {{tier}} tier)',
    'routing.banner.override':
      '→ using model {{modelId}} ({{source}}: {{tier}} tier)',
  },
} as const

function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name) =>
    name in vars ? String(vars[name]) : m,
  )
}

/**
 * Emit one banner line to stderr and record the decision. Single side-effect
 * surface used by the dispatch path. Tests exercise this directly because
 * spinning up the full queryModel pipeline just to assert one stderr write
 * is wildly out of scale for what we're verifying.
 */
export function emitBannerForDecision(
  decision: RouteDecision,
  ctx: Partial<RoutingContext>,
  locale?: Locale,
): void {
  const lang = locale ?? resolveLocaleFromEnv(process.env)
  const line = formatBanner(decision, lang)
  process.stderr.write(line + '\n')
  recordDecision(decision, ctx)
}

// Re-export for convenience — also keeps errorMessage referenced so the
// import isn't tree-shaken (it remains the canonical path for other strings
// added in follow-ups).
export { errorMessage }
