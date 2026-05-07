# wtcc

> Claude Code 中文化 + 多 provider 兼容 + 自动 model 路由的开源 CLI

[![npm version](https://img.shields.io/npm/v/@unstoppablecurry/wtcc.svg)](https://www.npmjs.com/package/@unstoppablecurry/wtcc)
[![npm license](https://img.shields.io/npm/l/@unstoppablecurry/wtcc.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/@unstoppablecurry/wtcc.svg)](https://www.npmjs.com/package/@unstoppablecurry/wtcc)
[![GitHub stars](https://img.shields.io/github/stars/UnstoppableCurry/wtcc?style=social)](https://github.com/UnstoppableCurry/wtcc)
[![Runtime: Bun](https://img.shields.io/badge/runtime-bun-orange)](https://bun.sh)

`wtcc`（"WT Claude Code" 的缩写）是 **更强的 Claude Code 开源构建** —— 基于公开可见的 Claude Code 源码深度增强，专攻中文用户和多 provider 场景。一句话定位：**一个 CLI 同时讲中文、同时调 Claude / GPT / Gemini / DeepSeek / Kimi / GLM / Qwen，并按 model 能力自动路由。**

> 关键词（SEO）：Claude Code 中文版 · Claude Code Chinese · multi-provider AI CLI · OpenAI Anthropic relay CLI · self-hosted Claude Code · 自建 Claude Code · AI coding assistant 中文。

## 🚀 为什么用 wtcc 而不是官方 Claude Code (cc)？

| 你想干的事 | 官方 Claude Code | **`wtcc`（这个项目）** |
|---|---|---|
| 用中文 CLI 干活 | ❌ 全英文，没 i18n | ✅ banner / 命令 / 错误提示 / 日志全中文，~378 个 i18n key |
| 用 GPT / Gemini / DeepSeek（通过 OpenAI 协议 relay）| ❌ 只能调 Anthropic | ✅ 一份 CLI 同时跑 Anthropic / OpenAI / 任意 OpenAI 兼容 relay |
| 看 model 列表 | ❌ 硬编码在源码里，新 model 看不见 | ✅ 从 runtime registry 实时拉取，按 vendor 分组 |
| 用 `/effort` 切档 | ❌ 固定档位，不区分 model | ✅ per-model schema，每个 model 只暴露它支持的档位（含 opus-4-7 专属 `xhigh`，32k thinking budget） |
| 排查 relay / OpenAI 协议问题 | ❌ 完全没设计这条路径 | ✅ 自愈式 adapter（修孤儿 `tool_calls` / 并发 `tool_calls` / 真 token usage）+ `/diagnose-relay` 探针 |
| 知道为啥这个请求路由到那个 model | ❌ 黑盒 | ✅ `/why-this-model` 直接告诉你路由原因 |
| 自动检查更新 | ⚠️ 仅 Anthropic 自家发版渠道 | ✅ `/update` 直接打 npm registry |
| 看花了多少钱 | ⚠️ 非 Anthropic 模型估价不准 | ✅ 按真实 vendor 价计费 |
| 隐私 / 离线友好 | ❌ OTel + GrowthBook 持续上报 | ✅ 全部 telemetry 剥离，零回家请求 |
| 自己改源码 | ❌ 闭源（仅靠 source map 泄漏可窥探） | ✅ 全开源，TypeScript 源码直接 `bun run dev` |
| 看库里 logo 三分 | ❌ 没有 | ✅ `/curry` 100 帧 drawille 火柴人动画 |

## ✨ Highlights / 核心特性

- ✨ **中文 i18n**：banner、`/commands`、错误提示、日志全部中文化（`FREE_CODE_LANG=zh-CN`）
- ✨ **多 provider 适配器**：一份 CLI 同时兼容 Anthropic、OpenAI、以及任意 OpenAI 兼容 relay（convertmodel.net 等）
- ✨ **动态 `/model` 菜单**：从 runtime registry 实时拉取 model 列表，按 vendor 分组，不再写死
- ✨ **per-model `/effort` schema**：每个 model 只暴露它真正支持的 effort 档位（`low | medium | high | max`）
- ✨ **自愈式 OpenAI adapter**：自动修复孤儿 `tool_calls`、并发 `tool_calls`、上报真实 token usage
- ✨ **`/why-this-model` 路由解释**：告诉你为什么这次请求被发到了这个 model
- ✨ **Telemetry 全部移除**：无任何 OpenTelemetry / GrowthBook 回家请求

---

## 🚀 Quick Install / 快速安装

### 前置依赖：Bun ≥ 1.3

```bash
curl -fsSL https://bun.sh/install | bash
```

（Windows 用户用 PowerShell：`powershell -c "irm bun.sh/install.ps1 | iex"`）

### 主推：从 npm 全局安装

```bash
npm install -g @unstoppablecurry/wtcc
```

> npm 安装的实际是一个 Node shim，shim 内部仍然调用 `bun` 运行编译后的 CLI，因此 Bun 必须先装好。

### 备选 1：用 bun 安装

```bash
bun add -g @unstoppablecurry/wtcc
```

### 备选 2：从源码安装（开发者）

```bash
git clone https://github.com/UnstoppableCurry/wtcc.git
cd wtcc
bun install
bun run build      # 产出 ./cli
./wtcc-zh.sh       # 中文模式启动
```

### 验证安装

```bash
wtcc --help
wtcc --version
```

看到帮助文本即安装成功。如果 `command not found`，确认 `npm bin -g` 或 `~/.bun/bin` 在 `PATH` 里。

---

## 🔐 Setup auth / 鉴权配置

wtcc 支持三种鉴权路径，按优先级从高到低：

### 1. Anthropic 官方 OAuth（A 社订阅用户）

```bash
wtcc /login
```

走浏览器 OAuth 流程，登录你的 Anthropic Max / Pro 账户，token 自动存到 `~/.claude/`。

### 2. Relay key（推荐给中国大陆开发者）

如果你用 [convertmodel.net](https://convertmodel.net) 这类 OpenAI 协议 relay：

```bash
export WTCC_RELAY_KEY="sk-relay-xxxxxxxx"
./wtcc-zh.sh                # 自动设置 OPENAI_BASE_URL + 中文模式
```

或手动设置：

```bash
export FREE_CODE_MULTI_PROVIDER_NORMALIZED=1
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL="https://convertmodel.net"
export OPENAI_API_KEY="sk-relay-xxxxxxxx"
wtcc --model gpt-5.5
```

### 3. 切回原生 Anthropic（自备 API key）

```bash
unset CLAUDE_CODE_USE_OPENAI
unset OPENAI_BASE_URL
export ANTHROPIC_API_KEY="sk-ant-xxxxxxxx"
wtcc --model claude-opus-4-7
```

> Tip：在 REPL 里随时输入 `/diagnose-relay` 可以打印当前 env flag + relay 可达性，4xx/5xx 时第一时间排查。

---

## 🎮 Slash commands / 斜杠命令

| 命令 | 作用 |
|---|---|
| `/model` | 动态 model 菜单，按 vendor 分组 |
| `/effort low\|medium\|high\|max` | 设置 reasoning effort（per-model schema 过滤） |
| `/why-this-model` | 解释最近一次路由决策的原因 |
| `/curry` | wtcc 专属助手（locale-aware） |
| `/diagnose-relay` | 打印 relay 配置 + 连通性诊断 |
| `/update` | 只读检查 npm 上是否有新版 wtcc |
| `/cost` | 当前 session 的 token 成本明细 |
| `/login` | OAuth 流程（Anthropic / OpenAI） |
| `/version` | 当前构建版本 |
| `/help` | 完整命令列表 |

> `/upgrade` 是 **Anthropic Max plan 升级流程**，会打开 claude.ai —— 它 **不** 升级 wtcc 本身。升级 wtcc 用 `/update` 检查 + `npm i -g @unstoppablecurry/wtcc`。

---

## 🌍 Environment variables / 环境变量参考

| 变量名 | 作用 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key（默认 provider） |
| `ANTHROPIC_AUTH_TOKEN` | 备选 auth token |
| `ANTHROPIC_BASE_URL` | 覆盖 Anthropic 端点（接 relay 时用） |
| `ANTHROPIC_MODEL` | 覆盖默认 model |
| `OPENAI_API_KEY` | OpenAI key 或 relay key |
| `OPENAI_BASE_URL` | 覆盖 OpenAI 端点 |
| `CLAUDE_CODE_USE_OPENAI=1` | 强制走 OpenAI 协议路径 |
| `FREE_CODE_MULTI_PROVIDER_NORMALIZED=1` | 启用 normalised 多 provider 路由 |
| `FREE_CODE_LANG` | UI 语言：`zh-CN` / `en-US`（默认读 `LANG`） |
| `WTCC_RELAY_KEY` | Relay 凭据（`wtcc-zh.sh` 读取，回退到 `FREE_CODE_RELAY_KEY` → `OPENAI_API_KEY`） |
| `WTCC_OPENAI_FAST=1` | 提示 Codex 协议请求使用 `service_tier: "fast"` |
| `CLAUDE_CODE_EFFORT_LEVEL` | 默认 effort 档位（`low\|medium\|high\|max`） |
| `DISABLE_AUTOUPDATER=1` | 关闭上游 Claude Code 自带的 auto-updater |

> `FREE_CODE_*` 前缀是历史 namespace，向后兼容保留。

---

## 🆚 Differences vs Claude Code / 与官方 Claude Code 的差异

| 维度 | 官方 Claude Code | **wtcc** |
|---|---|---|
| Provider | 仅 Anthropic | **多 provider，OpenAI 协议优先** |
| 语言 | 英文 | **中英双语** |
| Model 菜单 | 写死在源码 | **runtime registry 动态生成** |
| `/effort` | 固定 schema | **per-model schema**（含 opus-4-7 专属 `xhigh`）|
| Telemetry | OTel + GrowthBook | **已全部剥离** |
| 源码 | 闭源（仅 source map 泄漏可窥探） | **完整开源 TypeScript** |
| 自更新 | Anthropic 自家发版渠道 | **`/update` 走 npm registry** |
| 中文化深度 | 无 | **~378 个 i18n key，permissions 对话框 / `/effort` UI / 错误消息全中文** |

---

## 🛠️ Build from source / 从源码构建

```bash
git clone https://github.com/UnstoppableCurry/wtcc.git
cd wtcc
bun install
bun run build           # 产出 ./cli
./cli                   # 直接跑
```

构建变体：

| 命令 | 输出 | 用途 |
|---|---|---|
| `bun run build` | `./cli` | 生产构建 |
| `bun run build:dev` | `./cli-dev` | 开发版，带 dev 时间戳 |
| `bun run build:dev:full` | `./cli-dev` | 打开所有实验 feature flag |

---

## 🗺️ Roadmap & Contributing

- 路线图：见 [TODO.md](./TODO.md)
- 贡献指南：见 [CONTRIBUTING.md](./CONTRIBUTING.md)（包含 i18n 翻译规则、PR 约定、dev 环境搭建）
- Issue / PR：[github.com/UnstoppableCurry/wtcc](https://github.com/UnstoppableCurry/wtcc)

欢迎 self-hosted Claude Code 场景下的实战反馈：哪个 relay 不能用、哪个 model 路由错了、哪段中文翻得别扭，都开 issue。

---

## 📜 License

ISC. 上游 Claude Code 源码版权属于 Anthropic；本 fork 只使用通过 npm 公开分发的代码。请自行评估使用风险。

---

## English summary

`wtcc` is an **enhanced open-source build of Claude Code** with native Chinese support and multi-provider routing. Built on the publicly inspectable Claude Code source. It adds:

- Native Chinese (zh-CN) localisation across UI, slash commands, and errors
- A multi-provider AI CLI layer that lets one binary talk to Anthropic, OpenAI, and any OpenAI-compatible relay
- A self-healing OpenAI adapter (orphan tool_calls, parallel tool_calls, real token usage)
- Dynamic `/model` menu and per-model `/effort` schemas

Install with `npm install -g @unstoppablecurry/wtcc` (requires Bun ≥ 1.3 on PATH). For self-hosted Claude Code workflows behind an OpenAI-protocol relay, set `WTCC_RELAY_KEY` and run `./wtcc-zh.sh`. Full docs above in Chinese; commands and env vars are language-agnostic.

PRs welcome at [github.com/UnstoppableCurry/wtcc](https://github.com/UnstoppableCurry/wtcc).
