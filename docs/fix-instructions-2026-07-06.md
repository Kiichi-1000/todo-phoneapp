# ToSche 修正指示書（Claude Code 実装用）2026-07-06

オーナー指示（2026-07-05）に基づく修正2点。事前コード調査済み。該当ファイル・行番号・データモデルの現状を本書に記載してあるので、そのまま実装に入れる。

**実装セッション開始時に必ず**: `touch /Users/tsukuikiichi/AI会社/.manual_session_lock` → 終了時に `rm`（Autopilot衝突防止）。

---

## 修正1: ワークスペースタスクの詳細表示

### 要件
- (a) タスクグリッド長押しメニューに「タスクの詳細を表示」ボタンを追加する。
- (b) グリッド上の簡潔な表示（content）に対し、より詳細な説明を追加・確認できるようにする。

### 現状（調査済み）
- 長押しメニュー: `components/DraggableTodoItem.tsx` 行277-317。`Pressable` の `delayLongPress={400}`（行215-216）→ `Modal` で座標指定のフローティングメニュー表示。
- 現在の選択肢（行288-314）: ①タスクを編集（Pencil, #3498db, `onStartEdit`）②スケジュール設定/変更（CalendarClock, #3b82f6, `onSchedulePress`）③削除（Trash2, #e74c3c, `onDelete`）。
- フローティング付箋用の `components/PostitMenu.tsx`（行47-77）にも同系メニューあり。
- **Todo型（`types/database.ts` 行64-87）に詳細フィールドは存在しない。`content` のみ。**

### 実装内容
1. **DBマイグレーション**: `supabase/migrations/` に `todos` テーブルへ `description text DEFAULT NULL` を追加するマイグレーションを新規作成。RLSは既存ポリシーでカバーされる（行単位、user_id）。
2. **型更新**: `types/database.ts` の `Todo` 型に `description: string | null` を追加。
3. **メニュー項目追加**: `DraggableTodoItem.tsx` の長押しメニューに「タスクの詳細を表示」を追加（アイコン例: lucide の `FileText` または `Info`、色は既存トーンに合わせる）。位置は「タスクを編集」の直後を推奨。
4. **詳細表示/編集モーダル**: タップで詳細モーダルを表示。内容: タイトル（content・読み取り専用でよい）＋ 詳細（複数行 TextInput、既存 description を表示・編集可）＋ 保存/閉じる。保存で `supabase.from('todos').update({ description })`。
5. **PostitMenu.tsx** にも同項目を追加（グリッド外付箋との一貫性のため）。
6. **i18n**: 既存の `workspace.editTask` 等と同じ翻訳機構に `workspace.showTaskDetail`（「タスクの詳細を表示」）等のキーを追加。既存の翻訳ファイル構成に従うこと。

### 受け入れ条件
- 長押し→「タスクの詳細を表示」→詳細の閲覧・追記・保存ができる。
- description 未設定タスクでも空欄で開き、保存できる。
- 既存の編集・スケジュール・削除の動作に回帰がない。

---

## 修正2: 円グラフスケジュールの詳細入力とレイアウト修正

### 要件
- (a) 「予定を編集」から予定の詳細を入力できるようにする。グリッド（セグメント）内にスペースがあれば円グラフ内に詳細を表示する。
- (b) 文字が円グラフの外にはみ出す・文字列が不自然になる箇所を修正。文字の配列方式（横/放射）は現状維持のまま、極力グラフ外に出ないように。
- (c) 横長（幅の広い）セグメントは文字列を中央揃えにする。

### 現状（調査済み）
- 円グラフ描画: `components/ScheduleCircleView.tsx`（全681行、SVG: react-native-svg）。
  - 極座標変換 `polarToCartesian()` 行23-29。
  - 横配置 `computeHorizontalLayout`（行70-141）: sweep≥45°。フォント候補 [12..6]、行数は duration で1〜3行、弦長 `chordAtTarget` に `charsPerLine * charW` が収まるか判定。折り返しは行88-98の固定文字数分割。
  - 放射配置 `computeRadialLayout`（行143-193）: sweep<45°。`textW = len * charW`（charWFactor=0.95）、収まらなければ truncate+「…」（行183-185）。
  - SVGテキスト描画: 行355-416。`textAnchor="middle"` + 黒縁取り(stroke)＋白文字の2層描画。
- 予定編集モーダル: `components/ScheduleItemEditor.tsx`（全615行）。タイトル・時刻ホイール・色・履歴・タスク連携・保存(行241-253)。
- **Schedule型（`types/database.ts` 行50-62）・`schedules` テーブル（`supabase/migrations/20260318195613_create_schedules_table.sql`）に詳細フィールドは存在しない。`title` のみ。**
- 保存API: `app/(tabs)/schedule.tsx` 行299-354（insert/update）。

### 実装内容

#### (a) 予定の詳細入力＋セグメント内表示
1. **DBマイグレーション**: `schedules` に `description text DEFAULT NULL` を追加。
2. **型更新**: `Schedule` 型に `description: string | null` を追加。
3. **ScheduleItemEditor.tsx**: タイトル入力の下に「詳細（任意）」の複数行 TextInput を追加。`onSave` のペイロードに `description` を含める。
4. **schedule.tsx**: insert/update（行312-334）に `description` を追加。
5. **セグメント内表示**: `ScheduleCircleView.tsx` の横配置モードで、タイトル＋所要時間表示の下に**スペースが余っている場合のみ** description を小さいフォント（タイトルより2pt程度小さく、最小6pt）で1〜2行表示。弦長判定は既存の `chordAtTarget` 方式を流用し、収まらない分は「…」で切る。放射配置モード（細いセグメント）では表示しない。

#### (b) はみ出し・不自然な文字列の修正
既知の問題箇所（調査で特定済み）:
1. **弦長の過大評価**: 判定はセグメント中心半径 `targetCenterRadius` の弦で行うが、テキストブロックの上端/下端では弦がより短い。判定を「ブロック上端・下端のうち短い方の弦」で行うよう修正（各行のY位置での実際の弦長 `2 * sqrt(r_outer² - d²)` ベースの判定が理想）。
2. **charW の日本語過小評価**: `charWFactor` が全角文字で実測より小さく、はみ出しの主因。全角/半角を判別して幅を計算する（例: `[^\x01-\x7E]` は 1.0 * fontSize、半角は 0.55 * fontSize）。既存 charWFactor 定数の一律適用をやめる。
3. **固定文字数折り返しの不自然さ**（行88-98）: `(業務委託・外出)` の途中で切れる等。改善: 括弧・中黒・スペース等の区切り文字を優先して折り返す簡易ワードラップに変更（区切りが近くにあればそこで切る、なければ従来通り文字数で切る）。
4. **放射配置の外端チェック**: `textOuterEdge <= outerR` 判定にマージン（4px程度）を追加し、縁ギリギリの描画を防ぐ。
- 配置方式そのもの（横/放射の切替、フォント候補の段階縮小）は**変更しない**こと。

#### (c) 横長セグメントの中央揃え
- 現状 `textAnchor="middle"` で各行は中央揃えだが、折り返しが固定文字数のため最終行だけ極端に短い・行のX中心がセグメント中心とずれて見えるケースがある。
- 修正: 横配置モードで (1) 行分割を均等配分に（例: 11文字を2行なら 6/5 で分割）、(2) テキストブロックのX座標をセグメントの角度的中心（midAngle方向の中心半径位置）に正確に配置する。行355-416の `x={cx}` が固定になっている場合は `midAngle` ベースの中心座標に修正。

### 受け入れ条件
- 「予定を編集」で詳細を入力・保存でき、広いセグメントでは円グラフ内に詳細が表示される。
- 7/6〜7/19の実データ（「テレアポ(業務委託・外出)」「SYNTHERA会議•開発」「大学（オンライン）」等の長いタイトル）で、文字がグラフ外にはみ出さない。
- 横長セグメントの文字列が視覚的に中央に揃う。
- 細いセグメント（30分予定等）の表示が現状から劣化しない。

---

## 共通の注意
- ビルドは iOS のみ（EAS回数節約方針）。Android対応は不要。
- マイグレーションは `supabase/migrations/` の既存命名規則に従う。
- 完了後: シミュレータで 2026-07-06〜07-19 の実スケジュールを表示して目視確認 → スクリーンショットを残す。
- コミットは修正1・修正2を分けること。
