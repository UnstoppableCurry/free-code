// /update 实现：调 utils/updateCheck.ts，把当前版本 / npm latest / 升级命令
// 一次性吐给用户。
//
// 4 facts:
// 1) Caller — 仅 `commands/update/index.ts` 通过 `import('./update.js')` 加载。
// 2) Dedup — 与 `commands/upgrade/...` 不重叠（upgrade 是 claude-code GCS 流）。
// 3) Data IO — 不直接做文件 IO；通过 `utils/updateCheck.ts` 读
//    `~/.cache/wtcc/version-check.json`（ISO 8601 `checkedAt`）。返回
//    `{type:'text', value:string}`。
// 4) Verbatim instruction — "全都要"。
//
// 静默策略：未发布到 npm 时（404 / 超时 / 网络错），不抛错、不打扰；
// 直接显示 "not on npm yet"。

import type { LocalCommandCall } from '../../types/command.js'
import { checkForUpdate } from '../../utils/updateCheck.js'

const UPGRADE_CMD = 'npm i -g wtcc'

export const call: LocalCommandCall = async () => {
  const r = await checkForUpdate()
  const lines: string[] = []
  lines.push('── wtcc 更新检查 ──────────────────────────────────')
  lines.push(`current: ${r.current}`)

  if (r.latest === null) {
    // 包还没发到 npm，或者网络不通 —— 都按静默处理
    lines.push(`latest:  not on npm yet (source: ${r.source})`)
    lines.push('')
    lines.push(`若已发布，可执行：${UPGRADE_CMD}`)
  } else if (r.hasUpdate) {
    lines.push(`latest:  ${r.latest}  ← 有新版本 (source: ${r.source})`)
    lines.push('')
    lines.push(`升级命令：${UPGRADE_CMD}`)
  } else {
    lines.push(`latest:  ${r.latest}  ✓ 已是最新 (source: ${r.source})`)
    lines.push('')
    lines.push(`如需重装：${UPGRADE_CMD}`)
  }

  return { type: 'text', value: lines.join('\n') }
}
