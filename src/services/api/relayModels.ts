// Probe the OpenAI-compat relay's /v1/models endpoint and merge the result
// into additionalModelOptionsCache so the /model menu lists every id the
// API key actually serves — no hardcoded list.
//
// Invariant: this only runs when the user has CLAUDE_CODE_USE_OPENAI=1
// (i.e., the OpenAI-compat path is active). For first-party Anthropic
// users this is a no-op — their menu comes from the bootstrap API.

import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import { logError } from '../../utils/log.js'
import isEqual from 'lodash-es/isEqual.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { getModelInfo } from '../../routing/registry.js'

type ModelOption = {
  value: string
  label: string
  description: string
}

const DEFAULT_OPENAI_BASE = 'https://convertmodel.net'

/**
 * Filter relay catalogue down to ids worth showing in /model.
 * Skips:
 *   - dated snapshots (id contains YYYY-MM-DD or YYYY)
 *   - preview / experimental / realtime / audio variants
 *   - legacy gpt-3.5 family (long superseded)
 *   - image-only models (gpt-image-*) — not chat-completion targets
 *
 * Pattern-based, NOT a curated allow-list — when the relay adds a new
 * canonical id, it shows up automatically.
 */
function keepInMenu(id: string): boolean {
  const lower = id.toLowerCase()
  // Dated snapshot suffix.
  if (/-\d{4}-\d{2}-\d{2}\b/.test(id)) return false
  if (/-\d{4}\b/.test(id) && !/^claude-/.test(id)) return false
  // Variants we generally don't pick over their canonical sibling.
  if (/-preview\b/.test(lower)) return false
  if (/-realtime\b/.test(lower)) return false
  if (/-audio-preview\b/.test(lower)) return false
  // Legacy & non-chat.
  if (/^gpt-3(\.|-)/.test(lower)) return false
  if (/^gpt-image/.test(lower)) return false
  // Models with redundant -16k or -128k size suffix where the canonical
  // version already advertises the right context.
  if (/-16k\b/.test(lower)) return false
  return true
}

function buildModelOption(id: string): ModelOption {
  const info = getModelInfo(id)
  const ctx =
    info.contextWindow >= 1_000_000
      ? `${(info.contextWindow / 1_000_000).toFixed(0)}M context`
      : `${(info.contextWindow / 1000).toFixed(0)}K context`
  const tags: string[] = [info.tier]
  if (info.supportsReasoningEffort) tags.push('reasoning')
  if (info.supportsVision) tags.push('vision')
  return {
    value: id,
    label: id,
    description: `${ctx} · ${tags.join(' · ')}`,
  }
}

export async function fetchRelayModels(): Promise<void> {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_USE_OPENAI)) {
    return
  }
  const base = (process.env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE).replace(
    /\/+$/,
    '',
  )
  const auth =
    process.env.OPENAI_API_KEY ??
    process.env.ANTHROPIC_AUTH_TOKEN ??
    process.env.ANTHROPIC_API_KEY ??
    ''
  if (!auth) return

  try {
    const res = await fetch(`${base}/v1/models`, {
      headers: { authorization: `Bearer ${auth}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      logForDebugging(`[relayModels] HTTP ${res.status} from ${base}/v1/models`)
      return
    }
    const json = (await res.json()) as { data?: Array<{ id?: string }> }
    const rawIds = (json.data ?? [])
      .map(m => m.id)
      .filter((id): id is string => typeof id === 'string')

    if (rawIds.length === 0) {
      logForDebugging('[relayModels] empty list')
      return
    }

    // Trim noise. Relay catalogues include lots of dated snapshots, preview
    // variants, and legacy 3.5 dupes that just clutter the menu without
    // adding value over their canonical sibling.
    const ids = rawIds.filter(keepInMenu)
    logForDebugging(
      `[relayModels] received ${rawIds.length} ids, keeping ${ids.length} after filter`,
    )

    const options = ids.map(buildModelOption)
    const config = getGlobalConfig()
    // Relay catalogue REPLACES previous relay-sourced entries. Anything
    // we wrote before that's no longer in the filtered list (because the
    // filter rules tightened, or the relay dropped a model) gets removed.
    if (isEqual(config.additionalModelOptionsCache, options)) {
      logForDebugging('[relayModels] cache unchanged')
      return
    }
    logForDebugging(
      `[relayModels] populating cache with ${options.length} models from ${base}/v1/models`,
    )
    saveGlobalConfig(current => ({
      ...current,
      additionalModelOptionsCache: options,
    }))
  } catch (e) {
    logError(e)
  }
}

