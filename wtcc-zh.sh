#!/usr/bin/env bash
# 启动中文版 wtcc，使用 convertmodel.net 中转的 OpenAI 协议路径。
#
# 用法：
#   ./wtcc-zh.sh                       # 进入交互式 REPL（中文界面）
#   ./wtcc-zh.sh -p "你的问题"         # 单次提问、答完即退
#   ./wtcc-zh.sh --bare -p "你的问题"  # 同上，但去掉所有装饰（输出稳定）
#
# 凭证读取顺序：WTCC_RELAY_KEY → FREE_CODE_RELAY_KEY → 已存在的 OPENAI_API_KEY。
# 想切回英文：FREE_CODE_LANG=en-US ./wtcc-zh.sh
# 想用 Anthropic 协议路径（默认走中转）：unset FREE_CODE_MULTI_PROVIDER_NORMALIZED CLAUDE_CODE_USE_OPENAI

set -euo pipefail

cd "$(dirname "$0")"

# ---- 兜底把 ~/.bun/bin 拉进 PATH（非交互 ssh / cron 等场景不会 source rc）----
[ -x "$HOME/.bun/bin/bun" ] && export PATH="$HOME/.bun/bin:$PATH"

# ---- 中转服务（convertmodel.net）凭证（从环境变量读，绝不硬编码）----
# fallback 顺序：WTCC_RELAY_KEY → FREE_CODE_RELAY_KEY → OPENAI_API_KEY → ANTHROPIC_AUTH_TOKEN
# 最后一档是为 VM 默认 env（/etc/profile.d/claude-code.sh 只导 ANTHROPIC_AUTH_TOKEN）准备的。
RELAY_KEY="${WTCC_RELAY_KEY:-${FREE_CODE_RELAY_KEY:-${OPENAI_API_KEY:-${ANTHROPIC_AUTH_TOKEN:-}}}}"
if [[ -z "$RELAY_KEY" ]]; then
  echo "错误：请先设置 WTCC_RELAY_KEY 或 ANTHROPIC_AUTH_TOKEN（中转服务凭证）。" >&2
  echo "示例： export WTCC_RELAY_KEY=\"sk-...\"" >&2
  exit 1
fi

# ---- OpenAI 协议路径（feature flag 开启 + 走中转）----
export FREE_CODE_MULTI_PROVIDER_NORMALIZED=1
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://convertmodel.net}"
export OPENAI_API_KEY="$RELAY_KEY"

# ---- Anthropic 协议路径（fallback 用）----
# 只设 ANTHROPIC_AUTH_TOKEN（中转用 Bearer）。同时设 API_KEY 会触发上游
# "Auth conflict" 警告。如果用户走 first-party Anthropic 才需 API_KEY。
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://convertmodel.net/anthropic}"
export ANTHROPIC_AUTH_TOKEN="$RELAY_KEY"
unset ANTHROPIC_API_KEY 2>/dev/null || true

# ---- 默认中文界面（可被 caller 覆盖）----
export FREE_CODE_LANG="${FREE_CODE_LANG:-zh-CN}"

# ---- 启动 banner ----
{
  echo "─── wtcc launcher ────────────────────────────────"
  echo "  locale:           $FREE_CODE_LANG"
  echo "  provider 路径:    OpenAI 协议（feature flag 已开）"
  echo "  OpenAI    relay:  $OPENAI_BASE_URL"
  echo "  Anthropic relay:  $ANTHROPIC_BASE_URL"
  echo "  key (前 16 位):   ${RELAY_KEY:0:16}…"
  echo "──────────────────────────────────────────────────"
} >&2

# 用 bun 直接跑 TS 源码（开发时）。打包后用户应该直接执行 ./cli。
exec bun run ./src/entrypoints/cli.tsx --dangerously-skip-permissions "$@"
