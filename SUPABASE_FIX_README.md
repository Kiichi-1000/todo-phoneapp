# Supabase スキーマキャッシュ問題の解決方法

## 問題
エラー: `Could not find the 'area_titles' column of 'workspaces' in the schema cache`

これは、SupabaseのAPIスキーマキャッシュが古いままになっているためです。

## 解決方法（3つのステップ）

### ステップ1: スキーマの状態を確認
1. Supabase Dashboard > SQL Editor を開く
2. `supabase_check_status.sql` の内容をコピー＆ペースト
3. 実行して結果を確認
4. `area_titles_status` が `NOT FOUND ❌` の場合は次のステップへ

### ステップ2: カラムを追加してスキーマをリフレッシュ
1. Supabase Dashboard > SQL Editor を開く
2. `supabase_force_refresh.sql` の内容をコピー＆ペースト
3. 実行ボタンをクリック
4. **重要**: 30-60秒待つ

### ステップ3: Supabase APIを手動でリフレッシュ
もし上記で解決しない場合:

#### 方法A: Supabase Dashboard から
1. Supabase Dashboard > Settings > API を開く
2. ページをリロード（F5）
3. "Generate new API key" をクリック（API keyはそのまま使えます）

#### 方法B: Supabase CLI を使う場合
```bash
supabase db reset
```

### ステップ4: アプリを再起動
1. Expoサーバーを停止（Ctrl+C）
2. `npx expo start --clear` で再起動
3. アプリをリロード

## 代替案: 全データベースを再構築
完全にクリーンな状態から始めたい場合：

1. Supabase Dashboard > SQL Editor を開く
2. `supabase_migration_copy.sql` の内容をコピー＆ペースト
3. 実行（すべてのテーブルとデータがリセットされます）

## 確認方法
正常に動作している場合：
- エリア名を編集できる
- エラーログに "Schema cache issue" が出ない
- タスクが正常に保存される

## 困ったときは
- アプリを完全に再起動
- Expoのキャッシュをクリア: `npx expo start --clear`
- SupabaseのAPIスキーマを再生成（Settings > API）

