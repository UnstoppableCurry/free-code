// updateCheck.ts —— wtcc 自更新探针。
//
// 4 facts (caller / dedup / data IO / verbatim instruction):
// 1) Caller — `src/commands/update/update.ts` 是唯一调用方；其它模块也可
//    通过 `import { checkForUpdate } from '../utils/updateCheck.js'` 调用。
// 2) Dedup — 24 小时内只打一次 npm registry：磁盘缓存
//    `~/.cache/wtcc/version-check.json` 的 `checkedAt` 字段做 TTL 判断；
//    缓存命中直接返回 `source: 'cache'`，不再 fetch。
// 3) Data IO — registry GET `https://registry.npmjs.org/<name>/latest`
//    response 字段：`{ version: string }`；缓存文件字段：
//    `{ checkedAt: ISO_8601, current: string, latest: string|null, name: string }`；
//    日期格式 ISO 8601（`new Date().toISOString()`）。
// 4) Verbatim instruction — "全都要"。
//
// 没有引入新依赖：用内置 fetch / fs/promises / os / path。
// wtcc 还没发布到 npm，所以 404 / 网络失败 / 超时一律降级为
// `{ latest: null, hasUpdate: false, source: 'unavailable' }` —— 不打扰用户。

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type UpdateCheckResult = {
  current: string
  latest: string | null
  hasUpdate: boolean
  source: 'cache' | 'registry' | 'unavailable'
}

type CacheEntry = {
  checkedAt: string
  current: string
  latest: string | null
  name: string
}

type PackageJson = {
  name?: string
  version?: string
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const REGISTRY_TIMEOUT_MS = 5000

const CACHE_DIR = join(homedir(), '.cache', 'wtcc')
const CACHE_FILE = join(CACHE_DIR, 'version-check.json')

/**
 * Compares two semver-ish strings part-by-part. Pre-release suffix on the
 * MAJOR.MINOR.PATCH segment is stripped (e.g. `1.2.3-beta.1` → `1.2.3`).
 * Returns -1 if a<b, 0 if equal, 1 if a>b.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parse = (v: string): number[] => {
    const head = v.replace(/^v/, '').split(/[-+]/)[0] ?? ''
    const parts = head.split('.').map(p => {
      const n = parseInt(p, 10)
      return Number.isFinite(n) ? n : 0
    })
    while (parts.length < 3) parts.push(0)
    return parts
  }
  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x < y) return -1
    if (x > y) return 1
  }
  return 0
}

/**
 * Walks up from this module's location until it finds a package.json with a
 * `name` field. Reads `name` + `version`. Returns `null` if not found
 * (defensive — should always succeed in a normal install).
 */
async function readOwnPackageJson(): Promise<PackageJson | null> {
  try {
    let dir = dirname(fileURLToPath(import.meta.url))
    // hard cap to 10 levels up to avoid runaway loops on weird filesystems
    for (let i = 0; i < 10; i++) {
      const candidate = join(dir, 'package.json')
      try {
        const raw = await readFile(candidate, 'utf8')
        const parsed = JSON.parse(raw) as PackageJson
        if (parsed && typeof parsed.name === 'string') {
          return parsed
        }
      } catch {
        // not here, keep walking
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch {
    // fallthrough
  }
  return null
}

async function readCache(): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(CACHE_FILE, 'utf8')
    const parsed = JSON.parse(raw) as CacheEntry
    if (
      parsed &&
      typeof parsed.checkedAt === 'string' &&
      typeof parsed.current === 'string' &&
      typeof parsed.name === 'string' &&
      (parsed.latest === null || typeof parsed.latest === 'string')
    ) {
      return parsed
    }
  } catch {
    // missing / unreadable / corrupt — treat as no cache
  }
  return null
}

async function writeCache(entry: CacheEntry): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(CACHE_FILE, JSON.stringify(entry, null, 2), 'utf8')
  } catch {
    // best-effort; cache write failure must never break the caller
  }
}

function isFresh(entry: CacheEntry, name: string): boolean {
  if (entry.name !== name) return false
  const ts = Date.parse(entry.checkedAt)
  if (!Number.isFinite(ts)) return false
  return Date.now() - ts < CACHE_TTL_MS
}

async function fetchLatestVersion(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name}/latest`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { version?: unknown }
    if (typeof json.version === 'string' && json.version.length > 0) {
      return json.version
    }
    return null
  } catch {
    return null
  }
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const pkg = await readOwnPackageJson()
  const current =
    typeof pkg?.version === 'string' && pkg.version.length > 0
      ? pkg.version
      : '0.0.0'
  const name =
    typeof pkg?.name === 'string' && pkg.name.length > 0 ? pkg.name : 'wtcc'

  const cached = await readCache()
  if (cached && isFresh(cached, name) && cached.current === current) {
    const latest = cached.latest
    return {
      current,
      latest,
      hasUpdate: latest !== null && compareSemver(current, latest) < 0,
      source: 'cache',
    }
  }

  const latest = await fetchLatestVersion(name)
  if (latest === null) {
    // 不写 unavailable 缓存 —— 下次仍然尝试探活
    return { current, latest: null, hasUpdate: false, source: 'unavailable' }
  }

  await writeCache({
    checkedAt: new Date().toISOString(),
    current,
    latest,
    name,
  })

  return {
    current,
    latest,
    hasUpdate: compareSemver(current, latest) < 0,
    source: 'registry',
  }
}
