#!/usr/bin/env bun
// Standalone runner for the Curry log-shot animation. Useful for
// previewing the splash without booting the full CLI.
//
// 用法：bun run src/entrypoints/curry-shot.tsx

import React from 'react'
import { render, Box, Text } from 'ink'
import { CurryLogShot } from '../components/CurryLogShot.js'

function App(): React.ReactNode {
  const [done, setDone] = React.useState(false)
  return (
    <Box flexDirection="column">
      <CurryLogShot onDone={() => setDone(true)} />
      {done && (
        <Box marginTop={1}>
          <Text dimColor>(动画完成，按 Ctrl+C 退出)</Text>
        </Box>
      )}
    </Box>
  )
}

const { waitUntilExit } = render(<App />)
await waitUntilExit()
