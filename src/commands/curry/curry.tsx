import React from 'react'
import { Box } from '../../ink.js'
import { CurryLogShot } from '../../components/CurryLogShot.js'
import type { LocalJSXCommandCall } from '../../types/command.js'

export const call: LocalJSXCommandCall = (onDone) =>
  Promise.resolve(
    <Box flexDirection="column">
      <CurryLogShot onDone={() => setTimeout(() => onDone('BANG!'), 1500)} />
    </Box>,
  )
