#!/usr/bin/env bash
# Deprecated shim — run-zh.sh has been renamed to wtcc-zh.sh.
# 此脚本保留只为兼容旧的 shell history。新名字是 wtcc-zh.sh。
echo "[deprecated] run-zh.sh 已改名为 wtcc-zh.sh — 转发执行。" >&2
exec "$(dirname "$0")/wtcc-zh.sh" "$@"
