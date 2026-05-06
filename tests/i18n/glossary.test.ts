import { describe, test, expect } from 'bun:test'
import {
  DO_NOT_TRANSLATE,
  lintTranslation,
} from '../../src/i18n/glossary.js'

describe('do-not-translate glossary (tight allow-list)', () => {
  test('keeps core LLM/protocol jargon', () => {
    expect(DO_NOT_TRANSLATE).toContain('token')
    expect(DO_NOT_TRANSLATE).toContain('model')
    expect(DO_NOT_TRANSLATE).toContain('prompt')
    expect(DO_NOT_TRANSLATE).toContain('agent')
    expect(DO_NOT_TRANSLATE).toContain('MCP')
    expect(DO_NOT_TRANSLATE).toContain('API')
    expect(DO_NOT_TRANSLATE).toContain('LLM')
  })

  test('removes git / shell jargon (now translated)', () => {
    expect(DO_NOT_TRANSLATE).not.toContain('commit')
    expect(DO_NOT_TRANSLATE).not.toContain('branch')
    expect(DO_NOT_TRANSLATE).not.toContain('diff')
    expect(DO_NOT_TRANSLATE).not.toContain('repo')
    expect(DO_NOT_TRANSLATE).not.toContain('fork')
    expect(DO_NOT_TRANSLATE).not.toContain('worktree')
    expect(DO_NOT_TRANSLATE).not.toContain('terminal')
    expect(DO_NOT_TRANSLATE).not.toContain('shell')
    expect(DO_NOT_TRANSLATE).not.toContain('regex')
  })
})

describe('lintTranslation — flags machine translations of core jargon only', () => {
  test('flags 令牌 (machine translation of "token")', () => {
    const issues = lintTranslation({
      key: 'cli.usage',
      en: 'Used 1.2K tokens',
      zh: '已使用 1.2K 令牌',
    })
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].term).toBe('token')
    expect(issues[0].badTranslation).toBe('令牌')
  })

  test('flags 模型 (machine translation of "model")', () => {
    const issues = lintTranslation({
      key: 'cli.model',
      en: 'Switching model',
      zh: '正在切换模型',
    })
    expect(issues.some((i) => i.term === 'model')).toBe(true)
  })

  test('flags 提示词 (machine translation of "prompt")', () => {
    const issues = lintTranslation({
      key: 'cli.prompt',
      en: 'System prompt is required',
      zh: '系统提示词不能为空',
    })
    expect(issues.some((i) => i.term === 'prompt')).toBe(true)
  })

  test('does NOT flag 提交 — "commit" is now expected to translate', () => {
    const issues = lintTranslation({
      key: 'git.commit',
      en: 'Created commit abc123',
      zh: '已创建提交 abc123',
    })
    expect(issues).toEqual([])
  })

  test('does NOT flag 分支 — "branch" is now expected to translate', () => {
    const issues = lintTranslation({
      key: 'git.branch',
      en: 'Create a branch',
      zh: '创建一个分支',
    })
    expect(issues).toEqual([])
  })

  test('does NOT flag 差异 — "diff" is now expected to translate', () => {
    const issues = lintTranslation({
      key: 'git.diff',
      en: 'View diff',
      zh: '查看差异',
    })
    expect(issues).toEqual([])
  })

  test('does NOT flag 终端 — "terminal" is now expected to translate', () => {
    const issues = lintTranslation({
      key: 'cli.terminal',
      en: 'Open terminal',
      zh: '打开终端',
    })
    expect(issues).toEqual([])
  })

  test('passes when technical term kept in English', () => {
    const issues = lintTranslation({
      key: 'cli.usage',
      en: 'Used 1.2K tokens',
      zh: '已使用 1.2K token',
    })
    expect(issues).toEqual([])
  })

  test('does not flag 模式 (mode) — substring of 模型 but different word', () => {
    const issues = lintTranslation({
      key: 'cli.mode',
      en: 'Switch mode',
      zh: '切换模式',
    })
    expect(issues).toEqual([])
  })
})
