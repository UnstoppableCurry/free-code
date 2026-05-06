// /diagnose-relay 实现：探针 convertmodel.net（或任何 OPENAI_BASE_URL）的
// /v1/models endpoint，把当前 relay 配置 + 健康状态 + 模型清单一次性吐出
// 来。relay 出问题时（401 / 超时 / 路由错），用这个命令一秒看清现状，
// 不用在"是 relay 挂了 还是我代码挂了"上反复猜。
//
// 不发起付费请求（不调 /chat/completions），只 GET /v1/models。

import type { LocalCommandCall } from '../../types/command.js'

type ModelsResp = {
  data?: Array<{ id?: string; owned_by?: string }>
}

type Probe = {
  ok: boolean
  status?: number
  ms: number
  detail: string
  count?: number
  sample?: string[]
}

async function probeModels(baseUrl: string, key: string): Promise<Probe> {
  const start = Date.now()
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/models`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    })
    const ms = Date.now() - start
    if (!res.ok) {
      let body = ''
      try {
        body = (await res.text()).slice(0, 200)
      } catch {
        // ignore
      }
      return {
        ok: false,
        status: res.status,
        ms,
        detail: `HTTP ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`,
      }
    }
    const json = (await res.json()) as ModelsResp
    const ids = (json.data ?? [])
      .map(m => m.id)
      .filter((s): s is string => typeof s === 'string')
    return {
      ok: true,
      status: 200,
      ms,
      detail: `${ids.length} models`,
      count: ids.length,
      sample: ids.slice(0, 6),
    }
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

function redactKey(key: string | undefined): string {
  if (!key) return '(unset)'
  if (key.length < 10) return `${key.slice(0, 4)}… (len=${key.length})`
  return `${key.slice(0, 12)}… (len=${key.length})`
}

function flag(name: string): string {
  const v = process.env[name]
  return v && v.trim() ? v : '(unset)'
}

export const call: LocalCommandCall = async () => {
  const openaiBase = flag('OPENAI_BASE_URL')
  const openaiKey = process.env.OPENAI_API_KEY
  const anthBase = flag('ANTHROPIC_BASE_URL')
  const anthKey =
    process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY

  const lines: string[] = []
  lines.push('── relay 诊断 ──────────────────────────────────────')
  lines.push(`OpenAI    base:  ${openaiBase}`)
  lines.push(`Anthropic base:  ${anthBase}`)
  lines.push(`OpenAI    key:   ${redactKey(openaiKey)}`)
  lines.push(`Anthropic key:   ${redactKey(anthKey)}`)
  lines.push(
    `feature flags:   ` +
      [
        `FREE_CODE_MULTI_PROVIDER_NORMALIZED=${flag('FREE_CODE_MULTI_PROVIDER_NORMALIZED')}`,
        `CLAUDE_CODE_USE_OPENAI=${flag('CLAUDE_CODE_USE_OPENAI')}`,
      ].join(', '),
  )
  lines.push('')

  if (openaiKey && openaiBase !== '(unset)') {
    lines.push(`▶ probe OpenAI ${openaiBase}/v1/models …`)
    const p = await probeModels(openaiBase, openaiKey)
    if (p.ok) {
      lines.push(`  ✓ ${p.detail}  (${p.ms}ms)`)
      if (p.sample && p.sample.length > 0) {
        const more = p.count && p.count > p.sample.length ? ', …' : ''
        lines.push(`    sample: ${p.sample.join(', ')}${more}`)
      }
    } else {
      lines.push(`  ✗ ${p.detail}  (${p.ms}ms)`)
    }
  } else {
    lines.push('▶ skip OpenAI probe (key 或 base 未设置)')
  }

  return { type: 'text', value: lines.join('\n') }
}
