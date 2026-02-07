# Claude GLM Proxy

Claude Code のモデルスロットを GLM（OpenRouter経由）に差し替えるローカルプロキシサーバーです。

## Special Thanks

このプロジェクトは [Zenn 記事](https://zenn.dev/azumag/articles/d9d0fbd8872342) を参考にしています。元記事ではプロキシサーバーの基本的なアイデアと実装方法が詳しく解説されています。このプロジェクトでは、そのアイデアをベースに独自の改善を加えて実運用しています。

## 独自調整点

元記事からの主な変更点：

- **Bun ランタイム使用**: Node.js より高速で軽量
- **fetch API による簡素化**: Node.js 18+ の組み込み fetch API を使用
- **graceful shutdown の実装**: SIGTERM/SIGINT で正常終了
- **127.0.0.1 へのバインド**: セキュリティ強化（localhost のみでリッスン）
- **エラーレスポンスの改善**: 内部情報の漏洩を防止
- **OpenRouter API 対応**: GLM-4.7 などのモデルを使用

## インストール

```bash
# リポジトリをクローン
git clone https://github.com/shoei05/claude-glm-proxy.git
cd claude-glm-proxy

# 依存関係をインストール
bun install
```

## 設定

`.env.example` をコピーして `.env` を作成し、OpenRouter API Key を設定してください。

```bash
cp .env.example .env
```

`.env` ファイルを編集：

```bash
# OpenRouter API Key (https://openrouter.ai/keys から取得)
OPENROUTER_API_KEY=your_actual_api_key_here
```

## 使い方

### 1. プロキシサーバーを起動

```bash
bun run start
```

サーバーが `http://127.0.0.1:8787` で起動します。

### 2. Claude Code の環境変数を設定

`~/.zshrc` に以下を追加：

```bash
# Claude Code - Proxy to use GLM for all model slots
export ANTHROPIC_BASE_URL="http://localhost:8787"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="glm-4.7"
```

設定を反映：

```bash
source ~/.zshrc
```

これで Claude Code の Haiku スロットが GLM-4.7 を使用するようになります。

### 3. 動作確認

```bash
curl http://localhost:8787/health
```

`{"status":"ok","service":"claude-glm-proxy"}` が返ってくれば正常です。

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

## エージェントチームの建て方

Claude Code のエージェントチーム機能を使う場合：

```python
# 1. チームを作成
TeamCreate(
    team_name="team-name",
    description="チームの説明"
)

# 2. エージェントを起動（haiku モデルを指定）
Task(
    subagent_type="general-purpose",
    model="haiku",
    name="agent-name",
    team_name="team-name",
    prompt="エージェントへの具体的な指示..."
)

# 3. エージェントにメッセージを送信
SendMessage(
    recipient="agent-name",
    type="message",
    summary="要約",
    content="詳細な指示..."
)

# 4. 終了時はシャットダウン
SendMessage(
    recipient="agent-name",
    type="shutdown_request",
    content="タスク完了、セッション終了"
)
```

## claude-glm コマンドについて

以前は直接 Z.ai の API を使用する `claude-glm` エイリアスを使用していましたが、現在はローカルプロキシ方式に移行したため、このコマンドは実質使用していません。

一応 `~/.zshrc` に残していますが、推奨される使い方はプロキシサーバー経由の方法です。

## アーキテクチャ

```
Claude Code → localhost:8787 (プロキシ) → OpenRouter API → GLM-4.7
```

プロキシサーバーは：
- Anthropic API 互換のエンドポイントを提供（`/v1/chat/completions`）
- OpenRouter API にリクエストを転送
- GLM-4.7 などのモデルを使用可能

## ライセンス

MIT
