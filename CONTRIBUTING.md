# Contributing to wtcc

感谢愿意贡献。本项目是 [paoloanzn/free-code](https://github.com/paoloanzn/free-code) 的中文化 + 多 provider fork，核心约束是：**中文化质量是产品的一部分，不只是翻译**。

---

## 1. Dev environment / 开发环境搭建

### 前置

- Bun ≥ 1.3.11（`curl -fsSL https://bun.sh/install | bash`）
- Node ≥ 20（npm shim 与一些工具链需要）
- macOS / Linux / WSL2（原生 Windows 未测试）

### 克隆 + 安装

```bash
git clone https://github.com/UnstoppableCurry/wtcc.git
cd free-code
bun install
```

### 跑起来

```bash
# 开发模式（直接跑 TypeScript 源码，无需构建）
bun run dev

# 中文模式（推荐日常调试用）
./wtcc-zh.sh

# 构建生产 binary
bun run build      # 产出 ./cli

# 构建带所有实验 feature flag 的 dev 版
bun run build:dev:full   # 产出 ./cli-dev
```

环境变量参考主 README，最低限度需要 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY` 之一。

---

## 2. Tests / 测试

```bash
bun test tests/         # 跑全量测试
bun test --watch tests/ # watch 模式
```

PR 必须通过现有测试。新功能要补对应的测试用例（放在 `tests/` 下）。

---

## 3. Branch & PR conventions / 分支与 PR 约定

### 分支命名

- `feat/<short-name>` —— 新 feature
- `fix/<short-name>` —— bug fix
- `i18n/<locale>-<scope>` —— 翻译相关，如 `i18n/zh-cn-commands`
- `chore/<scope>` —— 构建、依赖、文档

### Commit message

约定式（Conventional Commits）：

```
feat(i18n): translate /model menu vendor labels
fix(adapter): handle orphan tool_calls in streaming mode
chore(deps): bump @anthropic-ai/sdk to 0.81.0
docs: clarify WTCC_RELAY_KEY fallback chain
```

### PR 要求

1. PR 标题与 commit message 同样使用约定式格式
2. PR 描述里说清楚：**改了什么 / 为什么 / 怎么验证**
3. 如果改动涉及 i18n，附上中英对照的 before/after
4. 如果改动涉及 adapter / 协议层，必须有抓包或 log 证据
5. 不要在 PR 里夹带格式化（formatting-only）改动 —— 单开 PR

---

## 4. i18n translation rules / 中文翻译规则（核心约束）

这是 **中文化项目** 的灵魂规则，破坏这些规则的 PR 会被直接退回。

### 4.1 保留英文的技术词

以下词汇 **永远保留英文，不要翻译**：

- 模型与协议：`token` / `model` / `prompt` / `agent` / `MCP` / `API` / `tool_call` / `streaming`
- 工程概念：`hook` / `plugin` / `commit` / `branch` / `PR` / `diff` / `lint`
- 产品名：`Claude` / `Claude Code` / `Anthropic` / `OpenAI` / `GPT` / `Bun` / `Node` / `npm`
- CLI 标识：`/model` / `/effort` / `--flag` 这类原样保留
- 文件名 / 路径 / env 变量：完全不翻译

> 反例（错）：`token` 翻成 "令牌"、`prompt` 翻成 "提示词"、`agent` 翻成 "智能体"。读起来像机翻八股，用户反而看不懂。

### 4.2 信达雅，不要直译

直译往往不通顺，要按中文表达习惯改写。

- 错（直译）：`Failed to load configuration` → "失败加载配置"
- 对（达）：`Failed to load configuration` → "配置加载失败"
- 错（直译）：`Are you sure you want to continue?` → "你是确定你想要继续吗？"
- 对（雅）：`Are you sure you want to continue?` → "确认继续？"

### 4.3 标点

- 中文文案用 **中文标点**：，。：；？！「」（）
- 中英文混排时，英文与中文之间留 **半角空格**：`使用 token 数量` 而非 `使用token数量`
- 但 **不要** 在英文与英文标点之间加空格：`bun run build。` 而非 `bun run build 。`

### 4.4 一致性

新加的中文文案要：

1. 先 grep `src/i18n/locales/zh-CN.json` 看有没有现成翻译
2. 沿用现有翻译惯例（例如 "model" 一律不翻；"session" 一律译为 "会话"）
3. 不一致要先在 issue 讨论，再统一改

### 4.5 Locale 文件位置

- 中文：`src/i18n/locales/zh-CN.json`
- 英文：`src/i18n/locales/en-US.json`
- 加新 key 必须 **同时** 加两个文件，不允许只加一个

---

## 5. Code style / 代码风格

- TypeScript strict 模式；不要 `any`，必要时用 `unknown` + narrowing
- React 组件用 Ink，避免引入额外的 React 渲染器
- 新依赖必须先在 issue 讨论 —— 这是 CLI，bundle 大小敏感
- 不要引入 telemetry / 上报 / 后台请求逻辑（项目政策：零 telemetry）

---

## 6. Reporting bugs / 提 issue

issue 模板（建议）：

```
**环境**
- wtcc version：（`wtcc --version` 输出）
- Bun version：
- OS：
- provider：Anthropic / OpenAI / relay (URL)

**复现步骤**
1.
2.
3.

**期望行为**

**实际行为**

**日志**
（贴 `/diagnose-relay` 输出 + 相关 stderr）
```

---

## 7. Security

发现安全问题 **不要** 提公开 issue。直接邮件作者（GitHub profile 上的联系方式），或在 GitHub 私下走 Security Advisory。

---

谢谢贡献。中文化的 Claude Code 生态需要更多人参与。
