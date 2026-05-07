// /curry —— 2016-02-27 GSW@OKC 库里 logo 三分绝杀电影分镜还原。
//
// 6 个 shot 运镜（参照真实视频镜头切换节奏）：
//   1. WIDE 全景（推过半场）        : 0% - 12%
//   2. CLOSE UP 特写双背后过 Roberson : 12% - 30%
//   3. TRACKING 跟拍 logo 出手        : 30% - 50%
//   4. BALL POV 跟球长镜头            : 50% - 78%
//   5. RIM SPLASH 入网特写 唰！      : 78% - 88%
//   6. CURRY BACK 后视角抖肩庆祝    : 88% - 100%
//
// 每个 shot 是独立 draw function，自定背景/前景层（极简背景 +
// 前景观众剪影）。共享元素通过 cameraX/cameraY/zoom 投影到屏幕。

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text } from '../ink.js'
import { TerminalSizeContext } from '../ink/components/TerminalSizeContext.js'
// @ts-expect-error - drawille-canvas has no bundled types
import Canvas from 'drawille-canvas'

const TOTAL_FRAMES = 120
const FRAME_MS = 35

type SceneInputs = { W: number; H: number; t: number }

type Scene = {
  canvas: string
  caption: string
  subline: string
  color: 'cyan' | 'yellow' | 'green' | 'magenta' | 'white' | 'red'
}

function strokeCircle(
  ctx: any,
  cx: number,
  cy: number,
  r: number,
  segs = 24,
): void {
  if (r < 0.5) return
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

function strokeLine(ctx: any, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function fillBall(ctx: any, x: number, y: number, r: number): void {
  if (r < 1) {
    ctx.beginPath()
    ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2)
    ctx.stroke()
    return
  }
  for (let rr = r; rr > 0; rr -= 0.6) {
    strokeCircle(ctx, x, y, rr, 16)
  }
  strokeLine(ctx, x - r, y, x + r, y)
  strokeLine(ctx, x, y - r, x, y + r)
  ctx.beginPath()
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI - Math.PI / 2
    const px = x + Math.cos(a) * r * 0.7
    const py = y + Math.sin(a) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
}

// 前景观众剪影
function drawCrowdSilhouette(ctx: any, W: number, H: number, density: number) {
  const baseY = H - 4
  for (let x = 0; x < W; x += Math.max(2, Math.floor(8 / density))) {
    const noise = ((x * 73856093) ^ 0x9e3779b9) >>> 0
    const headR = 1.2 + (noise % 5) * 0.3
    const yJitter = (noise >> 3) % 3
    strokeCircle(ctx, x, baseY - yJitter, headR, 8)
  }
  ctx.beginPath()
  ctx.moveTo(0, H - 1)
  ctx.lineTo(W, H - 1)
  ctx.stroke()
}

function drawFloor(ctx: any, W: number, groundY: number, dotty = false) {
  ctx.beginPath()
  ctx.moveTo(0, groundY)
  ctx.lineTo(W, groundY)
  ctx.stroke()
  if (dotty) {
    for (let x = 6; x < W; x += 14) {
      strokeLine(ctx, x, groundY + 2, x + 2, groundY + 2)
    }
  }
}

function drawDistantHoop(
  ctx: any,
  rimX: number,
  rimY: number,
  scale: number,
) {
  if (rimX < -10) return
  strokeLine(ctx, rimX, rimY, rimX, rimY + 14 * scale)
  strokeLine(ctx, rimX - 1, rimY - 6 * scale, rimX - 1, rimY + 1)
  strokeLine(ctx, rimX - 4 * scale, rimY, rimX - 1, rimY)
  strokeLine(ctx, rimX - 4 * scale, rimY, rimX - 2 * scale, rimY + 4 * scale)
  strokeLine(ctx, rimX - 1, rimY, rimX - 2 * scale, rimY + 4 * scale)
}

function drawRimCloseup(
  ctx: any,
  cx: number,
  cy: number,
  R: number,
  netWave: number,
) {
  // 篮板
  strokeLine(ctx, cx + R + 2, cy - R * 0.8, cx + R + 2, cy + R * 0.4)
  strokeLine(ctx, cx - R * 1.6, cy - R * 0.8, cx + R + 2, cy - R * 0.8)
  strokeLine(ctx, cx - R * 1.6, cy + R * 0.4, cx + R + 2, cy + R * 0.4)
  strokeLine(ctx, cx - R * 1.6, cy - R * 0.8, cx - R * 1.6, cy + R * 0.4)
  // 篮筐
  strokeCircle(ctx, cx, cy, R, 28)
  strokeCircle(ctx, cx, cy, R - 0.6, 28)
  // 网（晃动）
  const netSegs = 10
  for (let i = 0; i <= netSegs; i++) {
    const a = Math.PI + (i / netSegs) * Math.PI
    const x0 = cx + Math.cos(a) * R
    const y0 = cy + Math.sin(a) * R * 0.5 + R * 0.3
    const sway = Math.sin(netWave + i * 0.4) * 1.5
    const x1 = cx + Math.cos(a) * R * 0.7 + sway
    const y1 = y0 + R * 1.6
    strokeLine(ctx, x0, y0, x1, y1)
  }
  for (let i = 0; i < netSegs; i++) {
    const a0 = Math.PI + (i / netSegs) * Math.PI
    const a1 = Math.PI + ((i + 1) / netSegs) * Math.PI
    const sway0 = Math.sin(netWave + i * 0.4) * 1.5
    const sway1 = Math.sin(netWave + (i + 1) * 0.4) * 1.5
    const x0 = cx + Math.cos(a0) * R * 0.7 + sway0
    const x1 = cx + Math.cos(a1) * R * 0.7 + sway1
    const y = cy + R * 1.9
    strokeLine(ctx, x0, y, x1, y)
  }
}

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
  | 'reach-high'

type LegsPose = 'stance' | 'wide' | 'jump' | 'land'

function drawPlayerScaled(
  ctx: any,
  cx: number,
  feetY: number,
  arms: ArmsPose,
  legs: LegsPose,
  jumpY: number,
  facing: 1 | -1,
  jersey: '30' | '21' | '',
  scale: number,
): void {
  const headR = 3 * scale
  const headY = feetY - 18 * scale + jumpY * scale
  const torsoTop = headY + headR
  const torsoBot = torsoTop + 8 * scale
  const hipY = torsoBot
  strokeCircle(ctx, cx, headY, headR, 14)
  if (scale > 0.8) {
    ctx.beginPath()
    ctx.arc(cx - 1 * scale, headY - 0.5, 0.4 * scale, 0, Math.PI * 2)
    ctx.arc(cx + 1 * scale, headY - 0.5, 0.4 * scale, 0, Math.PI * 2)
    ctx.stroke()
  }
  strokeLine(ctx, cx, torsoTop, cx, torsoBot)
  if (jersey !== '' && scale > 0.6) {
    ctx.beginPath()
    ctx.moveTo(cx - 1.6 * scale, torsoTop + 2 * scale)
    ctx.lineTo(cx + 1.6 * scale, torsoTop + 2 * scale)
    ctx.lineTo(cx + 1.6 * scale, torsoTop + 5 * scale)
    ctx.lineTo(cx - 1.6 * scale, torsoTop + 5 * scale)
    ctx.lineTo(cx - 1.6 * scale, torsoTop + 2 * scale)
    ctx.stroke()
    if (jersey === '30') {
      strokeLine(
        ctx,
        cx - 0.7 * scale,
        torsoTop + 2.5 * scale,
        cx - 0.7 * scale,
        torsoTop + 4.5 * scale,
      )
      strokeCircle(ctx, cx + 0.5 * scale, torsoTop + 3.5 * scale, 0.8 * scale, 8)
    } else if (jersey === '21') {
      strokeLine(
        ctx,
        cx - 0.7 * scale,
        torsoTop + 2.5 * scale,
        cx - 0.7 * scale,
        torsoTop + 4.5 * scale,
      )
      strokeLine(
        ctx,
        cx + 0.7 * scale,
        torsoTop + 2.5 * scale,
        cx + 0.7 * scale,
        torsoTop + 4.5 * scale,
      )
    }
  }
  const sh = torsoTop + 1 * scale
  switch (arms) {
    case 'dribble-r':
      strokeLine(ctx, cx, sh, cx + 4 * facing * scale, sh + 6 * scale)
      strokeLine(ctx, cx, sh, cx - 3 * facing * scale, sh + 4 * scale)
      break
    case 'dribble-l':
      strokeLine(ctx, cx, sh, cx - 4 * facing * scale, sh + 6 * scale)
      strokeLine(ctx, cx, sh, cx + 3 * facing * scale, sh + 4 * scale)
      break
    case 'between':
      strokeLine(ctx, cx, sh, cx - 2 * scale, sh + 7 * scale)
      strokeLine(ctx, cx, sh, cx + 2 * scale, sh + 7 * scale)
      break
    case 'behind':
      strokeLine(ctx, cx, sh, cx + 5 * scale, sh + 2 * scale)
      strokeLine(ctx, cx, sh, cx - 5 * scale, sh + 2 * scale)
      break
    case 'gather':
      strokeLine(ctx, cx, sh, cx - 3 * scale, sh + 3 * scale)
      strokeLine(ctx, cx, sh, cx + 3 * scale, sh + 3 * scale)
      break
    case 'release':
      strokeLine(ctx, cx, sh, cx + 4 * facing * scale, headY - 3 * scale)
      strokeLine(ctx, cx, sh, cx - 2 * facing * scale, headY - 1 * scale)
      break
    case 'follow':
      strokeLine(ctx, cx, sh, cx + 3 * facing * scale, headY - 5 * scale)
      strokeLine(ctx, cx, sh, cx - 2 * facing * scale, headY - 3 * scale)
      break
    case 'cheer-low':
      strokeLine(ctx, cx, sh, cx - 6 * scale, sh + 5 * scale)
      strokeLine(ctx, cx, sh, cx + 6 * scale, sh + 5 * scale)
      break
    case 'cheer-high':
      strokeLine(ctx, cx, sh, cx - 6 * scale, headY - 4 * scale)
      strokeLine(ctx, cx, sh, cx + 6 * scale, headY - 4 * scale)
      break
    case 'reach':
      strokeLine(ctx, cx, sh, cx + 7 * facing * scale, headY - 4 * scale)
      strokeLine(ctx, cx, sh, cx + 4 * facing * scale, sh + 1 * scale)
      break
    case 'reach-high':
      strokeLine(ctx, cx, sh, cx + 6 * facing * scale, headY - 8 * scale)
      strokeLine(ctx, cx, sh, cx - 4 * facing * scale, headY - 6 * scale)
      break
  }
  switch (legs) {
    case 'stance':
      strokeLine(ctx, cx, hipY, cx - 3 * scale, feetY)
      strokeLine(ctx, cx, hipY, cx + 3 * scale, feetY)
      break
    case 'wide':
      strokeLine(ctx, cx, hipY, cx - 7 * scale, feetY)
      strokeLine(ctx, cx, hipY, cx + 7 * scale, feetY)
      break
    case 'jump':
      strokeLine(ctx, cx, hipY, cx - 3 * scale, hipY + 5 * scale)
      strokeLine(ctx, cx, hipY, cx + 3 * scale, hipY + 5 * scale)
      break
    case 'land':
      strokeLine(ctx, cx, hipY, cx - 5 * scale, feetY - 1 * scale)
      strokeLine(ctx, cx, hipY, cx + 5 * scale, feetY)
      break
  }
}

// 后视角库里
function drawCurryBack(
  ctx: any,
  cx: number,
  feetY: number,
  shoulderShimmy: number,
  scale: number,
) {
  const headR = 3.2 * scale
  const headY = feetY - 18 * scale
  const torsoTop = headY + headR
  const torsoBot = torsoTop + 8 * scale
  strokeCircle(ctx, cx, headY, headR, 14)
  strokeCircle(ctx, cx, headY, headR - 0.5, 14)
  strokeLine(ctx, cx - headR * 0.6, headY, cx - headR * 0.3, headY - headR * 0.4)
  strokeLine(ctx, cx + headR * 0.6, headY, cx + headR * 0.3, headY - headR * 0.4)
  const lShoulder = cx - 4 * scale + shoulderShimmy
  const rShoulder = cx + 4 * scale + shoulderShimmy
  strokeLine(ctx, lShoulder, torsoTop, rShoulder, torsoTop)
  strokeLine(ctx, cx + shoulderShimmy * 0.4, torsoTop, cx, torsoBot)
  ctx.beginPath()
  ctx.moveTo(cx - 2.2 * scale, torsoTop + 1 * scale)
  ctx.lineTo(cx + 2.2 * scale, torsoTop + 1 * scale)
  ctx.lineTo(cx + 2.2 * scale, torsoTop + 5 * scale)
  ctx.lineTo(cx - 2.2 * scale, torsoTop + 5 * scale)
  ctx.lineTo(cx - 2.2 * scale, torsoTop + 1 * scale)
  ctx.stroke()
  strokeLine(
    ctx,
    cx - 1.2 * scale,
    torsoTop + 2 * scale,
    cx - 1.2 * scale,
    torsoTop + 4 * scale,
  )
  strokeCircle(ctx, cx + 0.7 * scale, torsoTop + 3 * scale, 0.9 * scale, 8)
  strokeLine(ctx, lShoulder, torsoTop, lShoulder - 6 * scale, headY - 4 * scale)
  strokeLine(ctx, rShoulder, torsoTop, rShoulder + 6 * scale, headY - 4 * scale)
  strokeLine(ctx, cx, torsoBot, cx - 4 * scale, feetY)
  strokeLine(ctx, cx, torsoBot, cx + 4 * scale, feetY)
}

// SHOT 1: WIDE 全景
function drawShot1Wide(ctx: any, W: number, H: number, u: number) {
  const groundY = Math.floor(H * 0.78)
  drawFloor(ctx, W, groundY, true)
  drawCrowdSilhouette(ctx, W, H, 0.6)
  drawDistantHoop(ctx, W - 8, groundY - Math.floor(H * 0.25), 1.0)
  const logoX = Math.floor(W * 0.55)
  strokeCircle(ctx, logoX, groundY - 2, 7, 20)
  strokeCircle(ctx, logoX, groundY - 2, 4, 16)
  const curryX = Math.floor(W * 0.18 + u * (logoX - W * 0.30))
  const robX = curryX + 16
  drawPlayerScaled(
    ctx,
    curryX,
    groundY,
    'dribble-r',
    u < 0.5 ? 'stance' : 'wide',
    0,
    1,
    '30',
    1.0,
  )
  drawPlayerScaled(ctx, robX, groundY, 'reach', 'wide', 0, -1, '21', 1.0)
  const ballY = groundY - 4 - Math.abs(Math.sin(u * Math.PI * 4)) * 4
  fillBall(ctx, curryX + 4, ballY, 1.6)
}

// SHOT 2: CLOSE UP 双背后
function drawShot2Closeup(ctx: any, W: number, H: number, u: number) {
  const groundY = Math.floor(H * 0.92)
  for (let x = 0; x < W; x += 4) {
    strokeLine(ctx, x, groundY, x + 1.5, groundY)
  }
  for (let i = 0; i < 30; i++) {
    if (i % 3 === 0) {
      const a = Math.PI + (i / 30) * Math.PI
      const cx = Math.floor(W / 2)
      const cy = groundY - 1
      const r = Math.min(W, H) * 0.4
      const x1 = cx + Math.cos(a) * r
      const y1 = cy + Math.sin(a) * r * 0.4
      ctx.beginPath()
      ctx.arc(x1, y1, 0.5, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  drawCrowdSilhouette(ctx, W, H, 0.4)
  const scale = 2.0
  const curryX = Math.floor(W * 0.35)
  const robX = Math.floor(W * 0.62)
  let curryArms: ArmsPose
  let ballX: number
  let ballY: number
  if (u < 0.25) {
    const v = u / 0.25
    curryArms = v < 0.5 ? 'between' : 'dribble-l'
    ballX = curryX + 4 * scale - v * 8 * scale
    ballY = groundY - 8 * scale + Math.sin(v * Math.PI) * 4
  } else if (u < 0.5) {
    curryArms = 'dribble-l'
    ballX = curryX - 4 * scale
    ballY = groundY - 5 * scale - Math.abs(Math.sin(u * 8)) * 3
  } else if (u < 0.75) {
    const v = (u - 0.5) / 0.25
    curryArms = v < 0.5 ? 'behind' : 'dribble-r'
    ballX = curryX - 4 * scale + v * 8 * scale
    ballY = groundY - 9 * scale + Math.sin(v * Math.PI) * 5
  } else {
    curryArms = 'dribble-r'
    ballX = curryX + 4 * scale
    ballY = groundY - 5 * scale - Math.abs(Math.sin(u * 8)) * 3
  }
  drawPlayerScaled(ctx, curryX, groundY, curryArms, 'wide', 0, 1, '30', scale)
  drawPlayerScaled(
    ctx,
    robX,
    groundY,
    'reach',
    u > 0.6 ? 'wide' : 'stance',
    0,
    -1,
    '21',
    scale,
  )
  fillBall(ctx, ballX, ballY, 2.6)
  if (u < 0.25 || (u >= 0.5 && u < 0.75)) {
    const trail = u < 0.25 ? u / 0.25 : (u - 0.5) / 0.25
    for (let i = 1; i <= 4; i++) {
      const tt = Math.max(0, trail - i * 0.05)
      if (tt <= 0) break
      let tx, ty
      if (u < 0.25) {
        tx = curryX + 4 * scale - tt * 8 * scale
        ty = groundY - 8 * scale + Math.sin(tt * Math.PI) * 4
      } else {
        tx = curryX - 4 * scale + tt * 8 * scale
        ty = groundY - 9 * scale + Math.sin(tt * Math.PI) * 5
      }
      ctx.beginPath()
      ctx.arc(tx, ty, 0.6, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}

// SHOT 3: TRACKING 跟拍出手
function drawShot3Tracking(ctx: any, W: number, H: number, u: number) {
  const groundY = Math.floor(H * 0.84)
  drawFloor(ctx, W, groundY, true)
  drawCrowdSilhouette(ctx, W, H, 0.5)
  drawDistantHoop(ctx, W - 14, groundY - Math.floor(H * 0.30), 1.2)
  const logoX = Math.floor(W * 0.30)
  strokeCircle(ctx, logoX, groundY - 2, 8, 20)
  strokeCircle(ctx, logoX, groundY - 2, 5, 16)
  const scale = 1.4
  const curryX = logoX + 6
  const robX = curryX + 12
  let curryArms: ArmsPose
  let curryLegs: LegsPose
  let curryJumpY = 0
  let ballX: number
  let ballY: number
  if (u < 0.35) {
    const v = u / 0.35
    curryArms = 'gather'
    curryLegs = v < 0.5 ? 'wide' : 'stance'
    curryJumpY = -v * 2
    ballX = curryX
    ballY = groundY - 14 - v * 8
  } else if (u < 0.55) {
    const v = (u - 0.35) / 0.2
    curryArms = 'gather'
    curryLegs = 'jump'
    curryJumpY = -2 - v * 4
    ballX = curryX
    ballY = groundY - 22 - v * 6 + curryJumpY
  } else {
    const v = (u - 0.55) / 0.45
    curryArms = v < 0.4 ? 'release' : 'follow'
    curryLegs = 'jump'
    curryJumpY = -8 - v * 3
    ballX = curryX + 2 + v * 8
    ballY = groundY - 28 + curryJumpY - v * 6
  }
  drawPlayerScaled(
    ctx,
    curryX,
    groundY,
    curryArms,
    curryLegs,
    curryJumpY,
    1,
    '30',
    scale,
  )
  drawPlayerScaled(
    ctx,
    robX,
    groundY,
    u > 0.5 ? 'reach-high' : 'reach',
    u > 0.4 ? 'jump' : 'wide',
    u > 0.5 ? -3 : 0,
    -1,
    '21',
    scale,
  )
  fillBall(ctx, ballX, ballY, 2.0)
}

// SHOT 4: BALL POV 跟球
function drawShot4BallPov(ctx: any, W: number, H: number, u: number) {
  const ballScreenX = W * 0.4
  const ballScreenY = H * 0.5
  const hoopScale = 0.5 + u * 1.6
  const hoopScreenX = W - 6 - u * 6
  const hoopScreenY = H * 0.45 + u * H * 0.15
  const lightCount = 8 + Math.floor(u * 20)
  for (let i = 0; i < lightCount; i++) {
    const seed = (i * 2654435761) >>> 0
    const x = seed % W
    const y = (seed >> 8) % Math.floor(H * 0.4)
    if (Math.abs(x - ballScreenX) < 4 && Math.abs(y - ballScreenY) < 4) continue
    ctx.beginPath()
    ctx.arc(x, y, 0.5, 0, Math.PI * 2)
    ctx.stroke()
  }
  const horizonY = H * 0.7 + u * H * 0.1
  strokeLine(ctx, 0, horizonY + 4, W, horizonY)
  drawCrowdSilhouette(ctx, W, H, 0.3)
  drawDistantHoop(ctx, hoopScreenX, hoopScreenY, hoopScale)
  for (let i = 1; i <= 8; i++) {
    const trailScale = 1 - i * 0.1
    const tx = ballScreenX - i * 3
    const ty = ballScreenY - Math.sin(u * Math.PI) * 4 + i * 0.4
    if (trailScale > 0.2) {
      ctx.beginPath()
      ctx.arc(tx, ty, 0.8 * trailScale, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  fillBall(ctx, ballScreenX, ballScreenY, 3.5)
}

// SHOT 5: RIM SPLASH 入网特写
function drawShot5Splash(ctx: any, W: number, H: number, u: number) {
  drawCrowdSilhouette(ctx, W, H, 0.2)
  const cx = Math.floor(W * 0.5)
  const cy = Math.floor(H * 0.4)
  const R = Math.min(W * 0.18, H * 0.20)
  const netWave = u * Math.PI * 6
  drawRimCloseup(ctx, cx, cy, R, netWave)
  let ballY: number
  const ballX = cx
  if (u < 0.4) {
    const v = u / 0.4
    ballY = cy - R * 1.2 + v * R * 1.2
  } else if (u < 0.7) {
    const v = (u - 0.4) / 0.3
    ballY = cy + v * R * 1.6
  } else {
    const v = (u - 0.7) / 0.3
    ballY = cy + R * 2 + v * R * 1.5
  }
  fillBall(ctx, ballX, ballY, R * 0.18)
  if (u > 0.5 && u < 0.85) {
    const rad = (u - 0.5) * 8
    const opacity = 1 - (u - 0.5) / 0.35
    if (opacity > 0.3) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const x0 = cx + Math.cos(a) * R * 0.6
        const y0 = cy + R * 1.2 + Math.sin(a) * R * 0.4
        const x1 = cx + Math.cos(a) * (R * 0.6 + rad)
        const y1 = cy + R * 1.2 + Math.sin(a) * (R * 0.4 + rad * 0.6)
        strokeLine(ctx, x0, y0, x1, y1)
      }
    }
  }
}

// SHOT 6: CURRY BACK 后视角庆祝
function drawShot6CurryBack(ctx: any, W: number, H: number, u: number) {
  const groundY = Math.floor(H * 0.92)
  for (let yy = Math.floor(H * 0.15); yy < H * 0.55; yy += 3) {
    for (let xx = 0; xx < W; xx += 6) {
      const noise = ((xx * 73856093 + yy * 19349663) >>> 0) % 5
      if (noise < 2) {
        ctx.beginPath()
        ctx.arc(xx + (yy % 3), yy, 0.5, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }
  strokeLine(ctx, 0, Math.floor(H * 0.55), W, Math.floor(H * 0.55))
  drawCrowdSilhouette(ctx, W, H, 0.6)
  const cx = Math.floor(W * 0.42)
  const shimmy = Math.sin(u * Math.PI * 8) * 3
  drawCurryBack(ctx, cx, groundY - 2, shimmy, 2.0)
  if (u > 0.2) {
    const fx = cx + 18
    const fy = Math.floor(H * 0.25)
    strokeLine(ctx, fx, fy + 2, fx, fy - 5)
    strokeLine(ctx, fx, fy + 5, fx, fy + 5.5)
    strokeLine(ctx, fx - 4, fy - 1, fx - 7, fy - 4)
    strokeLine(ctx, fx + 4, fy - 1, fx + 7, fy - 4)
  }
}

export function generateScene({ W, H, t }: SceneInputs): Scene {
  const C = new (Canvas as any)(W, H)
  const ctx = C.getContext('2d')

  let caption = ''
  let subline = ''
  let color: Scene['color'] = 'cyan'

  if (t < 0.12) {
    drawShot1Wide(ctx, W, H, t / 0.12)
    caption = '0:00.5 OT · GSW 118 - OKC 118'
    subline = '【WIDE】 库里推过半场 · #21 Roberson 退防'
    color = 'cyan'
  } else if (t < 0.30) {
    drawShot2Closeup(ctx, W, H, (t - 0.12) / 0.18)
    caption = '【CLOSE UP】 跨下 → 背后 双背后'
    subline = 'Roberson 重心被骗 · 这都不是终点'
    color = 'magenta'
  } else if (t < 0.50) {
    drawShot3Tracking(ctx, W, H, (t - 0.30) / 0.20)
    caption = '【TRACKING】 logo 处出手 · 38 英尺'
    subline = '"我刚过半场就知道我要投了"'
    color = 'yellow'
  } else if (t < 0.78) {
    drawShot4BallPov(ctx, W, H, (t - 0.50) / 0.28)
    const u = (t - 0.50) / 0.28
    caption =
      u < 0.4 ? '【BALL POV】 球离手 · 弧线飞翔' : u < 0.8 ? '~~~~ 高 · 弧 · 入 · 框 ~~~~' : '准 · 心 · 入 · 网'
    subline = '加时绝杀就在眼前'
    color = 'green'
  } else if (t < 0.88) {
    drawShot5Splash(ctx, W, H, (t - 0.78) / 0.10)
    caption = '★  唰 ！  空 · 心 · 入 · 网  ★'
    subline = '0:00.0 · GSW 121 - OKC 118 · BANG!'
    color = 'green'
  } else {
    drawShot6CurryBack(ctx, W, H, (t - 0.88) / 0.12)
    caption = '【后视角】 SHIMMY 抖肩 · 转身霸气'
    subline = 'Curry 的代表作 · 改变历史的一投'
    color = 'yellow'
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
