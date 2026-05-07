import type { Command } from '../../commands.js'

const curry: Command = {
  name: 'curry',
  description: '召唤库里 logo 三分动画 — BANG!',
  isEnabled: () => true,
  isHidden: false,
  type: 'local-jsx',
  load: () => import('./curry.js'),
  userFacingName: () => 'curry',
}

export default curry
