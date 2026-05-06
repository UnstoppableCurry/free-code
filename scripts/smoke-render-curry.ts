// 把 /curry 的 8 帧动画渲染到 stdout 看实际效果。Ink 在非 TTY 下还是能输出
// 文本，每次 React 重新 render 都会打一次完整画面。
//
// 用法：bun run scripts/smoke-render-curry.ts
// 跑完后强制 exit，防止 Ink 卡住。

import React from 'react'
import { render } from 'ink'
import { CurryLogShot } from '../src/components/CurryLogShot.js'

const { unmount, waitUntilExit } = render(
  React.createElement(CurryLogShot, {
    onDone: () => {
      setTimeout(() => {
        unmount()
        process.exit(0)
      }, 200)
    },
  }),
  { stdout: process.stdout, stdin: process.stdin },
)

setTimeout(() => {
  console.log('\n[harness] timed out after 5s, forcing exit')
  unmount()
  process.exit(0)
}, 5000)

waitUntilExit().then(() => process.exit(0))
