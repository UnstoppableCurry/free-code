// /diagnose-relay —— relay 健康探针。元数据保持极小，实现 lazy-load。

import type { Command } from '../../commands.js'

const diagnoseRelay = {
  type: 'local',
  name: 'diagnose-relay',
  description: 'relay 健康探针 — 看 base URL / key / /v1/models 一秒诊断',
  isHidden: false,
  supportsNonInteractive: true,
  load: () => import('./diagnose-relay.js'),
} satisfies Command

export default diagnoseRelay
