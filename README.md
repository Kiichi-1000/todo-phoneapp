# TodoApp

ワークスペースベースのタスク管理アプリケーション

## 機能

### ワークスペース管理
- 4グリッドモード：4つのエリアにタスクを分類
- 個別モード：ポストイット形式で自由に配置
- ノートモード：テキストメモ

### タスク管理
- ✅ タスクの追加・削除・完了
- 🔄 ドラッグアンドドロップでタスクの並び替え（4グリッドモード）
- 📊 各エリアの進捗率表示
- 📅 期日設定（予定）

### スマートフォン対応
- タッチフレンドリーなUI
- 右端のグリップアイコンを長押しでドラッグ開始
- スムーズなアニメーション

## 技術スタック

- **フレームワーク**: Expo React Native
- **データベース**: Supabase
- **UIコンポーネント**: React Native
- **ドラッグアンドドロップ**: react-native-draggable-flatlist
- **ジェスチャー**: react-native-gesture-handler
- **アニメーション**: react-native-reanimated

## セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. Supabaseマイグレーションの適用

**重要**: データベースの準備が必要です。

1. Supabase Dashboardを開く
2. SQL Editorに移動
3. `supabase_migration_copy.sql` の内容をコピー＆ペースト
4. 実行

または、Supabase CLIを使用：
```bash
supabase db push
```

### 3. 開発サーバーの起動

**重要**: babel.config.js を作成したため、キャッシュクリアが必要です。

```bash
# Metro bundlerのキャッシュをクリア
npx expo start -c
```

初回起動時は必ず `-c` オプションを使用してください。

### 4. アプリの再ビルド（必要な場合）

もし動作しない場合は：
```bash
# node_modulesを削除して再インストール
rm -rf node_modules
npm install

# 再度キャッシュクリアして起動
npx expo start -c
```

## ドラッグアンドドロップ機能の使い方

### 操作方法
1. タスクの右端にある **三本線アイコン（⋮⋮）** を長押し
2. 指を動かしてタスクをドラッグ
3. 希望の位置で指を離す
4. 自動的にデータベースに保存されます

### 視覚的フィードバック
- ドラッグ中：背景が水色に変化
- ドラッグ中：シャドウ効果
- ドラッグ中：グリップアイコンが青色に変化

### 実装詳細
- `order` フィールドでタスクの順序を管理
- リアルタイムでローカル状態を更新（即座に反映）
- バックグラウンドでSupabaseに保存
- エラー時は自動的にリロード

## トラブルシューティング

### ドラッグが動作しない場合

1. **Metro bundlerのキャッシュクリア**
   ```bash
   npx expo start -c
   ```

2. **babel.config.jsの確認**
   プロジェクトルートに `babel.config.js` が存在し、以下の内容が含まれているか確認：
   ```javascript
   plugins: ['react-native-reanimated/plugin']
   ```

3. **完全な再インストール**
   ```bash
   rm -rf node_modules
   npm install
   npx expo start -c
   ```

4. **実機で確認**
   エミュレーターではなく実機で動作確認してください。

### データベースエラーが出る場合

`supabase_migration_copy.sql` を実行してください。

## 開発者向け情報

### 重要な設定ファイル
- `babel.config.js` - Reanimatedプラグインの設定（必須）
- `app/_layout.tsx` - GestureHandlerRootViewの設定
- `supabase_migration_copy.sql` - データベーススキーマ

### ドラッグアンドドロップの実装
- `react-native-draggable-flatlist` を使用
- `ScaleDecorator` で視覚効果
- `onDragEnd` でデータベース更新
- エラー時は `loadWorkspace()` で状態をリセット
