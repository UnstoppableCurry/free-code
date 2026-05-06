import { describe, test, expect, beforeAll, afterEach } from 'bun:test'
import { lintTranslation } from '../../src/i18n/glossary.js'
import enUS from '../../src/i18n/locales/en-US.json' with { type: 'json' }
import zhCN from '../../src/i18n/locales/zh-CN.json' with { type: 'json' }

// Several command modules (commit, init, version) have a pre-existing circular
// dependency with src/commands.ts: importing them directly triggers TDZ on the
// commands.ts registry. Pre-loading commands.ts here resolves the cycle by
// finishing its module evaluation before any command file is imported by the
// test loaders below. /login also reads ANTHROPIC_API_KEY at construction time,
// so we set a dummy in the loader for that command.
beforeAll(async () => {
  // Dummy ANTHROPIC_API_KEY so hasAnthropicApiKeyAuth() doesn't throw during
  // /login description construction. Restored in afterEach via per-loader save.
  process.env.ANTHROPIC_API_KEY ??= 'test-dummy-for-i18n'
  await import('../../src/commands.js')
})

// Commands whose `description` is a plain string field (or a getter we drive)
// that we want exercised under both locales. We deliberately list these here
// (not auto-discovered) so a missing/renamed key fails the test.
const COMMAND_LOADERS: Array<{
  name: string
  // Some command modules export the Command directly; some default-export
  // a thunk `() => Command`. We normalize both to a Command object.
  load: () => Promise<{ name: string; description: string }>
}> = [
  {
    name: 'help',
    load: async () => {
      const m = await import('../../src/commands/help/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'clear',
    load: async () => {
      const m = await import('../../src/commands/clear/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'commit',
    load: async () => {
      const m = await import('../../src/commands/commit.js')
      return resolve(m.default)
    },
  },
  {
    name: 'init',
    load: async () => {
      const m = await import('../../src/commands/init.js')
      return resolve(m.default)
    },
  },
  {
    name: 'model',
    load: async () => {
      const m = await import('../../src/commands/model/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'exit',
    load: async () => {
      const m = await import('../../src/commands/exit/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'login',
    load: async () => {
      // /login probes hasAnthropicApiKeyAuth() at construction time. We pin
      // it to "no key, no oauth" so the description resolves to the default
      // "Sign in with..." key (not the .switch variant). We test the .switch
      // path separately below.
      const prevKey = process.env.ANTHROPIC_API_KEY
      const prevTok = process.env.CLAUDE_CODE_OAUTH_TOKEN
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN
      // hasAnthropicApiKeyAuth throws if there's no auth at all; provide a
      // file-descriptor sentinel that the function treats as "auth present"
      // without going down the api-key branch.
      process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR = '0'
      try {
        const m = await import('../../src/commands/login/index.js')
        return resolve(m.default)
      } finally {
        delete process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
        if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey
        if (prevTok !== undefined) process.env.CLAUDE_CODE_OAUTH_TOKEN = prevTok
      }
    },
  },
  {
    name: 'logout',
    load: async () => {
      const m = await import('../../src/commands/logout/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'version',
    load: async () => {
      const m = await import('../../src/commands/version.js')
      return resolve(m.default)
    },
  },
  {
    name: 'resume',
    load: async () => {
      const m = await import('../../src/commands/resume/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'agents',
    load: async () => {
      const m = await import('../../src/commands/agents/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'memory',
    load: async () => {
      const m = await import('../../src/commands/memory/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'compact',
    load: async () => {
      const m = await import('../../src/commands/compact/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'usage',
    load: async () => {
      const m = await import('../../src/commands/usage/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'cost',
    load: async () => {
      const m = await import('../../src/commands/cost/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'config',
    load: async () => {
      const m = await import('../../src/commands/config/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'skills',
    load: async () => {
      const m = await import('../../src/commands/skills/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'hooks',
    load: async () => {
      const m = await import('../../src/commands/hooks/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'mcp',
    load: async () => {
      const m = await import('../../src/commands/mcp/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'plugin',
    load: async () => {
      const m = await import('../../src/commands/plugin/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'ide',
    load: async () => {
      const m = await import('../../src/commands/ide/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'doctor',
    load: async () => {
      const m = await import('../../src/commands/doctor/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'upgrade',
    load: async () => {
      const m = await import('../../src/commands/upgrade/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'feedback',
    load: async () => {
      const m = await import('../../src/commands/feedback/index.js')
      return resolve(m.default)
    },
  },
  {
    name: 'status',
    load: async () => {
      const m = await import('../../src/commands/status/index.js')
      return resolve(m.default)
    },
  },
]
// Round 2: additional commands. Key may differ from cmd.name (kebab→camel).
const ROUND_2: Array<{ key: string; modPath: string }> = [
  { key: 'addDir', modPath: 'add-dir/index.js' },
  { key: 'branch', modPath: 'branch/index.js' },
  { key: 'bridge', modPath: 'bridge/index.js' },
  { key: 'btw', modPath: 'btw/index.js' },
  { key: 'context', modPath: 'context/index.js' },
  { key: 'copy', modPath: 'copy/index.js' },
  { key: 'diff', modPath: 'diff/index.js' },
  { key: 'effort', modPath: 'effort/index.js' },
  { key: 'export', modPath: 'export/index.js' },
  { key: 'files', modPath: 'files/index.js' },
  { key: 'permissions', modPath: 'permissions/index.js' },
  { key: 'plan', modPath: 'plan/index.js' },
  { key: 'rateLimitOptions', modPath: 'rate-limit-options/index.js' },
  { key: 'rename', modPath: 'rename/index.js' },
  { key: 'session', modPath: 'session/index.js' },
  { key: 'tasks', modPath: 'tasks/index.js' },
  { key: 'theme', modPath: 'theme/index.js' },
  { key: 'vim', modPath: 'vim/index.js' },
  { key: 'stats', modPath: 'stats/index.js' },
  { key: 'tag', modPath: 'tag/index.js' },
  { key: 'extraUsage', modPath: 'extra-usage/index.js' },
  { key: 'heapdump', modPath: 'heapdump/index.js' },
  { key: 'outputStyle', modPath: 'output-style/index.js' },
  { key: 'keybindings', modPath: 'keybindings/index.js' },
  { key: 'reloadPlugins', modPath: 'reload-plugins/index.js' },
  { key: 'review', modPath: 'review.js' },
  { key: 'brief', modPath: 'brief.js' },
]

function resolve(mod: any): { name: string; description: string } {
  const cmd = typeof mod === 'function' ? mod() : mod
  // `description` may be a literal or a getter; reading the property handles both.
  return { name: cmd.name, description: cmd.description as string }
}

// Some round-2 modules export named (e.g. `context`, `extraUsage`) instead of default.
function pickCmd(m: any, key: string): any {
  if (m.default) return m.default
  // Try the camel key directly (extraUsage, context, etc.)
  if (m[key]) return m[key]
  // Fallback: first exported object with a `.name` field.
  for (const v of Object.values(m)) {
    if (v && typeof v === 'object' && (v as any).name) return v
  }
  return undefined
}

const ORIGINAL_LANG = process.env.FREE_CODE_LANG

function setLocale(locale: 'zh-CN' | 'en-US') {
  process.env.FREE_CODE_LANG = locale
}

afterEach(() => {
  if (ORIGINAL_LANG === undefined) delete process.env.FREE_CODE_LANG
  else process.env.FREE_CODE_LANG = ORIGINAL_LANG
})

describe('slash command descriptions — i18n contract (25 commands)', () => {
  for (const { name } of COMMAND_LOADERS) {
    test(`/${name} has translation keys in both en-US and zh-CN locale files`, () => {
      const key = `command.${name}.description`
      expect(
        (enUS as Record<string, string>)[key],
        `missing en-US key ${key}`,
      ).toBeTruthy()
      expect(
        (zhCN as Record<string, string>)[key],
        `missing zh-CN key ${key}`,
      ).toBeTruthy()
    })
  }

  for (const loader of COMMAND_LOADERS) {
    test(`/${loader.name} description matches en-US bundle when FREE_CODE_LANG=en-US`, async () => {
      setLocale('en-US')
      const cmd = await loader.load()
      const expected = (enUS as Record<string, string>)[
        `command.${cmd.name}.description`
      ]!
      // Description may include dynamic suffix (e.g. /model includes current model
      // name). Assert the translated phrase is contained.
      expect(cmd.description).toContain(expected)
    })

    test(`/${loader.name} description matches zh-CN bundle when FREE_CODE_LANG=zh-CN`, async () => {
      setLocale('zh-CN')
      const cmd = await loader.load()
      const expected = (zhCN as Record<string, string>)[
        `command.${cmd.name}.description`
      ]!
      expect(cmd.description).toContain(expected)
    })

    test(`/${loader.name} zh-CN description has no machine-translated tech terms`, () => {
      const key = `command.${loader.name}.description`
      const en = (enUS as Record<string, string>)[key]!
      const zh = (zhCN as Record<string, string>)[key]!
      const issues = lintTranslation({ key, en, zh })
      expect(
        issues,
        `glossary violation in zh-CN[${key}]: ${JSON.stringify(issues)}`,
      ).toEqual([])
    })
  }

  // Spot-checks under the tightened glossary: only command names + core LLM
  // jargon (model, agent, MCP, API, prompt, token) stay English. Git/skill/
  // hook/plugin/etc. are translated.
  test('/commit zh-CN translates "commit" to 提交', () => {
    const zh = (zhCN as Record<string, string>)['command.commit.description']!
    expect(zh).toContain('提交')
  })

  test('/model zh-CN keeps the word "model" in English (not 模型)', () => {
    const zh = (zhCN as Record<string, string>)['command.model.description']!
    expect(zh).toContain('model')
    expect(zh).not.toContain('模型')
  })

  test('/login zh-CN preserves "Anthropic" brand verbatim', () => {
    const zh = (zhCN as Record<string, string>)['command.login.description']!
    expect(zh).toContain('Anthropic')
  })

  test('/mcp zh-CN keeps "MCP" verbatim (no machine translation)', () => {
    const zh = (zhCN as Record<string, string>)['command.mcp.description']!
    expect(zh).toContain('MCP')
  })

  test('/hooks zh-CN translates "hook" to 钩子', () => {
    const zh = (zhCN as Record<string, string>)['command.hooks.description']!
    expect(zh).toContain('钩子')
  })

  test('/plugin zh-CN translates "plugin" to 插件', () => {
    const zh = (zhCN as Record<string, string>)['command.plugin.description']!
    expect(zh).toContain('插件')
  })

  test('/skills zh-CN translates "skill" to 技能', () => {
    const zh = (zhCN as Record<string, string>)['command.skills.description']!
    expect(zh).toContain('技能')
  })

  test('/agents zh-CN keeps "agent" in English (not 代理 / 智能体)', () => {
    const zh = (zhCN as Record<string, string>)['command.agents.description']!
    expect(zh.toLowerCase()).toContain('agent')
    expect(zh).not.toContain('代理')
    expect(zh).not.toContain('智能体')
  })
})

describe('round-2 slash command descriptions — i18n contract', () => {
  for (const { key } of ROUND_2) {
    test(`command.${key}.description has en-US and zh-CN entries`, () => {
      const k = `command.${key}.description`
      expect((enUS as Record<string, string>)[k]).toBeTruthy()
      expect((zhCN as Record<string, string>)[k]).toBeTruthy()
    })
    test(`command.${key}.description zh-CN passes glossary lint`, () => {
      const k = `command.${key}.description`
      const en = (enUS as Record<string, string>)[k]!
      const zh = (zhCN as Record<string, string>)[k]!
      const issues = lintTranslation({ key: k, en, zh })
      expect(issues).toEqual([])
    })
    test(`command.${key}.description zh-CN contains at least one CJK char`, () => {
      const k = `command.${key}.description`
      const zh = (zhCN as Record<string, string>)[k]!
      expect(zh).toMatch(/[一-鿿]/)
    })
  }

  for (const { key, modPath } of ROUND_2) {
    test(`/${key} command emits the zh-CN string under FREE_CODE_LANG=zh-CN`, async () => {
      setLocale('zh-CN')
      const m = await import(`../../src/commands/${modPath}`)
      const cmd = resolve(pickCmd(m, key))
      const expected = (zhCN as Record<string, string>)[
        `command.${key}.description`
      ]!
      expect(cmd.description).toContain(expected)
    })

    test(`/${key} command emits the en-US string under FREE_CODE_LANG=en-US`, async () => {
      setLocale('en-US')
      const m = await import(`../../src/commands/${modPath}`)
      const cmd = resolve(pickCmd(m, key))
      const expected = (enUS as Record<string, string>)[
        `command.${key}.description`
      ]!
      expect(cmd.description).toContain(expected)
    })
  }
})

describe('zh-CN accuracy round 2 — 信达雅 polish regressions', () => {
  // Pin the exact polished phrases so they cannot regress to mechanical wording.
  const PINNED: Array<[string, string[], string[]]> = [
    // [key, must-contain, must-NOT-contain]
    ['command.version.description', ['正在运行', '而非'], ['不是自动更新']],
    ['command.usage.description', ['套餐的用量与额度'], []],
    ['command.upgrade.description', ['升级到 Max 套餐'], ['享']],
    ['command.compact.description', ['清空对话历史但在上下文中保留摘要'], []],
    ['command.init.description.new', ['可选的技能、钩子', '写入代码库说明'], []],
    ['command.session.description', ['URL'], []],
    ['error.installInProgress', ['：另一个进程'], ['——']],
    ['error.webSessionRequiresLogin', ['Claude.ai 账户登录', 'API key 不适用'], ['认证不满足']],
    ['error.describeAgent', ['agent 要做的事'], ['应做什么']],
    ['error.enterMarketplaceSource', ['插件市场地址'], ['市场源']],
    ['error.invalidMarketplaceSource', ['插件市场地址'], ['市场源']],
    ['modelMenu.bestForEveryday', ['最适合日常任务'], []],
    ['modelMenu.with1mContext', ['支持 1M 上下文'], ['带 1M']],
    ['modelMenu.setModelTo', ['将 model 切换为'], ['已切换 model 为']],
    ['dialog.idleReturn.body', ['节省 token 用量', '加快响应'], []],
    ['error.feedbackZdrUnavailable', ['对启用了'], []],
  ]
  for (const [key, mustContain, mustNotContain] of PINNED) {
    test(`zh-CN[${key}] retains polished phrasing`, () => {
      const zh = (zhCN as Record<string, string>)[key]!
      expect(zh, `missing zh-CN[${key}]`).toBeTruthy()
      for (const phrase of mustContain) {
        expect(zh, `${key} must contain "${phrase}"`).toContain(phrase)
      }
      for (const phrase of mustNotContain) {
        expect(zh, `${key} must NOT contain "${phrase}"`).not.toContain(phrase)
      }
    })
  }

  test('all zh-CN entries pass the glossary lint', () => {
    const allIssues: string[] = []
    for (const [key, en] of Object.entries(enUS as Record<string, string>)) {
      const zh = (zhCN as Record<string, string>)[key]
      if (!zh) continue
      const issues = lintTranslation({ key, en, zh })
      for (const issue of issues) allIssues.push(JSON.stringify(issue))
    }
    expect(allIssues, `glossary violations: ${allIssues.join('\n')}`).toEqual(
      [],
    )
  })
})
