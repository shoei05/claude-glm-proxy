# Claude GLM Proxy

## プロジェクト概要

Claude Code の Haiku スロットを Z.ai の GLM に差し替えるローカルプロキシサーバーです。

```
Claude Code → http://127.0.0.1:8787 (プロキシ) → https://api.z.ai/api/anthropic（Z.ai API）
```

## 技術構成

- **ランタイム**: Bun
- **エントリーポイント**: `proxy.mjs`
- **ポート**: 8787（127.0.0.1 にバインド）

## 環境変数

`~/.zshrc` に以下を設定します：

```bash
export ANTHROPIC_BASE_URL="http://localhost:8787"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="glm-4.7"
```

`.env` ファイルに以下を設定します：

```bash
ZAI_API_KEY=your_actual_zai_api_key_here
```

## 起動方法

```bash
bun run start     # 通常起動
bun run dev       # ウォッチモード（ファイル変更時に自動再起動）
```

## エンドポイント

- `POST /v1/messages` — Anthropic Messages API
- `POST /v1/chat/completions` — Chat Completions API
- `GET /health` — ヘルスチェック

## ルーティングロジック

全リクエストのパス・ヘッダー・ボディをそのまま `https://api.z.ai/api/anthropic` に転送します。モデルの選択・処理は Z.ai API 側で行われます。

## 制約事項

- **ストリーミング非対応**: レスポンスは `response.json()` で一括取得するため、ストリーミングレスポンスは処理できません
- **タイムアウト**: 上流 API への接続は 5 分でタイムアウトします
