import { describe, test, expect } from 'bun:test'
import zhCN from '../../src/i18n/locales/zh-CN.json' with { type: 'json' }
import { DO_NOT_TRANSLATE } from '../../src/i18n/glossary.js'

// Lint pass: walk every zh-CN value and flag English words >=4 chars that are
// not part of the tight allow-list, not a flag (--*), not a slash command,
// not a path, and not a placeholder ({{var}}).
//
// This catches translation oversights like leftover "Configure", "Manage",
// "Show" that should have been translated.

const ALLOW = new Set<string>([
  ...DO_NOT_TRANSLATE.map((s) => s.toLowerCase()),
  // Additional product names / formats that legitimately appear verbatim.
  'free-code',
  'free',
  'repl',
  'pull',
  'claude',
  'codex',
  'sonnet',
  'opus',
  'haiku',
  'ants',
  'chrome',
  'pull',
  'request',
  'desktop',
  'heap',
  'plan',
  'fast',
  'auto',
  'max',
  'mode',
  'tier',
  'http',
  'https',
  'owner',
  'repo',
  'path',
  'json',
  'yaml',
  'xml',
  'binary',
  'stream',
  'format',
  'file',
  'descriptor',
  'tag',
  'tags',
  'mode',
  'code',
  'test',
  'dummy',
  'qr',
  'vim',
  'true',
  'false',
  'null',
  'pipx',
  'uvx',
  'pip',
  'python',
  'cli',
  'web',
  'review',
  'level',
  'name',
  'alias',
  'memory',
  'system',
  'dev',
  'flag',
  'ide',
  // Keyboard key names — the user reads these on their keyboard. Translating
  // 'Enter' to '回车' would force them to mentally re-map; preserve verbatim.
  'enter',
  'esc',
  'tab',
  'shift',
  'space',
  'return',
  // Infrastructure terms used in /diagnose-relay output. 'relay' is a domain
  // word in this codebase (see src/services/api/*), already used in error
  // messages. ENV var names are preserved verbatim.
  'relay',
  'base',
  // Example tokens that appear inside usage strings (e.g. /save research-2026)
  'research',
  // Hook event type identifiers — kept verbatim because they're technical
  // names of specific lifecycle events (matched by string in user's hooks
  // config). Like "commit" / "branch" they have meaning in the domain.
  'precompact',
  'postcompact',
  'sessionstart',
])

// Keywords explicitly required by the new policy to be translated. If any of
// these appear inside a zh-CN value as a standalone English word, the
// translation is incomplete.
const MUST_BE_TRANSLATED = [
  'commit',
  'branch',
  'merge',
  'rebase',
  'diff',
  'fork',
  'staged',
  'worktree',
  'shell',
  'terminal',
  'config',
  'settings',
  'session',
  'context',
  'permission',
  'permissions',
  'hook',
  'hooks',
  'plugin',
  'plugins',
  'skill',
  'skills',
  'message',
  'request',
  'response',
  'warning',
  'workspace',
  'marketplace',
  'server',
  'servers',
]

function tokens(s: string): string[] {
  // Strip placeholders {{var}}, paths, flags --foo, slash-commands /foo,
  // identifiers like a.b.c, then split on non-word.
  return s
    .replace(/\{\{[^}]+\}\}/g, ' ')
    .replace(/--[\w-]+/g, ' ')
    // Strip flag values like "output-format=stream-json", "owner/repo".
    .replace(/[\w-]+=[\w-]+/g, ' ')
    .replace(/\/\w[\w-]*/g, ' ')
    .replace(/[a-z0-9._-]+\.(md|json|js|ts|tsx)/gi, ' ')
    .replace(/[一-鿿]+/g, ' ')
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
}

describe('zh-CN translations — residual English audit', () => {
  test('no MUST_BE_TRANSLATED keyword appears as a standalone English word', () => {
    const offenders: Array<{ key: string; word: string; value: string }> = []
    for (const [key, value] of Object.entries(
      zhCN as Record<string, string>,
    )) {
      const ts = tokens(value).map((t) => t.toLowerCase())
      for (const word of MUST_BE_TRANSLATED) {
        if (ts.includes(word)) offenders.push({ key, word, value })
      }
    }
    expect(
      offenders,
      `Found English keywords that should have been translated:\n` +
        offenders
          .map((o) => `  ${o.key}: "${o.word}" in "${o.value}"`)
          .join('\n'),
    ).toEqual([])
  })

  test('no English word >=4 chars outside the allow-list', () => {
    const offenders: Array<{ key: string; word: string; value: string }> = []
    for (const [key, value] of Object.entries(
      zhCN as Record<string, string>,
    )) {
      for (const word of tokens(value)) {
        if (word.length < 4) continue
        if (ALLOW.has(word.toLowerCase())) continue
        offenders.push({ key, word, value })
      }
    }
    expect(
      offenders,
      `Unexpected English words in zh-CN (consider translating or allow-listing):\n` +
        offenders
          .slice(0, 20)
          .map((o) => `  ${o.key}: "${o.word}" in "${o.value}"`)
          .join('\n'),
    ).toEqual([])
  })
})
