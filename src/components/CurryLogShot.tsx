// /curry —— 100 帧 4 秒火柴人三分动画。
//
// 实现：drawille-canvas 提供 Canvas2D-like API → 我描述场景（火柴人姿势 /
// 球轨迹 / 镜头偏移），库光栅化为 Braille 字符。模块加载时一次性生成
// 100 帧字符串放进 FRAMES，setInterval 40ms 切帧。
//
// 故事板：
//   t∈[0, 0.20)  Crossover —— 运球、晃过、防守者倒地
//   t∈[0.20, 0.40)  Pull-up —— 收球、起跳、出手
//   t∈[0.40, 0.95)  飞行 + 镜头跟球 —— 抛物线轨迹，camera lock 球居中
//   t∈[0.95, 1.00]  穿网 + BANG!

import React, { useEffect, useRef, useState } from 'react'
import { Box, Text } from '../ink.js'
// @ts-expect-error - drawille-canvas has no bundled types
import Canvas from 'drawille-canvas'

const VIEW_W = 180
const VIEW_H = 80
const GROUND_Y = 72

type ArmsPose = 'down' | 'cross' | 'up' | 'flail'
type LegsPose = 'stance' | 'wide' | 'jump' | 'fallen'

function drawFigure(
  ctx: any,
  x: number,
  feetY: number,
  arms: ArmsPose,
  legs: LegsPose,
  jumpY: number = 0,
): void {
  const headY = feetY - 30 + jumpY
  ctx.beginPath()
  ctx.arc(x, headY, 4, 0, Math.PI * 2)
  ctx.moveTo(x, headY + 4)
  ctx.lineTo(x, headY + 18)
  if (arms === 'up') {
    ctx.moveTo(x, headY + 6)
    ctx.lineTo(x - 7, headY - 8)
    ctx.moveTo(x, headY + 6)
    ctx.lineTo(x + 7, headY - 8)
  } else if (arms === 'cross') {
    ctx.moveTo(x, headY + 8)
    ctx.lineTo(x - 13, headY + 6)
    ctx.moveTo(x, headY + 8)
    ctx.lineTo(x + 13, headY + 6)
  } else if (arms === 'flail') {
    ctx.moveTo(x, headY + 6)
    ctx.lineTo(x - 15, headY - 2)
    ctx.moveTo(x, headY + 6)
    ctx.lineTo(x + 15, headY - 6)
  } else {
    ctx.moveTo(x, headY + 8)
    ctx.lineTo(x - 6, headY + 17)
    ctx.moveTo(x, headY + 8)
    ctx.lineTo(x + 6, headY + 17)
  }
  if (legs === 'jump') {
    ctx.moveTo(x, headY + 18)
    ctx.lineTo(x - 4, headY + 24)
    ctx.moveTo(x, headY + 18)
    ctx.lineTo(x + 4, headY + 24)
  } else if (legs === 'wide') {
    ctx.moveTo(x, headY + 18)
    ctx.lineTo(x - 9, feetY)
    ctx.moveTo(x, headY + 18)
    ctx.lineTo(x + 9, feetY)
  } else if (legs === 'fallen') {
    ctx.moveTo(x, headY + 18)
    ctx.lineTo(x + 14, headY + 16)
    ctx.moveTo(x, headY + 18)
    ctx.lineTo(x + 10, headY + 22)
  } else {
    ctx.moveTo(x, headY + 18)
    ctx.lineTo(x - 4, feetY)
    ctx.moveTo(x, headY + 18)
    ctx.lineTo(x + 4, feetY)
  }
  ctx.stroke()
}

function drawBall(ctx: any, x: number, y: number, r: number = 3): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
}

function drawRim(ctx: any, x: number, rimY: number): void {
  ctx.beginPath()
  ctx.moveTo(x - 16, rimY - 14)
  ctx.lineTo(x + 16, rimY - 14)
  ctx.lineTo(x + 16, rimY + 4)
  ctx.lineTo(x - 16, rimY + 4)
  ctx.lineTo(x - 16, rimY - 14)
  ctx.moveTo(x - 11, rimY)
  ctx.lineTo(x + 11, rimY)
  ctx.moveTo(x - 9, rimY)
  ctx.lineTo(x - 5, rimY + 12)
  ctx.moveTo(x + 9, rimY)
  ctx.lineTo(x + 5, rimY + 12)
  ctx.moveTo(x - 5, rimY + 12)
  ctx.lineTo(x + 5, rimY + 12)
  ctx.moveTo(x, rimY + 4)
  ctx.lineTo(x, GROUND_Y)
  ctx.stroke()
}

function drawGround(ctx: any, cameraX: number): void {
  ctx.beginPath()
  ctx.moveTo(0, GROUND_Y)
  ctx.lineTo(VIEW_W, GROUND_Y)
  ctx.stroke()
  const halfX = 80 - cameraX
  if (halfX > 0 && halfX < VIEW_W) {
    ctx.beginPath()
    ctx.moveTo(halfX, GROUND_Y - 4)
    ctx.lineTo(halfX, GROUND_Y + 4)
    ctx.stroke()
  }
}

function generateFrame(t: number): { canvas: string; caption: string } {
  const C = new (Canvas as any)(VIEW_W, VIEW_H)
  const ctx = C.getContext('2d')

  let caption = ''

  if (t < 0.2) {
    const phase = t / 0.2
    const curryWX = 50
    const defWX = 100
    let curryArms: ArmsPose = 'down'
    let curryLegs: LegsPose = 'stance'
    let curryX = curryWX
    let ballWX = curryWX + 9
    let ballY = GROUND_Y - 14
    let defArms: ArmsPose = 'cross'
    let defLegs: LegsPose = 'stance'

    if (phase < 0.4) {
      const sub = phase / 0.4
      ballY = GROUND_Y - 14 - Math.abs(Math.sin(sub * 14)) * 7
      caption = 'wtcc · 半场 logo 三分'
    } else if (phase < 0.72) {
      const sub = (phase - 0.4) / 0.32
      ballWX = curryWX + 9 - sub * 18
      ballY = GROUND_Y - 6 - Math.sin(sub * Math.PI) * 9
      curryArms = 'cross'
      curryLegs = 'wide'
      caption = 'wtcc · 晃 →'
    } else {
      const sub = (phase - 0.72) / 0.28
      curryX = curryWX + sub * 18
      ballWX = curryX - 9 + sub * 13
      ballY = GROUND_Y - 14 - Math.abs(Math.sin(sub * 10)) * 6
      defArms = 'flail'
      defLegs = 'fallen'
      caption = 'wtcc · 突破!'
    }

    drawGround(ctx, 0)
    drawFigure(ctx, curryX, GROUND_Y, curryArms, curryLegs)
    drawFigure(ctx, defWX, GROUND_Y, defArms, defLegs)
    drawBall(ctx, ballWX, ballY)
  } else if (t < 0.4) {
    const phase = (t - 0.2) / 0.2
    const curryX = 70
    let curryArms: ArmsPose = 'down'
    let curryLegs: LegsPose = 'stance'
    let jumpY = 0
    let ballX = curryX + 7
    let ballY = GROUND_Y - 14

    if (phase < 0.4) {
      const sub = phase / 0.4
      ballY = GROUND_Y - 14 - sub * 16
      curryArms = sub > 0.55 ? 'up' : 'down'
      curryLegs = sub > 0.75 ? 'jump' : 'stance'
      jumpY = -sub * 5
      caption = 'wtcc · 拉杆'
    } else if (phase < 0.72) {
      const sub = (phase - 0.4) / 0.32
      ballY = GROUND_Y - 30 - sub * 8
      ballX = curryX + 5 - sub * 4
      curryArms = 'up'
      curryLegs = 'jump'
      jumpY = -8 - sub * 5
      caption = 'wtcc · 起跳'
    } else {
      const sub = (phase - 0.72) / 0.28
      ballY = GROUND_Y - 38 - sub * 4
      ballX = curryX + 1 + sub * 14
      curryArms = 'up'
      curryLegs = 'jump'
      jumpY = -13
      caption = 'wtcc · 出手!'
    }

    drawGround(ctx, 0)
    drawFigure(ctx, curryX, GROUND_Y, curryArms, curryLegs, jumpY)
    drawBall(ctx, ballX, ballY)
  } else if (t < 0.95) {
    const phase = (t - 0.4) / 0.55
    const ballWX_start = 90
    const ballWX_end = 400
    const ballWX = ballWX_start + phase * (ballWX_end - ballWX_start)
    const releaseY = GROUND_Y - 38
    const rimY = GROUND_Y - 30
    const apexBoost = 32
    const ballY =
      (1 - phase) * releaseY + phase * rimY - apexBoost * 4 * phase * (1 - phase)
    const ease = Math.min(1, phase / 0.18)
    const cameraX = ease * (ballWX - VIEW_W / 2)

    drawGround(ctx, cameraX)
    const playerScreenX = 70 - cameraX
    if (playerScreenX > -20 && playerScreenX < VIEW_W + 20) {
      drawFigure(ctx, playerScreenX, GROUND_Y, 'up', 'jump', -13)
    }
    const rimScreenX = 400 - cameraX
    if (rimScreenX > -30 && rimScreenX < VIEW_W + 30) {
      drawRim(ctx, rimScreenX, rimY)
    }
    drawBall(ctx, ballWX - cameraX, ballY)

    caption =
      phase < 0.3 ? 'wtcc · 出手 →' : phase < 0.7 ? '~ 弧线 ~' : '~ 落下 ~'
  } else {
    const phase = (t - 0.95) / 0.05
    const rimScreenX = VIEW_W / 2
    const rimY = GROUND_Y - 30
    drawGround(ctx, 400 - VIEW_W / 2)
    drawRim(ctx, rimScreenX, rimY)
    const ballY = rimY + phase * 18
    drawBall(ctx, rimScreenX, ballY, 3)
    caption = phase > 0.5 ? '★ BANG! 3PT! ★' : 'wtcc · 进!'
  }

  return { canvas: C.toString(), caption }
}

const TOTAL_FRAMES = 100

const FRAMES: ReadonlyArray<{ canvas: string; caption: string }> = Array.from(
  { length: TOTAL_FRAMES },
  (_, i) => generateFrame(i / (TOTAL_FRAMES - 1)),
)

const FRAME_MS = 40

export type CurryLogShotProps = {
  /** 抵达最后一帧后回调（驻留期由调用方决定）。 */
  onDone?: () => void
  /** 跳过动画，直接停在最终帧（非 TTY / 测试场景）。 */
  static?: boolean
}

export function CurryLogShot(props: CurryLogShotProps): React.ReactNode {
  const [idx, setIdx] = useState(0)
  const onDoneRef = useRef(props.onDone)
  const staticRef = useRef(props.static)
  useEffect(() => {
    onDoneRef.current = props.onDone
    staticRef.current = props.static
  })

  useEffect(() => {
    if (staticRef.current) {
      onDoneRef.current?.()
      return
    }
    let doneFired = false
    const interval = setInterval(() => {
      setIdx(i => {
        if (i >= FRAMES.length - 1) {
          if (!doneFired) {
            doneFired = true
            onDoneRef.current?.()
          }
          clearInterval(interval)
          return i
        }
        return i + 1
      })
    }, FRAME_MS)
    return () => clearInterval(interval)
  }, [])

  const frame = FRAMES[props.static ? FRAMES.length - 1 : idx]!
  const lines = frame.canvas.split('\n')

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} color="cyan">
          {line}
        </Text>
      ))}
      <Text color="yellow">{`            ${frame.caption}`}</Text>
    </Box>
  )
}
