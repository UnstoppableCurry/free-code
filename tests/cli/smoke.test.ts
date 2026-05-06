import { describe, test, expect } from 'bun:test'

const ENTRY = 'src/entrypoints/welcome-demo.tsx'

async function runDemo(env: Record<string, string>) {
  const proc = Bun.spawn(['bun', 'run', ENTRY, '--model', 'claude-opus-4-7'], {
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

describe('CLI smoke — welcome-demo entrypoint', () => {
  test('renders Chinese welcome when FREE_CODE_LANG=zh-CN', async () => {
    const { stdout, exitCode } = await runDemo({ FREE_CODE_LANG: 'zh-CN' })
    expect(exitCode).toBe(0)
    expect(stdout).toContain('欢迎使用 free-code')
    expect(stdout).toContain('当前 model: claude-opus-4-7')
    // Technical term must NOT be machine-translated
    expect(stdout).not.toContain('模型')
  }, 30000)

  test('renders English welcome when FREE_CODE_LANG=en-US', async () => {
    const { stdout, exitCode } = await runDemo({ FREE_CODE_LANG: 'en-US' })
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Welcome to free-code')
    expect(stdout).toContain('Current model: claude-opus-4-7')
  }, 30000)

  test('falls back to English when no locale env set', async () => {
    const { stdout, exitCode } = await runDemo({
      FREE_CODE_LANG: '',
      LANG: '',
      LC_ALL: '',
      LC_MESSAGES: '',
    })
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Welcome to free-code')
  }, 30000)

  test('zh prefix in LANG triggers Chinese (e.g. zh_CN.UTF-8)', async () => {
    const { stdout, exitCode } = await runDemo({
      FREE_CODE_LANG: '',
      LANG: 'zh_CN.UTF-8',
    })
    expect(exitCode).toBe(0)
    expect(stdout).toContain('欢迎使用 free-code')
  }, 30000)
})
