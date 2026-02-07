# Claude GLM Proxy

Claude Code のモデルスロットを GLM（Z.ai 経由）に差し替えるローカルプロキシサーバーです。

## Special Thanks

このプロジェクトは [Zenn 記事](https://zenn.dev/azumag/articles/d9d0fbd8872342) を参考にしています。元記事ではプロキシサーバーの基本的なアイデアと実装方法が詳しく解説されています。このプロジェクトでは、そのアイデアをベースに独自の改善を加えて実運用しています。

## 独自調整点

元記事からの主な変更点：

- **Bun ランタイム使用**: Node.js より高速で軽量
- **fetch API による簡素化**: Node.js 18+ の組み込み fetch API を使用
- **graceful shutdown の実装**: SIGTERM/SIGINT で正常終了
- **127.0.0.1 へのバインド**: セキュリティ強化（localhost のみでリッスン）
- **エラーレスポンスの改善**: 内部情報の漏洩を防止
- **Z.ai API 対応**: GLM-4.7 などのモデルを使用

## インストール

```bash
# リポジトリをクローン
git clone https://github.com/shoei05/claude-glm-proxy.git
cd claude-glm-proxy

# 依存関係をインストール
bun install
```

## 設定

`.env.example` をコピーして `.env` を作成し、Z.ai API Key を設定してください。

```bash
cp .env.example .env
```

`.env` ファイルを編集：

```bash
# Z.ai API Key (https://z.ai から取得)
ZAI_API_KEY=your_actual_zai_api_key_here
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

## モデルの選択方法

Claude Code 起動後に使用するモデルを切り替えるには、`/model` コマンドを使用します：

- `/model` - モデル選択メニューを表示
- `/model haiku` - Haiku スロット（GLM-4.7）を使用
- `/model sonnet` - Sonnet スロットを使用
- `/model opus` - Opus スロットを使用

`~/.zshrc` で `ANTHROPIC_DEFAULT_HAIKU_MODEL="glm-4.7"` を設定している場合、デフォルトで GLM-4.7 が使用されます。

## エージェントチームの使い方

エージェントチーム機能の詳細は `~/.claude/CLAUDE.md` を参照してください。

## ライセンス

MIT
