// Lightweight helpers for converting an internal message[] history into
// fields the routing layer cares about (last user text, image presence).
// Pure functions, no I/O, used by both the OpenAI and Anthropic dispatch
// paths so the routing decision is identical regardless of provider.

import type { Message } from '../types/message.js'

export function extractLastUserText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as any
    if (m?.type !== 'user') continue
    const c = m.message?.content
    if (typeof c === 'string') return c
    if (Array.isArray(c)) {
      const parts: string[] = []
      for (const b of c) {
        if (b?.type === 'text' && typeof b.text === 'string') parts.push(b.text)
      }
      if (parts.length > 0) return parts.join('\n')
    }
  }
  return ''
}

export function messagesContainImages(messages: Message[]): boolean {
  for (const m of messages as any[]) {
    const c = m?.message?.content
    if (!Array.isArray(c)) continue
    for (const b of c) {
      if (b?.type === 'image') return true
    }
  }
  return false
}
