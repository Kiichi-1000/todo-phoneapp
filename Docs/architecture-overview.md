## TodoApp アーキテクチャ概要

### 1. 全体構成

- **クライアント**: Expo + React Native + expo-router
  - 画面構成はタブレイアウト（Workspace / Statistics / Settings / 他）を中心に構成。
- **バックエンド / データベース**: Supabase（PostgreSQL）
  - テーブル例: `workspaces`, `todos`, `user_settings`
  - マイグレーションSQLは `supabase/migrations/*.sql` に配置。
- **通信**: `@supabase/supabase-js` を利用した直接API呼び出し（REST over PostgREST）。

### 2. 主要画面と責務

- `app/(tabs)/workspace.tsx`
  - 日付ベースでワークスペースを切り替えながら、4分割グリッド／ポストイット／ノートの各モードを出し分ける「ホーム」的画面。
  - `user_settings` の `default_workspace_type` に応じて表示モードを決定。
  - Supabaseから `workspaces`, `todos` を取得・更新しつつ、日付スワイプやカレンダー選択を扱う。
- `app/workspace/[id].tsx`
  - 特定ワークスペース（主に4分割グリッド）を集中して編集する詳細画面。
  - `order` カラムを用いたタスクの並び替えロジックを持つ。
- `app/workspace/create.tsx`
  - 新規ワークスペース作成画面。
  - タイトル・日付・ワークスペースタイプを入力して `workspaces` にINSERTする。
- `app/(tabs)/statistics.tsx`
  - `user_settings.default_workspace_type` に基づき、該当タイプのワークスペースに紐づく `todos` を集計し、完了率などの統計情報を表示。

### 3. データフロー（ざっくり）

1. アプリ起動時:
   - `user_settings` を読み込み、存在しなければデフォルトレコードを作成。
2. ホーム/ワークスペース画面表示:
   - `workspaces` テーブルから対象日付のワークスペースを取得し、なければ新規作成。
   - `todos` を `workspace_id` で取得し、タイプに応じてフィルタ（4分割: `grid_area != null` / individual: `grid_area == null`）。
3. ユーザー操作:
   - タスク追加/編集/削除/完了フラグ変更 ⇒ `todos` に対するINSERT/UPDATE/DELETE。
   - エリア名変更 ⇒ `workspaces.area_titles` のUPDATE。
   - 設定変更 ⇒ `user_settings` のUPDATE。

### 4. Docs ディレクトリの役割

- `requirements.md`
  - ビジネス寄りの機能要件・非機能要件・画面一覧・データモデルの要約を記載。
- `ai-collaboration.dcs`
  - 複数AIエージェント間の進捗共有・コミュニケーションルールを定義。
  - 作業ログ（Progress Log）や、どのドキュメントを更新すべきかの指針を提供。
- `architecture-overview.md`（本書）
  - コード構造と責務分担の「入口」として機能。
  - 画面・データフロー・主要テーブルの関係を簡潔に把握するためのドキュメント。

### 5. 今後のアーキテクチャ検討ポイント

- ノートモード追加時のデータモデリング（既存 `workspaces` / `todos` との関係）。
- タスクタグ／優先度／ラベル機能を追加する際のスキーマ設計。
- オフライン対応（キャッシュ＋差分同期）の実装可否と方針。

