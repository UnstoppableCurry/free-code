// /update —— wtcc 自更新检查（npm registry 探针）。元数据极小，lazy-load。
//
// 4 facts:
// 1) Caller — `src/commands.ts` 注册（import + COMMANDS() 数组）。
// 2) Dedup — 不与 `commands/upgrade/index.ts` 冲突：upgrade 是上游 claude-code
//    自安装流（GCS bucket + autoUpdater.ts），update 走 npm registry。
// 3) Data IO — 本元数据文件不读写数据；实现文件 update.ts 通过
//    `utils/updateCheck.ts` 读 `~/.cache/wtcc/version-check.json`（ISO 8601）。
// 4) Verbatim instruction — "全都要"。

import type { Command } from '../../commands.js'

const update = {
  type: 'local',
  name: 'update',
  description: 'wtcc 自更新检查 — 看当前版本 / npm latest / 升级命令',
  isHidden: false,
  supportsNonInteractive: true,
  load: () => import('./update.js'),
} satisfies Command

export default update
