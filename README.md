# Claude GLM Proxy

Claude Code の Haiku スロットを Z.ai の GLM に差し替えるローカルプロキシサーバーです。

```
Claude Code  ──→  localhost:8787（プロキシ）──→  Z.ai API（GLM-4.7）
```

Claude Code の `ANTHROPIC_BASE_URL` と `ANTHROPIC_DEFAULT_HAIKU_MODEL` を組み合わせることで、Haiku スロットの呼び出しだけをこのプロキシ経由で GLM に転送できます。Opus / Sonnet は引き続き Anthropic API を直接利用します。

> [!NOTE]
> [Zenn 記事（azumag 氏）](https://zenn.dev/azumag/articles/d9d0fbd8872342) のアイデアをベースに、Bun ランタイム・127.0.0.1 バインド・graceful shutdown・ヘルスチェックなどを加えた実装です。

## セットアップ

### 1. インストール

```bash
git clone https://github.com/shoei05/claude-glm-proxy.git
cd claude-glm-proxy
bun install
```

### 2. API Key の設定

```bash
cp .env.example .env
```

`.env` ファイルを編集して Z.ai API Key を設定します。

```bash
# Z.ai API Key (https://z.ai から取得)
ZAI_API_KEY=your_actual_zai_api_key_here
```

### 3. Claude Code の環境変数を設定

`~/.zshrc` に以下を追加します。

```bash
# Claude Code - Haiku スロットのみ GLM を使用
export ANTHROPIC_BASE_URL="http://localhost:8787"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="glm-4.7"
```

設定を反映します。

```bash
source ~/.zshrc
```

### 4. プロキシサーバーを起動

```bash
bun run start
```

`http://127.0.0.1:8787` で起動します。**起動したまま**にしてください（終了は `Ctrl+C`）。

### 5. 動作確認

```bash
curl http://localhost:8787/health
# => {"status":"ok","service":"claude-glm-proxy"}
```

## 常駐化（macOS）

launchd を使って自動起動・自動再起動を設定できます。

```bash
# plist ファイルをユーザー名に合わせて編集（<USER> 部分を置換）
sed -i '' 's/<USER>/your_username/g' com.claude-glm-proxy.plist

# plist を LaunchAgents にコピー
cp com.claude-glm-proxy.plist ~/Library/LaunchAgents/

# サービスを起動
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.claude-glm-proxy.plist

# サービスの状態確認
launchctl print gui/$(id -u)/com.claude-glm-proxy
```

サービスを停止する場合：

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.claude-glm-proxy.plist
```

## エージェントチームとの連携

Claude Code のエージェントチーム機能と組み合わせると、リーダー（自分）は Opus で品質重視、部下のエージェントは GLM でコスト削減、といった使い分けが可能です。

`~/.claude/CLAUDE.md` に「部下には haiku モデルを使うこと」と記載しておけば、エージェントチームが自動的に Haiku スロット（= GLM）を使って作業します。

## ライセンス

MIT
