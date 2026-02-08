# Claude GLM Proxy (Claude Code Router)

Claude Code の `ANTHROPIC_BASE_URL` をローカルプロキシへ向け、**モデル名で上流APIを振り分ける**プロキシです。

- `model=glm-*` だけを Z.ai (GLM) に転送（`x-api-key`）
- それ以外（Opus/Sonnetなど）は Anthropic 公式APIに転送（`authorization` 中継、または `x-api-key` 固定）

## ランタイム

- Node.js (>= 18)
- エントリーポイント: `proxy.mjs`

## 環境変数

Claude Code 側:

```bash
export ANTHROPIC_BASE_URL="http://localhost:8787"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="glm-4.7"
```

プロキシ側（`.env`）:

```env
ZAI_UPSTREAM_URL=https://api.z.ai/api/anthropic
ANTHROPIC_UPSTREAM_URL=https://api.anthropic.com
ZAI_API_KEY=YOUR_ZAI_API_KEY

# 任意: `401 Invalid bearer token` が出る環境向け
# ANTHROPIC_API_KEY=sk-ant-...
```

## 起動

```bash
npm run start
```

## メモ（Ubuntuで詰まりやすい点）

- Anthropic 公式APIに対して `authorization: Bearer ...` が通らない環境があります（`Invalid bearer token`）。
- その場合は `.env` に `ANTHROPIC_API_KEY=sk-ant-...` を設定し、Anthropic 宛ては `x-api-key` で固定してください。
