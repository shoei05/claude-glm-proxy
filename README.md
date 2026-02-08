# Claude GLM Proxy (Claude Code Router)

Claude Code の `ANTHROPIC_BASE_URL` をローカルプロキシに向け、**リクエスト本文の `model` で上流APIを振り分ける**プロキシです。

- Haiku 相当スロット: `glm-*` に差し替えて **Z.ai (GLM)** へ
- Opus / Sonnet: `claude-*` のまま **Anthropic 公式API** へ

```text
Claude Code
  └─> http://127.0.0.1:8787 (this proxy)
       ├─ model=glm-*        -> Z.ai (x-api-key)
       └─ model=claude-*     -> Anthropic (authorization passthrough or x-api-key)
```

> [!NOTE]
> アイデアは「Claude Code の `ANTHROPIC_BASE_URL` をプロキシに向け、モデル名でルーティングする」方式の調査記事/ノートに近いです。
> このリポジトリは、そこに実運用で必要だった調整（認証ヘッダー衝突回避、圧縮レスポンス回避、常駐化テンプレ）まで含めています。

## 何が嬉しいか（目的）

`ANTHROPIC_BASE_URL` をそのまま Z.ai に向けると、**Opus/Sonnet まで全部 Z.ai 側**になってしまい「Opusは公式、HaikuだけGLM」のような使い分けができません。

このプロキシを挟むと、次の運用が可能になります。

- Opus/Sonnet: Anthropic 公式（品質重視）
- Haiku 相当: GLM（コスト重視）

Agent Team と組み合わせると「親（自分）は Opus、子エージェントは GLM」みたいな構成も作れます。

## 仕組み（重要ポイント）

1. ルーティング

- リクエスト本文の `model` を見て振り分けます。
  - `model` が `glm` で始まる: Z.ai
  - それ以外: Anthropic

2. 認証ヘッダーの扱い

- **Z.ai 宛て**:
  - Claude Code が付ける `authorization: Bearer ...` は転送しません
  - `x-api-key: ZAI_API_KEY` に差し替えます
- **Anthropic 宛て**:
  - `ANTHROPIC_API_KEY=sk-ant-...` が設定されていれば、それを `x-api-key` として固定で使い、`authorization` は捨てます
  - 未設定なら `authorization` をそのまま中継します

3. 圧縮レスポンスの回避

上流が gzip/br を返すと、プロキシ越しでは Claude Code 側でエラーになることがあるため、`accept-encoding: identity` を明示して非圧縮を要求します。

## セットアップ

### 1. インストール

```bash
git clone https://github.com/shoei05/claude-glm-proxy.git
cd claude-glm-proxy
npm install
```

### 2. `.env` を作成

```bash
cp .env.example .env
```

`.env` を編集して必要な値を入れます。

```env
ZAI_API_KEY=YOUR_ZAI_API_KEY
ZAI_UPSTREAM_URL=https://api.z.ai/api/anthropic
ANTHROPIC_UPSTREAM_URL=https://api.anthropic.com
PORT=8787
HOST=127.0.0.1

# 任意: Ubuntu 等で Anthropic への authorization が通らない場合に設定
# ANTHROPIC_API_KEY=sk-ant-....
```

### 3. プロキシ起動

```bash
npm run start
```

### 4. Claude Code 側をプロキシへ向ける

`~/.zshrc` または `~/.bashrc` に追記します。

```bash
export ANTHROPIC_BASE_URL="http://localhost:8787"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="glm-4.7"
```

反映（zsh の例）:

```bash
source ~/.zshrc
```

### 5. 動作確認

ヘルスチェック:

```bash
curl http://localhost:8787/health
```

Claude Code の `/model` で切り替えつつ適当に投げ、プロキシログで確認します。

```text
[xxxx] POST /v1/messages?beta=true model=claude-opus-4-6 -> anthropic
[xxxx] <- 200
[yyyy] POST /v1/messages?beta=true model=glm-4.7 -> zai
[yyyy] <- 200
```

## 常駐化

### macOS (launchd)

`com.claude-glm-proxy.plist` の `YOUR_USERNAME` を自分のユーザー名に置換して `~/Library/LaunchAgents/` に配置します。

```bash
sed -i '' 's/YOUR_USERNAME/your_username/g' com.claude-glm-proxy.plist
mkdir -p logs
cp com.claude-glm-proxy.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.claude-glm-proxy.plist
```

停止:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.claude-glm-proxy.plist
```

### Ubuntu (systemd --user)

`examples/systemd/claude-glm-proxy.service` を `~/.config/systemd/user/` に置いて有効化します。

```bash
mkdir -p ~/.config/systemd/user
cp examples/systemd/claude-glm-proxy.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now claude-glm-proxy
```

## トラブルシュート

### `401 Invalid bearer token` (Anthropic)

Anthropic 宛てに中継される `authorization: Bearer ...` が Anthropic 公式APIで無効な環境では、Opus/Sonnet が 401 になります。

- 対策: `.env` に `ANTHROPIC_API_KEY=sk-ant-...` を入れてください
  - この設定がある場合、プロキシは Anthropic 宛ての `authorization` を捨て、`x-api-key` を固定で付与します

### `401 invalid x-api-key` (Z.ai)

Z.ai 宛ての `ZAI_API_KEY` が未設定/誤りです。

## ライセンス

MIT

