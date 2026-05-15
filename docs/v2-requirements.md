# ToSche v2.0 要件定義書

最終更新: 2026-05-07
ステータス: ドラフト（要レビュー・iterative refinement）

---

## 0. 全体方針

v2.0 は **「AI で書く・Pencil で書く・どこでもチェック」** をコンセプトとした大型アップデート。
3つの新機能と、iPad 全面再設計を1本のリリースに含める。

| 機能 | 概要 | 課金 |
|-----|------|------|
| **A. AI エージェント** | 自然文でタスク・予定・ルーティーンを操作 | **完全有料**（トークン制サブスク） |
| **B. iPad UI/UX 全面再設計** | レイアウト適応 + Apple Pencil 統合 | 無料（基本）+ 一部有料 |
| **C. iOS ウィジェット** | ホーム画面/ロック画面からタスク確認・チェック | 無料 |

### 設計原則

1. **既存ユーザー体験を壊さない**: iPhone の基本 UX は維持、iPad だけ専用 UX に分岐
2. **クラウド同期を最優先**: ウィジェット・iPad・iPhone・将来の Web 全部で1つのデータ
3. **オフライン耐性**: ネットワーク不安定時も主要機能（タスク追加・チェック）が動く
4. **段階的ロールアウト**: 1機能ごとに TestFlight でテスト → 安定後に次

---

## 1. AI エージェント機能（有料）

### 1.1 サマリー

ユーザーが自然文でタスク追加・予定登録・ルーティン操作などを行えるチャット型 AI。完全有料化（トークンチャージ方式）。

詳細仕様は別途 [v1-ai-agent-requirements.md](v1-ai-agent-requirements.md) を母艦とし、以下で確定済み事項を再掲。

### 1.2 確定済みの料金プラン

#### 月額プラン

| プラン | 月額（税込） | 月次付与トークン価値 |
|-------|------------|------------------|
| **AI ライト** | **¥1,000** | **¥500分** |
| **AI スタンダード** | **¥2,000** | **¥1,000分** |

#### 海外向け価格（USD）

| プラン | 月額 | 換算 |
|-------|------|-----|
| AI Light | **$10** | ≈ ¥1,500 |
| AI Standard | **$20** | ≈ ¥3,000 |

#### 長期契約（割引）

| プラン | 半年（税込） | 半年割引 | 年間（税込） | 年間割引 |
|-------|------------|---------|------------|---------|
| AI ライト | ¥5,500 | 約8% | ¥10,000 | 約17% |
| AI スタンダード | ¥11,000 | 約8% | ¥20,000 | 約17% |

### 1.3 トークン仕様

- 内部換算レート: **¥150/$ 固定**（四半期見直し）
- 1ターン平均消費: **¥1.5**（claude-haiku-4-5 ベース）
- 表示単位: **円**（「残り 432円分」）
- **未使用分は翌月のみ繰越可能、翌々月初に失効**

### 1.4 試運転期間

- アプリアップデート公開から **2週間は全ユーザーが AI エージェントを無料で試用可能**
- 期間中はトークン残高カウンタを動かさない
- 2週間後に必ず月次/年間どちらかのプランを選ばないと AI エージェントは利用不可

### 1.5 バンドル

- AI ライト/スタンダード契約者には **ワークスペース無制限** が含まれる
- 単独でワークスペース無制限が欲しいユーザー向けに別途 ¥200/月 サブスクや ¥1,000 買い切りも提供（ノートのページ消費仕様参照）

### 1.6 機能スコープ（フェーズ1）

実装する AI ツール（function call）:

| ツール | 用途 |
|-------|-----|
| `list_todos` | タスク一覧取得 |
| `create_todo` | タスク追加 |
| `update_todo` | タスク更新（content / 完了 / リマインダー） |
| `delete_todo` | タスク削除（要確認） |
| `list_schedules` | 予定一覧取得 |
| `create_schedule` | 予定追加 |
| `update_schedule` | 予定更新 |
| `delete_schedule` | 予定削除（要確認） |
| `get_current_context` | 現在時刻・今日のワークスペース情報 |

### 1.7 技術スタック

- **LLM**: Anthropic Claude (`claude-haiku-4-5` 標準)
- **サーバー**: Supabase Edge Function (Deno/TypeScript)
- **ストリーミング**: SSE
- **クライアント**: 新規 `app/(tabs)/ai.tsx`
- **決済**: RevenueCat（モバイル・Stripe Web 連携 v2.1 以降）
- **API キー**: サーバー側（Edge Function 環境変数）でのみ管理

### 1.8 新規 DB テーブル

```sql
-- 購読状態
user_subscriptions (
  user_id uuid,
  status text,                  -- active/trialing/past_due/canceled/expired
  plan text,                    -- ai_light/ai_standard
  billing_cycle text,           -- monthly/half_year/yearly
  current_period_end timestamptz,
  next_grant_at timestamptz,
  revenuecat_user_id text,
  ...
)

-- トークン残高
ai_token_balances (
  user_id uuid UNIQUE,
  current_grant_yen numeric(10,2),
  current_grant_expires_at timestamptz,
  carryover_yen numeric(10,2),
  carryover_expires_at timestamptz,
  total_granted_yen numeric(12,2),
  total_consumed_yen numeric(12,2),
  ...
)

-- トークン取引履歴
ai_token_transactions (
  user_id uuid,
  kind text,                    -- grant/carryover/consume/expire/refund
  amount_yen numeric,
  api_provider text,
  api_model text,
  input_tokens int,
  output_tokens int,
  conversation_id uuid,
  ...
)

-- 試運転期間管理（簡易フラグ）
app_release_promos (
  release_version text PRIMARY KEY,
  promo_starts_at timestamptz,
  promo_ends_at timestamptz
)
```

---

## 2. iPad UI/UX 全面再設計

### 2.1 サマリー

iPad では現状 iPhone レイアウトがそのまま拡大表示されている状態。これを **iPad 専用 UX** に作り変える。Apple Pencil 統合で「**手書き → タスク化**」と「**ノートの自由書き込み**」を実現。

### 2.2 レイアウト方針

#### 既存画面の iPad 対応

| 画面 | iPad 専用レイアウト案 |
|-----|------------------|
| ワークスペース（4分割） | 4分割をそのまま大画面で利用、左にカテゴリ一覧サイドバーを追加 |
| ワークスペース（個別ポストイット） | 自由配置キャンバスを画面いっぱいに、サイドバーで日付ナビ |
| ワークスペース（ノート） | **Apple Pencil 対応の自由ノート**（後述） |
| スケジュール | リストビューと円グラフを **左右 2 ペイン同時表示**（iPhone は切替式のまま） |
| ルーティーン | 左に時間帯選択（朝/日中/夜）、右にチェックリスト |
| 統計 | カードを 2 列または 3 列グリッドで広く表示 |
| 設定 | 左にメニュー、右に詳細（マスター・ディテールパターン） |

#### 共通要素

- **タブバー → 左サイドバー**（iPad 横向き時）
- **ステータスバー**: ダーク/ライト 自動切替（システムに追従）
- **画面分割（Split View / Slide Over）**: ワークスペース + 別アプリで参照しながら作業
- **Stage Manager**: ウィンドウサイズ変更に追従（フレキシブルレイアウト）

#### 切り替え判定

```ts
// 推奨: 横幅768px超 = iPad 想定として2ペイン化
const isWideLayout = useWindowDimensions().width >= 768;
```

### 2.3 Apple Pencil 統合

#### A. 手書きでタスク追加

**ユースケース**: 4分割エリアの「+ タスクを追加」エリアに Apple Pencil で書くと、自動で文字認識されてタスクとして登録される。

**技術選択肢**:

| 方式 | 説明 | 採否 |
|-----|------|-----|
| **iOS 標準 Scribble** | iOS 14+ 標準機能。`TextInput` に直接 Apple Pencil で書くと即文字変換 | **推奨** |
| Vision Framework | Apple の手書き認識API。自前 Canvas で書いた絵を後から認識 | フォールバック |
| Google Cloud Vision API | クラウド送信が必要 → コスト・プライバシー問題 | ✗ |

**実装**: iOS 14+ では React Native `<TextInput>` がデフォルトで Scribble に対応。**ほぼゼロコストで実装可能**。ただし要件として:

- iPad + Apple Pencil 接続時のみ有効（自動検出）
- 入力フィールド長押し or Pencil 接近で発動
- 認識中は専用モード UI（半透明オーバーレイ）

#### B. ノート機能（Apple Pencil 対応）

**ユースケース**: ワークスペースタイプ「ノート」で、自由なキャンバス上に Apple Pencil で書いたり、タスクチェックボックスを配置できる。

**技術選択**:

- **PencilKit (`PKCanvasView`)**: Apple 純正の描画 API。iPad 標準アプリ品質
- React Native ブリッジ: ネイティブモジュールが必要（`react-native-pencilkit` / `expo-modules-core` で自前ラップ）
- 描画データ保存形式: PKDrawing の `data` (Data 型) を Base64 で Supabase に保存
  - ストレージ: workspaces テーブルに `note_drawing_data text`（Base64）または `note_drawings` 別テーブル
  - サイズ目安: 1ページの描画で 50KB 〜 500KB（要圧縮）

**機能**:

| 機能 | 詳細 |
|-----|------|
| 描画 | ペン、鉛筆、マーカー、消しゴム、色変更、線幅変更 |
| Undo/Redo | PencilKit 標準機能 |
| タスク埋め込み | キャンバス上の任意位置にチェックボックス + テキスト配置可 |
| 画像挿入 | カメラ・写真ライブラリから（v2.1 以降） |
| エクスポート | PNG / PDF（v2.1 以降） |
| クラウド同期 | 編集確定時のみ送信（debounce 5秒） |

#### C. その他 Pencil 機能

| 機能 | 採否 | 備考 |
|-----|------|------|
| Hover プレビュー（M2 iPad+） | 検討 | カーソル位置の予測（ハイライト等） |
| Squeeze ジェスチャ（Pro 2nd gen） | 不要 | コア体験ではない |
| Double Tap でツール切替 | 採用 | ペン↔消しゴムの切替 |

### 2.4 1.1 アップデート機能の iPad 反映

iPhone 1.1 で導入された機能で iPad に未反映のもの:

- スケジュール × タスク連動（双方向同期）
- 履歴/タスクから予定追加
- 4分割エリアごとのアクセントカラー設定
- 言語切替（日本語/英語）
- 通知設定の細分化

→ **iPad では同じ機能を画面サイズに最適化したレイアウトで提供**。コードベースは共通化、表示のみ分岐。

### 2.5 開発工数（iPad）

| ブロック | 工数 |
|---------|-----|
| レイアウト適応（全画面） | 5〜7日 |
| サイドバー化 + マスター・ディテール | 2〜3日 |
| Scribble 対応（最小実装） | 1日 |
| PencilKit ノート（基本描画） | 5〜7日 |
| PencilKit ノート（タスク埋め込み） | 3〜4日 |
| ノート同期・保存ロジック | 2〜3日 |
| Stage Manager / Split View 検証 | 1〜2日 |
| 1.1 機能の iPad 適合 | 2〜3日 |
| 結合・実機検証（iPad 各サイズ） | 3〜4日 |
| **合計** | **24〜34日** |

---

## 3. iOS ウィジェット機能

### 3.1 サマリー

iPhone のホーム画面・ロック画面・スタンバイモードから「**今日のタスクを確認・チェックできる**」ウィジェットを提供。

### 3.2 ウィジェット種類

| サイズ | 配置 | 内容 |
|-------|-----|------|
| **Small** | ホーム/ロック画面 | 達成率（◯/◯ 完了） + アプリアイコン |
| **Medium** | ホーム画面 | 今日のタスクリスト 3〜5件 + チェック可能 |
| **Large** | ホーム画面 | タスクリスト 8〜10件 + 円グラフ予定（小） + チェック可能 |
| **Lock screen circular** | ロック画面 | 達成率の円グラフ |
| **Lock screen rectangular** | ロック画面 | 「今日のタスク N 件 / 完了 M 件」 |
| **Live Activity**（v2.1+） | Dynamic Island / ロック画面 | 進行中の予定の残り時間 |

### 3.3 技術スタック

ウィジェットは **完全ネイティブ（Swift + SwiftUI + WidgetKit）** で実装する必要があり、React Native では直接書けない。

#### 採用アプローチ

```
[iOS Widget Extension (Swift)]
  ↓ 読み取り
[App Group + Shared SQLite or UserDefaults]
  ↑ 書き込み
[Expo App (React Native)] ← Supabase 同期
```

- **アプリ側**: 起動時・タスク更新時に App Group の共有ストレージへ「今日のタスク・達成率」をスナップショット書き込み
- **ウィジェット側**: タイムライン更新時にスナップショットを読み、SwiftUI で描画
- **チェック操作**: iOS 17+ の interactive widget API で `App Intent` 経由でアプリにチェック反映 → 共有ストレージ更新 → ウィジェット再描画

#### Expo での実装

- **expo-config-plugin** で Widget Extension を Xcode プロジェクトに自動追加
- Swift コードは別フォルダ（例: `ios/ToScheWidget/`）で管理
- ビルド時に EAS で自動連携
- 既存のサンプル: [bacalao/expo-widget-extension](https://github.com/bacalao/expo-widget-extension) など

#### 制約

- **iOS 17+ 必須**（interactive widget = チェック操作が必要なため）
  - iOS 16 以前は「ウィジェットタップ → アプリ起動 → タスク表示」のフォールバック
- React Native のロジックはウィジェット内で動かない（純 Swift）
- 翻訳・色設定などは共有ストレージに同期する必要

### 3.4 共有ストレージのデータ形式

App Group 内 UserDefaults または共有 SQLite に以下を持つ:

```json
{
  "version": 1,
  "synced_at": "2026-05-07T10:00:00Z",
  "user_id": "...",
  "today_date": "2026-05-07",
  "language": "ja",
  "today_summary": {
    "total": 12,
    "completed": 5,
    "completion_rate": 0.42
  },
  "today_todos": [
    { "id": "...", "content": "...", "is_completed": false, "schedule_start_minutes": 540, "schedule_color": "#E8654A" }
  ],
  "today_schedules": [
    { "id": "...", "title": "...", "start_minutes": 540, "end_minutes": 600, "color": "#E8654A" }
  ]
}
```

### 3.5 更新タイミング

- アプリのフォアグラウンド復帰時
- タスクのチェック/作成/削除時（即座）
- 1時間に1回（バックグラウンドで Supabase から最新を取得 → 共有ストレージ更新）
- ユーザーが「今日」の境界（24時）を跨いだ時

### 3.6 開発工数（ウィジェット）

| ブロック | 工数 |
|---------|-----|
| Widget Extension 基盤（Swift / Expo plugin） | 3〜4日 |
| 共有ストレージ実装（App Group + SQLite または UserDefaults） | 2〜3日 |
| アプリ側からの書き込みロジック | 2日 |
| Small / Medium / Large UI（SwiftUI） | 3〜4日 |
| Lock Screen ウィジェット（iOS 16+） | 2日 |
| Interactive widget（チェック操作 / iOS 17+） | 2〜3日 |
| ローカライズ・テーマ対応 | 1〜2日 |
| 実機検証（iOS 16/17/18 各種） | 2〜3日 |
| **合計** | **17〜23日** |

---

## 4. データモデル・アーキテクチャ全体

### 4.1 新規 DB テーブル一覧（マイグレーション）

```sql
-- 1.7 で詳述
user_subscriptions
ai_token_balances
ai_token_transactions
app_release_promos

-- ノート機能用
note_drawings (
  id uuid PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  drawing_data text NOT NULL,         -- Base64 of PKDrawing
  embedded_todos jsonb,               -- [{x,y,todo_id}, ...] チェックボックス位置
  thumbnail_data text,                -- 軽量サムネ（Widget 表示用）
  created_at timestamptz,
  updated_at timestamptz
)

-- ウィジェット用キャッシュ（クライアント側ハック回避目的、サーバー側にも持つ）
widget_cache (
  user_id uuid PRIMARY KEY,
  today_summary jsonb,
  generated_at timestamptz
)
```

### 4.2 新規 Supabase Edge Function

| 関数名 | 用途 |
|-------|-----|
| `ai-chat` | AI エージェント（SSE ストリーミング） |
| `revenuecat-webhook` | サブスク状態同期 |
| `monthly-token-grant` | トークン月次付与・繰越・失効バッチ（Cron） |
| `widget-snapshot` | ウィジェット用スナップショット生成（オンデマンド） |

### 4.3 認証・権限

すべての RLS ポリシーは引き続き `auth.uid() = user_id`。サブスク状態と試運転期間判定はサーバー側で行い、クライアントから改ざんできないようにする。

### 4.4 React Native 側の構成変更

```
app/
  (tabs)/
    ai.tsx                  ← 新規: AI チャット画面
    workspace.tsx           ← iPad レイアウト分岐追加
    schedule.tsx            ← 同
    routine.tsx             ← 同
  paywall/
    index.tsx               ← 新規: アップグレード画面
    success.tsx             ← 新規: 購入完了
  components/
    ai/
      ChatMessage.tsx       ← 新規
      ToolResultCard.tsx    ← 新規
      TokenBalanceBadge.tsx ← 新規
    ipad/
      Sidebar.tsx           ← 新規
      MasterDetail.tsx      ← 新規
    pencil/
      ScribbleInput.tsx     ← 新規（Scribble 対応 TextInput ラッパ）
      PencilCanvas.tsx      ← 新規（PencilKit ブリッジ）
  lib/
    aiClient.ts             ← 新規: SSE クライアント
    revenueCat.ts           ← 新規: 購読状態管理
    widgetSync.ts           ← 新規: 共有ストレージ同期
ios/
  ToScheWidget/             ← 新規: Widget Extension（Swift）
    ToScheWidget.swift
    Provider.swift
    Views/
```

---

## 5. 開発フェーズ・優先順位

### Phase 1（v2.0 Beta、約 4〜6週間）

順序は**依存関係**で決定。並行可能なブロックは並行で。

| 順 | 作業 | 想定 | 並行 |
|----|------|-----|------|
| 1 | RevenueCat 統合 + サブスク DB | 5日 | - |
| 2 | AI Edge Function 基盤 + 9ツール実装 | 7日 | (3) |
| 3 | iPad レイアウト適応（既存画面） | 5日 | (2) |
| 4 | AI チャット画面 UI + トークン残高表示 | 4日 | (5) |
| 5 | アップグレード画面 + フィーチャーゲート | 4日 | (4) |
| 6 | iPad Apple Pencil（Scribble） | 1日 | (7) |
| 7 | ウィジェット Extension 基盤 | 4日 | (6) |
| 8 | ウィジェット UI（Small/Medium/Large） | 4日 | - |
| 9 | 共有ストレージ + 同期ロジック | 3日 | - |
| 10 | 試運転期間（2週間）の制御実装 | 1日 | - |
| 11 | iPad ノート（PencilKit）基本描画 | 7日 | - |
| 12 | 結合テスト・E2E 検証 | 4日 | - |
| **計** | | **49日** | |

### Phase 2（v2.1、Phase 1 の 2〜4 週間後）

- iPad ノート: タスク埋め込み・画像挿入
- Lock Screen ウィジェット
- Live Activity（実行中の予定タイマー）
- Web 版（Stripe）
- 統計画面の Apple Pencil 注釈機能

### Phase 3（v2.2 以降）

- ルーティーン・予定の AI 操作（ツール拡張）
- 音声入力（Whisper API）
- Mac Catalyst 対応
- ウィジェット小サイズの円グラフ予定

---

## 6. 主要な意思決定事項（要レビュー）

実装着手前に確定が必要な項目を **HIGH / MEDIUM / LOW** に分類:

### HIGH（着手前必須）

1. **AI APIキー調達**: 個人 / 法人（Synthera）契約のどちらを使うか
2. **RevenueCat 採用**: 推奨だが法人アカウント開設が必要 → 開設タイミング
3. **iPad ノート同期形式**: PKDrawing の Base64 (Supabase) / Supabase Storage（バイナリ）どちらか
4. **ウィジェットの最低 iOS バージョン**: iOS 16 (機能限定) / iOS 17 (interactive 完全動作)
5. **試運転期間の管理方法**: 全ユーザー一律日付 / ユーザーごと初回起動から14日

### MEDIUM

6. **無料トライアル併用**: 試運転2週間後に「個別7日トライアル」も提供する / しない
7. **iPad の有料機能**: ノート（Pencil 機能）は AI バンドル / 別有料 / 無料
8. **ウィジェットの表示範囲**: 全ユーザー無料 / AI 契約者限定（"見える化" 機能扱い）
9. **既存 v1.x ユーザーへの周知**: アプリ内お知らせ / メール / プッシュ

### LOW

10. **Live Activity の Dynamic Island 表示時間**: 予定終了後すぐ消える / 5分後に消える
11. **iPad での「タブバー or サイドバー」切替**: 横向きでサイドバー、縦向きでタブバー / 常時サイドバー
12. **ウィジェット用ローカライズ**: アプリ起動時のみ更新 / バックグラウンド更新

---

## 7. リスクと対策

| リスク | 致命度 | 対策 |
|-------|-----|-----|
| AI API コスト暴走 | 高 | トークン残高ハード上限・1日上限・1ターン上限の3層防御（v1 要件で確定済） |
| ウィジェット iOS 17 縛りでカバレッジ低下 | 中 | iOS 16 用は read-only ウィジェット + アプリ起動でチェック |
| PencilKit ブリッジの保守 | 中 | コミュニティライブラリより自前 expo-module で書いた方が中長期安定 |
| RevenueCat 障害 | 中 | アプリ側で `customerInfo` のキャッシュを保持、24時間は猶予で機能利用可 |
| Apple 審査リジェクト（試運転 2週間無料） | 中 | 「促進キャンペーン」として説明、サブスク自動更新の規約は明示 |
| iPad ノートのデータ肥大化 | 中 | 描画は圧縮 + 古いノートはサムネのみ残す自動アーカイブ |
| 既存ユーザーの混乱 | 高 | アプリ内ツアー（初回起動時）+ ヘルプセンター更新 |
| Stage Manager 対応バグ | 低 | iPad レイアウトを `useWindowDimensions` ベースで動的に組む |
| Widget の翻訳ズレ | 低 | アプリ起動時に必ず共有ストレージへ最新言語を書込 |

---

## 8. 受け入れ基準（v2.0 リリース時）

### 機能受け入れ

1. **AI**: 「明日10時から12時までミーティング入れて」で予定が作成され、ワークスペースにも反映される
2. **AI**: 月額 AI ライト購入後、初日に ¥500分のトークンが付与される。500ターン消費で「上限到達」表示
3. **AI**: 試運転期間（2週間）中は全ユーザーが料金プラン未契約でも AI を利用可能
4. **iPad**: ワークスペース横向きで左サイドバー + 右コンテンツの2ペイン表示
5. **iPad**: タスク追加欄に Apple Pencil で書くと自動でテキスト化される
6. **iPad**: ノートタイプワークスペースで Apple Pencil 描画 → クラウド保存 → 別端末で復元
7. **Widget**: ホーム画面 Medium ウィジェットで今日のタスクを3件表示・チェック可能
8. **Widget**: チェック操作後、アプリを開いてもチェック状態が同期されている

### 経済性受け入れ

9. AI ライト ¥1,000（30%手数料）でも粗利 ¥150 以上（最悪ケース）
10. AI スタンダード ¥2,000 で粗利 ¥350 以上
11. ウィジェット稼働コスト: 1ユーザー月次 ¥5 以下（Edge Function 起動コスト）

### 品質受け入れ

12. iPad mini / iPad Air / iPad Pro 11" / 12.9" の全サイズで主要画面がクラッシュなく動作
13. Apple Pencil 接続/切断時もアプリが固まらない
14. ウィジェット更新が iOS 17 で 30秒以内に反映される

---

## 9. 次のステップ（あなたと私で詰める作業）

1. **第6章の HIGH 項目を確定** ← まずここから
2. 各機能の詳細設計（画面遷移・コンポーネント仕様）を**機能ごとに別ドキュメント化**
3. Phase 1 のタスク順序を確定して TodoWrite に落とす
4. 最初のスプリント（5日分）を切る

最初に決めたい質問は:

- **HIGH-1**: AI API キーは個人取得で進めますか？（即時着手可）
- **HIGH-2**: RevenueCat の法人アカウント開設、いつまでに目処を立てられそうですか？
- **HIGH-3**: iPad ノートの描画データは Supabase の **テーブル列に Base64** で持つ vs **Storage にバイナリ**で持つ — どちらが良さそうですか？（前者は実装簡単、後者はサイズ制限なし）
- **HIGH-4**: ウィジェットの **iOS 17 必須にしますか**？（チェック操作対応）または iOS 16 でも動くようにしますか？（ウィジェットタップ → アプリ起動）
- **HIGH-5**: 試運転 2週間は **全ユーザー一律で「アプリリリース日 + 14日」** にしますか？それとも **「ユーザーが初めて AI タブを開いた日 + 14日」** にしますか？

回答が揃ったら、最も影響範囲の大きいブロック（RevenueCat or AI Edge Function）から着手します。
