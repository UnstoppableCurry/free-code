// /curry — show the Curry log-shot animation. Pure egg, no API call.

import React from 'react'
import { Box } from '../../ink.js'
import { CurryLogShot } from '../../components/CurryLogShot.js'

type LocalCommand = {
  type: 'local-jsx'
  name: string
  description: string
  isEnabled: () => boolean
  isHidden: boolean
  userFacingName: () => string
  call: (
    onDone: (result?: string) => void,
    context: unknown,
  ) => Promise<React.ReactNode>
}

const command: LocalCommand = {
  type: 'local-jsx',
  name: 'curry',
  description: '召唤库里 logo 三分动画 — BANG!',
  isEnabled: () => true,
  isHidden: false,
  userFacingName() {
    return 'curry'
  },
  async call(onDone) {
    return (
      <Box flexDirection="column">
        <CurryLogShot onDone={() => setTimeout(() => onDone('BANG!'), 1500)} />
      </Box>
    )
  },
}

export default command
