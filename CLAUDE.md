# Claude GLM Proxy

## プロジェクト概要

このプロジェクトは、Anthropic Claude Code の全モデルスロットを GLM（智谱AI）モデルで使用するためのローカルプロキシサーバーを提供します。

ローカルプロキシサーバー（`http://localhost:8787`）を立てることで、Claude Code からの API リクエストを GLM API に転送し、Haiku/Sonnet/Opus すべてのスロットで GLM-4.7 を使用できるようにします。

## 環境設定

`~/.zshrc` に以下の設定を追加してください：

```bash
# Claude Code - Proxy to use GLM for all model slots
export ANTHROPIC_BASE_URL="http://localhost:8787"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="glm-4.7"
```

この設定により：
- Claude Code の全 API リクエストが `localhost:8787` に送られる
- Haiku スロットに GLM-4.7 が使用される

## プロキシサーバーの起動

プロキシサーバーを起動するには：

```bash
# サーバーを起動（適切なポートでリッスン）
bun run server.ts
```

または、background で実行：

```bash
bun run server.ts &
```

## エージェントチームの作成

Claude Code のエージェントチーム機能を使用する場合、`Task` ツールと `TeamCreate` ツールを使用します：

1. **チームを作成**：
   ```python
   TeamCreate(
       team_name="team-name",
       description="チームの説明"
   )
   ```

2. **エージェントを追加**：
   ```python
   Task(
       subagent_type="general-purpose",
       model="haiku",  # または "opus"
       name="agent-name",
       team_name="team-name",
       prompt="エージェントへの具体的な指示..."
   )
   ```

3. **エージェントにメッセージを送信**：
   ```python
   SendMessage(
       recipient="agent-name",
       type="message",
       summary="要約",
       content="詳細な指示..."
   )
   ```

## `claude-glm` コマンドについて

以前は直接 Z.ai の API を使用する `claude-glm` エイリアスを使用していましたが、現在はローカルプロキシ方式に移行したため、このコマンドは実質使用していません。

一応残していますが、推奨される使い方はプロキシサーバー経由の方法です。

## アーキテクチャ

```
Claude Code → localhost:8787 (プロキシ) → GLM API
```

プロキシサーバーは：
- Anthropic API 互換のエンドポイントを提供
- 受信リクエストを GLM API 形式に変換
- レスポンスを Anthropic 形式に変換して返却
