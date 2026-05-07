// /curry —— 2016-02-27 GSW@OKC 库里 logo 三分压哨绝杀 ASCII 还原。
//
// 真实事实参考：
//   - 加时赛剩 ~5s，比分 118-118 平
//   - 防守人 Andre Roberson #21（不是 Westbrook）
//   - 库里推进过半场，3 次运球后 38-ft pull-up
//   - 球离手剩 0.6s → swish 破网 → 尖叫 + signature shimmy 抖肩
//   - 终场 GSW 121 - OKC 118
//
// 艺术加工：前段加 between-the-legs + behind-the-back 各一次（"双背后"
// 视觉记忆），主出手严格 pull-up 38ft。
//
// 实现：drawille-canvas（2x4 Braille 像素栅格）+ 自适应终端尺寸：
//   像素尺寸 W = (cols-2)*2, H = (rows-3)*4，留 caption + subline 行。
//   FRAMES 根据 W/H useMemo 重新生成，120 帧 × 35ms ≈ 4.2s。

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text } from '../ink.js'
import { TerminalSizeContext } from '../ink/components/TerminalSizeContext.js'
// @ts-expect-error - drawille-canvas has no bundled types
import Canvas from 'drawille-canvas'

const TOTAL_FRAMES = 120
const FRAME_MS = 35

type Phase =
  | 'walkup'
  | 'between-legs'
  | 'behind-back'
  | 'gather'
  | 'release'
  | 'flight'
  | 'splash'
  | 'shimmy'

type SceneInputs = {
  W: number
  H: number
  t: number
}

type Scene = {
  canvas: string
  caption: string
  subline: string
  color: 'cyan' | 'yellow' | 'green' | 'magenta' | 'white'
}

function strokeCircle(
  ctx: any,
  cx: number,
  cy: number,
  r: number,
  segs = 24,
): void {
  ctx.beginPath()
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

function strokeArc(
  ctx: any,
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  segs = 24,
): void {
  ctx.beginPath()
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

// 球场场景（俯视斜视角）：底线、三分弧、罚球线、篮筐 + 篮板。
// camera = 0 表示标准镜头；正值表示镜头向右滚（跟球）。
function drawCourt(
  ctx: any,
  W: number,
  H: number,
  cameraX: number,
  showLogo: boolean,
): void {
  const groundY = Math.floor(H * 0.86)
  // 底部地板线
  ctx.beginPath()
  ctx.moveTo(0, groundY)
  ctx.lineTo(W, groundY)
  ctx.stroke()
  // 观众席（底部点阵 —— OKC 主场全员战栗）
  for (let x = 0; x < W; x += 3) {
    const noise = ((x * 73856093) ^ 0x9e3779b9) & 7
    const y = groundY + 4 + (noise % 3)
    if (y < H - 1) {
      ctx.beginPath()
      ctx.arc(x, y, 0.6, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  // 三分弧线（标准 NBA 23.75ft 距离 → 弧形）
  const rimX = W - 18 - cameraX
  const rimY = groundY - Math.floor(H * 0.30)
  if (rimX > -10 && rimX < W + 10) {
    strokeArc(ctx, rimX, groundY, Math.floor(H * 0.55), Math.PI, Math.PI * 2)
    // 罚球线（半圆）
    strokeArc(
      ctx,
      rimX - Math.floor(H * 0.18),
      groundY,
      Math.floor(H * 0.18),
      Math.PI,
      Math.PI * 2,
      16,
    )
    // 篮板
    ctx.beginPath()
    ctx.moveTo(rimX + 4, rimY - Math.floor(H * 0.10))
    ctx.lineTo(rimX + 4, rimY + 2)
    ctx.stroke()
    // 篮筐
    ctx.beginPath()
    ctx.moveTo(rimX - 3, rimY)
    ctx.lineTo(rimX + 3, rimY)
    ctx.stroke()
    // 网
    ctx.beginPath()
    ctx.moveTo(rimX - 3, rimY)
    ctx.lineTo(rimX - 1, rimY + 5)
    ctx.moveTo(rimX + 3, rimY)
    ctx.lineTo(rimX + 1, rimY + 5)
    ctx.moveTo(rimX - 1, rimY + 5)
    ctx.lineTo(rimX + 1, rimY + 5)
    ctx.stroke()
    // 篮架立柱
    ctx.beginPath()
    ctx.moveTo(rimX + 4, rimY + 2)
    ctx.lineTo(rimX + 4, groundY)
    ctx.stroke()
  }
  // 中场圆 + GSW logo（半场标志）：双环 + 内部"GSW" 字母轮廓化
  if (showLogo) {
    const logoX = Math.floor(W * 0.42) - cameraX
    const logoY = groundY - 3
    if (logoX > -20 && logoX < W + 20) {
      strokeCircle(ctx, logoX, logoY, 10)
      strokeCircle(ctx, logoX, logoY, 6)
      // 内部三角斜杠标记（Curry 跨过来的方向感）
      ctx.beginPath()
      ctx.moveTo(logoX - 4, logoY + 2)
      ctx.lineTo(logoX + 4, logoY - 2)
      ctx.moveTo(logoX - 4, logoY - 2)
      ctx.lineTo(logoX + 4, logoY + 2)
      ctx.stroke()
    }
  }
}

// （旧 scoreboard 外框已删 —— caption/subline 文本行已承载比分时间，
// 外框只是空盒抢视线，去掉换更干净的画面。）

type ArmsPose =
  | 'dribble-r'
  | 'dribble-l'
  | 'between'
  | 'behind'
  | 'gather'
  | 'release'
  | 'follow'
  | 'cheer-low'
  | 'cheer-high'
  | 'reach'
  | 'reach-fallen'

type LegsPose = 'stance' | 'wide' | 'jump' | 'land' | 'side-step'

function drawPlayer(
  ctx: any,
  cx: number,
  feetY: number,
  arms: ArmsPose,
  legs: LegsPose,
  jumpY: number,
  facing: 1 | -1,
  jersey: '30' | '21' | '',
): void {
  const headR = 3
  const headY = feetY - 18 + jumpY
  const torsoTop = headY + headR
  const torsoBot = torsoTop + 8
  const hipY = torsoBot
  strokeCircle(ctx, cx, headY, headR, 12)
  ctx.beginPath()
  ctx.arc(cx - 1, headY - 0.5, 0.4, 0, Math.PI * 2)
  ctx.arc(cx + 1, headY - 0.5, 0.4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, torsoTop)
  ctx.lineTo(cx, torsoBot)
  ctx.stroke()
  if (jersey !== '') {
    ctx.beginPath()
    ctx.moveTo(cx - 1.5, torsoTop + 2)
    ctx.lineTo(cx + 1.5, torsoTop + 2)
    ctx.lineTo(cx + 1.5, torsoTop + 5)
    ctx.lineTo(cx - 1.5, torsoTop + 5)
    ctx.lineTo(cx - 1.5, torsoTop + 2)
    ctx.stroke()
  }
  const shoulderY = torsoTop + 1
  switch (arms) {
    case 'dribble-r':
      ctx.beginPath()
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx + 4 * facing, shoulderY + 6)
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx - 3 * facing, shoulderY + 4)
      ctx.stroke()
      break
    case 'dribble-l':
      ctx.beginPath()
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx - 4 * facing, shoulderY + 6)
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx + 3 * facing, shoulderY + 4)
      ctx.stroke()
      break
    case 'between':
      ctx.beginPath()
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx - 2, shoulderY + 7)
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx + 2, shoulderY + 7)
      ctx.stroke()
      break
    case 'behind':
      ctx.beginPath()
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx + 5, shoulderY + 2)
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx - 5, shoulderY + 2)
      ctx.stroke()
      break
    case 'gather':
      ctx.beginPath()
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx - 3, shoulderY + 3)
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx + 3, shoulderY + 3)
      ctx.stroke()
      break
    case 'release':
      ctx.beginPath()
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx + 4 * facing, headY - 3)
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx - 2 * facing, headY - 1)
      ctx.stroke()
      break
    case 'follow':
      ctx.beginPath()
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx + 3 * facing, headY - 5)
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx - 2 * facing, headY - 3)
      ctx.stroke()
      break
    case 'cheer-low':
      ctx.beginPath()
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx - 6, shoulderY + 5)
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx + 6, shoulderY + 5)
      ctx.stroke()
      break
    case 'cheer-high':
      ctx.beginPath()
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx - 6, headY - 4)
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx + 6, headY - 4)
      ctx.stroke()
      break
    case 'reach':
      ctx.beginPath()
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx + 7 * facing, headY - 6)
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx + 4 * facing, headY - 2)
      ctx.stroke()
      break
    case 'reach-fallen':
      ctx.beginPath()
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx + 9, shoulderY + 1)
      ctx.moveTo(cx, shoulderY)
      ctx.lineTo(cx - 6, shoulderY + 4)
      ctx.stroke()
      break
  }
  switch (legs) {
    case 'stance':
      ctx.beginPath()
      ctx.moveTo(cx, hipY)
      ctx.lineTo(cx - 3, feetY)
      ctx.moveTo(cx, hipY)
      ctx.lineTo(cx + 3, feetY)
      ctx.stroke()
      break
    case 'wide':
      ctx.beginPath()
      ctx.moveTo(cx, hipY)
      ctx.lineTo(cx - 7, feetY)
      ctx.moveTo(cx, hipY)
      ctx.lineTo(cx + 7, feetY)
      ctx.stroke()
      break
    case 'jump':
      ctx.beginPath()
      ctx.moveTo(cx, hipY)
      ctx.lineTo(cx - 3, hipY + 5)
      ctx.moveTo(cx, hipY)
      ctx.lineTo(cx + 3, hipY + 5)
      ctx.stroke()
      break
    case 'land':
      ctx.beginPath()
      ctx.moveTo(cx, hipY)
      ctx.lineTo(cx - 5, feetY - 1)
      ctx.moveTo(cx, hipY)
      ctx.lineTo(cx + 5, feetY)
      ctx.stroke()
      break
    case 'side-step':
      ctx.beginPath()
      ctx.moveTo(cx, hipY)
      ctx.lineTo(cx - 6 * facing, feetY)
      ctx.moveTo(cx, hipY)
      ctx.lineTo(cx + 2 * facing, feetY)
      ctx.stroke()
      break
  }
}

function drawBall(ctx: any, x: number, y: number, r = 2.6): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.moveTo(x - r, y)
  ctx.lineTo(x + r, y)
  ctx.moveTo(x, y - r)
  ctx.lineTo(x, y + r)
  ctx.stroke()
}

export function generateScene({ W, H, t }: SceneInputs): Scene {
  const C = new (Canvas as any)(W, H)
  const ctx = C.getContext('2d')

  const groundY = Math.floor(H * 0.86)
  const logoCenterX = Math.floor(W * 0.42)
  const rimWorldX = W - 18

  const T = {
    walkup: [0.0, 0.12] as const,
    between: [0.12, 0.22] as const,
    behind: [0.22, 0.32] as const,
    settle: [0.32, 0.42] as const,
    gather: [0.42, 0.50] as const,
    release: [0.50, 0.58] as const,
    flight: [0.58, 0.86] as const,
    splash: [0.86, 0.92] as const,
    shimmy: [0.92, 1.0] as const,
  }

  let phase: Phase = 'walkup'
  let curryX = logoCenterX
  let curryArms: ArmsPose = 'dribble-r'
  let curryLegs: LegsPose = 'stance'
  let curryJumpY = 0
  let robArms: ArmsPose = 'reach'
  let robLegs: LegsPose = 'stance'
  let robX = logoCenterX + 18
  let ballX = curryX + 4
  let ballY = groundY - 4
  let cameraX = 0
  let caption = ''
  let subline = ''
  let color: Scene['color'] = 'cyan'

  if (t < T.walkup[1]) {
    phase = 'walkup'
    const u = (t - T.walkup[0]) / (T.walkup[1] - T.walkup[0])
    curryX = Math.floor(W * 0.18 + u * (logoCenterX - W * 0.18))
    curryArms = 'dribble-r'
    curryLegs = u < 0.5 ? 'stance' : 'wide'
    ballX = curryX + 4
    ballY = groundY - 4 - Math.abs(Math.sin(u * Math.PI * 4)) * 4
    robX = curryX + 14 + (1 - u) * 4
    caption = '0:00.5 OT · GSW 118 - OKC 118'
    subline = '库里推进过半场 · #21 Roberson 退防中…'
    color = 'cyan'
  } else if (t < T.between[1]) {
    phase = 'between-legs'
    const u = (t - T.between[0]) / (T.between[1] - T.between[0])
    curryX = logoCenterX
    curryLegs = 'wide'
    curryArms = u < 0.5 ? 'between' : 'dribble-l'
    ballX = curryX + 3 - u * 6
    ballY = groundY - 6 + Math.sin(u * Math.PI) * 2
    robX = curryX + 12
    robArms = 'reach'
    caption = '0:00.5 OT · 跨下！'
    subline = '胯下换手 ↔ Roberson 重心被骗'
    color = 'magenta'
  } else if (t < T.behind[1]) {
    phase = 'behind-back'
    const u = (t - T.behind[0]) / (T.behind[1] - T.behind[0])
    curryX = logoCenterX + Math.floor(u * 3)
    curryLegs = 'wide'
    curryArms = u < 0.5 ? 'behind' : 'dribble-r'
    ballX = curryX - 3 + u * 7
    ballY = groundY - 9 + Math.sin(u * Math.PI) * 3
    robX = curryX + 11 + u * 1
    robArms = 'reach'
    robLegs = u > 0.6 ? 'side-step' : 'wide'
    caption = '0:00.5 OT · 背后！'
    subline = '背后换手 → 这都不是终点…'
    color = 'magenta'
  } else if (t < T.settle[1]) {
    phase = 'walkup'
    const u = (t - T.settle[0]) / (T.settle[1] - T.settle[0])
    curryX = logoCenterX + 3
    curryLegs = 'wide'
    curryArms = 'dribble-r'
    ballX = curryX + 4
    ballY = groundY - 5 - Math.abs(Math.sin(u * Math.PI * 2)) * 5
    robX = curryX + 11
    robArms = 'reach'
    caption = '38ft 处 · 第 3 次运球'
    subline = '"我刚过半场就知道我要投了"'
    color = 'cyan'
  } else if (t < T.gather[1]) {
    phase = 'gather'
    const u = (t - T.gather[0]) / (T.gather[1] - T.gather[0])
    curryX = logoCenterX + 3
    curryLegs = u < 0.5 ? 'wide' : 'stance'
    curryArms = 'gather'
    curryJumpY = -u * 2
    ballX = curryX
    ballY = groundY - 14 - u * 6
    robX = curryX + 10
    robArms = 'reach'
    robLegs = 'wide'
    caption = '收球 · 准备出手'
    subline = '0:00.6 ←'
    color = 'yellow'
  } else if (t < T.release[1]) {
    phase = 'release'
    const u = (t - T.release[0]) / (T.release[1] - T.release[0])
    curryX = logoCenterX + 3
    curryLegs = 'jump'
    curryArms = u < 0.5 ? 'release' : 'follow'
    curryJumpY = -2 - u * 4
    const startBX = curryX + 2
    const startBY = groundY - 22 + curryJumpY
    ballX = startBX + u * 6
    ballY = startBY - u * 4
    robX = curryX + 9
    robArms = 'reach'
    robLegs = 'jump'
    caption = u < 0.5 ? '出手！' : '38 英尺！'
    subline = 'Roberson 跳起也够不到…'
    color = 'yellow'
  } else if (t < T.flight[1]) {
    phase = 'flight'
    const u = (t - T.flight[0]) / (T.flight[1] - T.flight[0])
    const startX = logoCenterX + 8
    const startY = groundY - 28
    const endX = rimWorldX
    const endY = groundY - Math.floor(H * 0.30)
    const apexBoost = Math.floor(H * 0.18)
    const wx = startX + u * (endX - startX)
    const wy = (1 - u) * startY + u * endY - apexBoost * 4 * u * (1 - u)
    const ease = Math.min(1, u / 0.25)
    cameraX = ease * (wx - W / 2)
    cameraX = Math.max(0, Math.min(cameraX, endX - W * 0.7))
    ballX = wx - cameraX
    ballY = wy
    curryX = logoCenterX + 3 - cameraX
    curryArms = 'follow'
    curryLegs = 'land'
    curryJumpY = -1
    robX = logoCenterX + 12 - cameraX
    robArms = 'reach'
    robLegs = 'land'
    caption = u < 0.4 ? '弧线飞翔…' : u < 0.8 ? '~~~~ 好高的弧 ~~~~' : '准 · 心 · 入 · 网'
    subline = '加时绝杀就在眼前'
    color = 'green'
  } else if (t < T.splash[1]) {
    phase = 'splash'
    const u = (t - T.splash[0]) / (T.splash[1] - T.splash[0])
    cameraX = Math.max(0, rimWorldX - W * 0.7)
    const rimY = groundY - Math.floor(H * 0.30)
    ballX = rimWorldX - cameraX
    ballY = rimY + u * 8
    caption = '★  BANG! BANG!  ★'
    subline = '0:00.0 · GSW 121 - OKC 118'
    color = 'green'
  } else {
    phase = 'shimmy'
    const u = (t - T.shimmy[0]) / (T.shimmy[1] - T.shimmy[0])
    cameraX = 0
    curryX = logoCenterX + 3 + Math.sin(u * Math.PI * 6) * 2
    curryLegs = 'stance'
    curryArms = u % 0.4 < 0.2 ? 'cheer-high' : 'cheer-low'
    curryJumpY = 0
    robX = -50
    ballX = -50
    ballY = -50
    caption = '🏀 SHIMMY · 抖肩 · 走人 🏀'
    subline = 'Curry 的代表作 · 改变历史的一投'
    color = 'yellow'
  }

  const showLogo = phase !== 'flight' && phase !== 'splash'
  drawCourt(ctx, W, H, cameraX, showLogo)

  if (robX > -10 && robX < W + 10 && phase !== 'shimmy') {
    drawPlayer(ctx, robX, groundY, robArms, robLegs, 0, -1, '21')
  }
  if (curryX > -10 && curryX < W + 10) {
    drawPlayer(
      ctx,
      curryX,
      groundY,
      curryArms,
      curryLegs,
      curryJumpY,
      1,
      '30',
    )
  }
  if (ballX > -5 && ballX < W + 5 && ballY > -5) {
    drawBall(ctx, ballX, ballY)
  }

  return { canvas: C.toString(), caption, subline, color }
}

export type CurryLogShotProps = {
  onDone?: () => void
  static?: boolean
}

export function CurryLogShot(props: CurryLogShotProps): React.ReactNode {
  const size = useContext(TerminalSizeContext)
  const cols = size?.columns ?? process.stdout.columns ?? 100
  const rows = size?.rows ?? process.stdout.rows ?? 30
  const W = Math.max(120, Math.min(420, (cols - 2) * 2))
  const H = Math.max(60, Math.min(160, (rows - 4) * 4))

  const FRAMES = useMemo<Scene[]>(
    () =>
      Array.from({ length: TOTAL_FRAMES }, (_, i) =>
        generateScene({ W, H, t: i / (TOTAL_FRAMES - 1) }),
      ),
    [W, H],
  )

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
  }, [FRAMES.length])

  const frame = FRAMES[props.static ? FRAMES.length - 1 : idx]!
  const lines = frame.canvas.split('\n')

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} color={frame.color}>
          {line}
        </Text>
      ))}
      <Text color="yellow" bold>
        {`            ${frame.caption}`}
      </Text>
      <Text color="white" dimColor>
        {`            ${frame.subline}`}
      </Text>
    </Box>
  )
}
