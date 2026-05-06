// 一次性 smoke harness：直接 import 三个新 slash command 的 lazy load
// 模块、call 一遍 call()，把结果 dump 到 stdout。跳过 Ink REPL、跳过权限
// 对话框 —— 只验"wiring 通了 + 输出形状对"。
//
// 用法：bun run scripts/smoke-commands.ts
// 不需要 relay key（/diagnose-relay 走 skip 分支、/update 打 npm registry）。

import diagnoseRelayCmd from '../src/commands/diagnose-relay/index.js'
import updateCmd from '../src/commands/update/index.js'

async function smoke(name: string, cmd: any): Promise<void> {
  console.log(`\n══════ /${cmd.name ?? name} ══════`)
  console.log(`  description: ${cmd.description}`)
  console.log(`  type: ${cmd.type}`)
  if (cmd.load) {
    try {
      const mod = await cmd.load()
      console.log(`  load() → ok, has call: ${typeof mod.call === 'function'}`)
      const start = Date.now()
      const res = await mod.call('', {} as never)
      const ms = Date.now() - start
      console.log(`  call() → ${ms}ms`)
      console.log(`  result.type: ${res.type}`)
      if (res.type === 'text') {
        console.log('  ─── output ───')
        for (const line of String(res.value).split('\n')) {
          console.log(`  │ ${line}`)
        }
        console.log('  ──────────────')
      }
    } catch (err) {
      console.log(`  ✗ ERROR: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

async function curryFrames(): Promise<void> {
  console.log('\n══════ /curry frames ══════')
  const mod: any = await import('../src/components/CurryLogShot.js')
  const fnExport = mod.CurryLogShot
  console.log(`  exported CurryLogShot: ${typeof fnExport}`)
  console.log('  (动画帧由 buildFrame() 在模块加载时生成；import 没崩说明 8 帧拼装通过)')
}

async function main(): Promise<void> {
  await smoke('diagnose-relay', diagnoseRelayCmd)
  await smoke('update', updateCmd)
  await curryFrames()
  console.log('\nsmoke done.')
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
