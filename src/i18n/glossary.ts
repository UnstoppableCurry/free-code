// Tight allow-list. Only command names and core LLM/protocol jargon stay
// English in zh-CN copy. Everything else (commit, branch, diff, repo, terminal,
// session, context, plugin, hook, skill, config, permission, etc.) should be
// translated for a natural Chinese reading experience.
export const DO_NOT_TRANSLATE = [
  // 核心 LLM/协议术语
  'token',
  'tokens',
  'model',
  'models',
  'prompt',
  'agent',
  'agents',
  'embedding',
  // 缩写
  'LLM',
  'RLHF',
  'MCP',
  'API',
  'CLI',
  'SDK',
  'IDE',
  'JSON',
  'YAML',
  'URL',
  // 厂商/产品名
  'Anthropic',
  'OpenAI',
  'OpenRouter',
  'Ollama',
  'Claude',
  'GitHub',
  'Google',
  // 框架/运行时（产品名）
  'Bun',
  'Node',
  'npm',
  'TypeScript',
  'React',
  'Ink',
  // 模型代号示例（具体 ID 由实际值传入，这里仅列家族标签）
  'Sonnet',
  'Opus',
  'Haiku',
] as const

// Only flag machine translations of the *core* jargon. Commit/branch/diff/etc.
// are now expected to be translated, so they are no longer flagged here.
const BAD_TRANSLATIONS: Record<string, string[]> = {
  token: ['令牌'],
  tokens: ['令牌'],
  model: ['模型'],
  models: ['模型'],
  prompt: ['提示词'],
  agent: ['代理', '智能体'],
  agents: ['代理', '智能体'],
  MCP: ['多通道协议'],
  API: ['应用接口'],
}

export type LintIssue = {
  key: string
  term: string
  badTranslation: string
  message: string
}

export function lintTranslation(input: {
  key: string
  en: string
  zh: string
}): LintIssue[] {
  const issues: LintIssue[] = []
  const enLower = input.en.toLowerCase()
  for (const [term, badList] of Object.entries(BAD_TRANSLATIONS)) {
    if (!enLower.includes(term.toLowerCase())) continue
    for (const bad of badList) {
      if (input.zh.includes(bad)) {
        issues.push({
          key: input.key,
          term,
          badTranslation: bad,
          message: `"${term}" 不应翻译为 "${bad}"——核心术语保留英文`,
        })
        break
      }
    }
  }
  return issues
}
