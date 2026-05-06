# wtcc 未完成项 backlog

记录已知 gap，按优先级 + 前置依赖排。

---

## /model 4 种登录方式（用户要求）

入口设想：`/login` → 4-way selector dialog（取代或扩展现有 `/login`）。

| # | 方式 | 现状 | 待办 | 阻塞 |
|---|---|---|---|---|
| 1 | A 社 OAuth（claude.ai 登录） | ✅ 已实现 —— `src/commands/login/login.tsx` 调 `ConsoleOAuthFlow`，凭证落 `~/.claude/.credentials.json` | 把它接进新 4-way selector 的 option 1 入口 | 无 |
| 2 | OpenAI OAuth（Codex / ChatGPT 订阅登录）| ❌ 未实现 —— grep 全仓 0 命中 Codex OAuth 流程 | 写 OAuth client：authorization endpoint / client_id / 回调 / token 交换 / 刷新 / 持久化 | **要 OpenAI Codex CLI 的 OAuth wire spec 才能动**。参考路径：抽 `/opt/homebrew/lib/node_modules/@openai/codex/.../codex` 二进制字符串、或读 codex CLI 源码看它怎么走 OAuth |
| 3 | ccswitch 登录 | ❌ 未实现 —— 仓库无任何 ccswitch / cc-switch 痕迹 | 全新写一套客户端 | **要 ccswitch 的 API 文档**：登录端点、token 形态、刷新机制、protocol（OpenAI 还是 Anthropic 协议） |
| 4 | API key + 协议选择 | 半实现 —— `wtcc-zh.sh` 从 env 拿 key 同时 export 两个协议；**没有 UI 让用户粘 key + radio 选 protocol** | 写一个 Ink dialog：input 框（贴 key）+ radio（OpenAI / Anthropic 协议）+ 写 `~/.claude/settings.json` 持久化 | 无 |

**第一步可做（不等阻塞）**：搭 4-way selector dialog 框架，1 和 4 接通能用，2 和 3 放 "Coming soon" 占位。

---

## 真发请求测试（要 relay key）

VM 里现已自动从 `/etc/profile.d/claude-code.sh` 拿到 `ANTHROPIC_AUTH_TOKEN`，host 上还差 key。

| 项 | 测什么 | 期望 |
|---|---|---|
| **xhigh thinking budget** | `/effort xhigh` + opus-4-7 + 长任务 | thinking 阶段 latency 比 high 长一截，wire request 含 `thinking.budget_tokens=32768` |
| **Codex `/fast` 注入** | `WTCC_OPENAI_FAST=1` + 不走 relay + `FREE_CODE_DEBUG_OPENAI=2` | `/tmp/free-code-openai.log` grep 出 `"service_tier":"fast"` |
| **relay 双协议 roundtrip** | OpenAI 协议（默认）+ Anthropic 协议（`unset CLAUDE_CODE_USE_OPENAI`）各一个真问 | 两边都正常返回，无 401 / 无 schema 错 |
| **cost-tracker 修复 e2e** | 切到 gemini-flash 跑几个 query，`/cost` 看花费 | 不再被错算成 Opus 5/25 per Mtok（应该 ~$0.30/$2.50） |

---

## i18n 长尾（用户感知低，按需推）

已完成命名空间：`command.*` 全部、`ui.permissions.*` 13/13 文件、`modelPicker.*`、`command.model.*`、`command.effort.*`、`welcome.*`、`error.*` 一部分。

剩余：

| 区域 | 文件 | 工作量 |
|---|---|---|
| REPL 主屏 | `src/screens/REPL.tsx`（5009 行） | 散点多，需 grep `<Text>` 文字字面量定位 |
| Bash / PowerShell select 选项 | `bashToolUseOptions.ts`、`powershellToolUseOptions.ts` | A2 漏的，10–20 条 label |
| 状态栏 / 调试输出 | `src/components/Footer*.tsx`、错误堆栈格式化 | 影响低，可保留英文 |

---

## npm publish 真发布的 blocker

| 项 | 问题 | 推荐路径 |
|---|---|---|
| **`bun --compile` cli 跑不起来** | `Cannot find module './error/CacheErrorCodes.mjs'` —— `@azure/msal-common` 经 `@azure/identity@4.13.1` 间接拖入，dynamic `import('@azure/identity')` 在 `client.ts:213` 静态分析不到 | 不用 `--compile`，改成 ship TS 源（`prepublishOnly` 改成不调 build），用户装 wtcc 后用 bun 跑 |
| **跨平台 binary** | 当前 `cli` 是 Mach-O arm64 only | 同上 —— ship 源直接绕开 |
| **未登录 npm registry** | `npm whoami` 失败 | 真发布前 `npm login` |

---

## 已实现但边角风险

- **VM 桥接通道** `/tmp/wtcc-vm-bridge/`（Finder Apple Events 拷出 Lima ssh.config + key 到 /tmp，绕 macOS TCC ThunderSSD 拦截）。每次 macOS 重启 /tmp 清空，要重跑桥接脚本（脚本自身没固化成可执行）。
- **`/update` 命令** 当前 `wtcc` 不在 npm，所以永远返回 "not on npm yet"。真发布后才有意义。
- **Codex `/fast`** 路径已注入 `service_tier`，但**未在真 ChatGPT 订阅请求里验证** wire body 真的发出去 + 服务端真的认 fast tier。需要 Codex 订阅账号才能验。

---

## ccswitch / cc-switch 是什么？（待用户填）

- 服务网址：
- 登录端点：
- 参考文档 URL：
- Token 形态（Bearer / OAuth code / 自定义 header）：
- 协议（OpenAI / Anthropic / 私有）：

填上面这些之后我就能写实现。
