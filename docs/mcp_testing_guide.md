# MCP連携の実機テスト手順

**目的**: Expo Go + Claude Code CLI で、EASビルド料金を払わずにMCP連携をE2Eテストする。

**検証状況** (2026-05-18):
- ✅ サーバー側 (mcp-server / mcp-keys / DB) は全7パターン curl テスト合格
- ⚠️ アプリ画面 (`claude-integration.tsx`) は実機未テスト ← ここをテスト
- ⚠️ Claude.ai or Claude Code との実接続は未テスト ← ここをテスト

---

## ステップ1: Expo Goでアプリ起動

```bash
cd /Users/tsukuikiichi/Documents/todoapp-main
npm run go
```

(LANモードで起動。出てきたQRをiPhoneのExpo Goアプリでスキャン)

**期待する挙動:**
- アプリが起動する
- ログイン画面 → メール+パスワードでログイン (Apple/Googleもいけますが念のためメール推奨)

**もし起動しない場合:** RevenueCat関連エラーが出ても無視してOK (lazy require + try/catchで握り潰される設計)。AI課金画面だけ動かないだけで他は動く。

---

## ステップ2: アプリ内でAPIキー生成

1. 下タブ「設定」を開く
2. 「AI アシスタント」セクション内の **「Claude 連携」** をタップ
3. 「+ 新しいキーを生成」をタップ
4. ラベル入力 (例: 「Mac Claude Code テスト」) → 「生成する」
5. **`tsche_xxxxxxxx...` のキーが1度だけ表示される** → 「コピー」をタップ

⚠️ このキーは2度と見られません。コピーしておくこと。

---

## ステップ3: Claude Code CLIにMCPサーバーを登録

ターミナルで:

```bash
claude mcp add tosche \
  --transport http \
  --header "Authorization: Bearer tsche_xxxxxxxx..." \
  https://utfyxsvxyvzxjqcgzjjl.supabase.co/functions/v1/mcp-server
```

(`tsche_xxxxxxxx...` を ステップ2でコピーしたキーに置き換える)

確認:
```bash
claude mcp list
# tosche が表示されればOK
```

---

## ステップ4: 動作確認 (Claude Code内で)

Claude Codeを開いて、以下のように話しかけてみる:

> 「ToSche MCPを使って、僕の今月の目標を確認して」

→ Claudeが `tosche__list_goals` を呼んで結果を返すはず。

> 「『毎日30分英語学習』という月間目標を、今月分で追加して」

→ Claudeが `tosche__create_goal` を呼ぶ。
→ ToSche アプリの「目標」タブをリロードすると新規追加された目標が出る。

> 「いま追加した目標に、ロードマップを5ステップで作って」

→ Claudeが `tosche__create_milestones_batch` を呼ぶ。
→ ToScheアプリで目標を開くと5ステップが見える。

---

## ステップ5: claude.ai (Web)でテストする場合 (オプション)

Claude.ai Pro/Team 限定:
1. claude.ai → 設定 → Connectors → Custom Connector追加
2. **Name**: ToSche
3. **MCP Server URL**: `https://utfyxsvxyvzxjqcgzjjl.supabase.co/functions/v1/mcp-server`
4. **Authorization**: `Bearer tsche_xxxxxxxx...`
5. 接続 → 5ツールが見えればOK

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
| :---- | :---- | :---- |
| Expo Go起動時に「Invariant Violation: react-native-purchases」 | iOS Apple Sign In 起動時のRC初期化失敗 | 一度アプリを閉じてもう一度開く (lazy初期化なので2回目以降は握り潰される) |
| 設定画面に「Claude 連携」が出ない | ビルドが古い | Expo Go の右上「Reload」を押して最新コードを再読み込み |
| キー生成で「読み込み失敗」「Authorization required」 | Supabaseセッションが切れた | アプリで一度ログアウト→ログイン |
| Claude Codeで「Unauthorized」 | キーをコピーミス or 既にrevoke済み | アプリでキーを再生成して登録し直し |
| Claude Codeで「Method not found」 | MCP transportが違う | `--transport http` を付けたか確認 (sse じゃない) |
| Claudeが「list_goals」を見つけられない | ツール名のプレフィックス問題 | `tosche__list_goals` のように mcp名がprefixになる場合あり |

---

## テストできたら教えてください

実機テストで動いたら、Android対応 (Phase 2.5の続き) に進めます。
逆に何かバグや改善点があれば、その場で直してから次に進みます。
