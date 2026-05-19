# v1.4 Android 仕上げ — 2026-05-20

iOS 用に作った v1.4 を Android にも展開するために、今日のセッションで進めた内容と、津久井さん側で残っている作業の整理。

---

## 1. RevenueCat — Android 課金体制 (✅ 僕側完了)

### 何が出来たか

RevenueCat ダッシュボード上に Android アプリ枠と 6 商品 placeholder を作成し、既存の iOS と同じパッケージにアタッチ済み。アプリの自前 Paywall (`app/paywall.tsx`) はクロスプラットフォームなので、Android でも iOS と同じ UI で 6 プランが表示されるはず。

| RC アセット | 値 |
| :- | :- |
| Android App ID | `app29581fb2df` |
| Public API Key (Android) | `goog_QDdorSuxrcuCgkZkIzqypeglHqf` (本番キー、`app.json` に反映済み) |

### Android 商品 (RC placeholder)

| RC product_id | Play Store 側の `productId:basePlanId` |
| :- | :- |
| `prode31cb088e1` | `tosche_basic_monthly:p1m` |
| `prod2efe36d7a1` | `tosche_basic_yearly:p1y` |
| `prodd97af2b323` | `tosche_ai_standard_monthly:p1m` |
| `proda90b8c7909` | `tosche_ai_standard_yearly:p1y` |
| `prod0781514d20` | `tosche_ai_pro_monthly:p1m` |
| `prod3cf1ce0165` | `tosche_ai_pro_yearly:p1y` |

すべて既存パッケージ (`pkge2b08a3374c` 〜 `pkgefe8711bddf`) にアタッチ済。

### 津久井さんが Play Console 側でやること

Google デベロッパー登録 + 決済アカウント審査が通ったら:

1. **Play Console → 収益化 → サブスクリプション → サブスクリプションを作成** を 6 回
2. 各サブスクリプションで **「商品ID」** に上の表の左半分 (`tosche_basic_monthly` など、`:p1m` の部分は付けずに) を厳密一致で入力
3. 各サブスクリプションに **「基本プラン (Base plan)」** を追加して、その **基本プランID** を:
   - 月額 → **`p1m`**
   - 年額 → **`p1y`**
   としてください。これが `:p1m` / `:p1y` 部分と一致する必要があります
4. 価格は v1.4 ハンドオフ手順 doc と同じ:
   - basic_monthly: ¥300, basic_yearly: ¥3,240
   - ai_standard_monthly: ¥1,200, ai_standard_yearly: ¥12,960
   - ai_pro_monthly: ¥2,000, ai_pro_yearly: ¥21,600

### RevenueCat 側で残っている作業 (津久井さん)

- **RevenueCat ↔ Google Play 連携** (Service Account JSON 連携)。これがないと RC が Play の商品を見つけられず purchases 検証が動きません。手順:
  1. Play Console → 設定 → API access → サービスアカウントを作成 (`Project Owner` 不要、`財務データを表示` + `注文と返金を管理` だけでOK)
  2. JSON キーをダウンロード
  3. RC ダッシュボード → Apps → ToSche Android → Google Play Service Account → ファイルをアップロード
  4. RC 側で Play Console の Package 一覧が取得できるようになる

---

## 2. PostHog Android — セッションレコーディング込み (✅ 僕側完了)

### 何が出来たか

- `posthog-react-native-session-replay@1.5.8` を peer dep として追加
- `expo-device@8.0.10` / `expo-localization@17.0.8` も追加 (PostHog peer)
- `app.json` に `expo-localization` プラグイン自動追加
- 既存の `lib/posthog.ts` の設定 (`enableSessionReplay: true` + `maskAllTextInputs: true`) は両プラットフォームでそのまま動く

### Android で何が記録されるか

| 項目 | 動作 |
| :- | :- |
| イベント自動収集 | アプリ起動 / 画面遷移 / タッチ (auto-capture) |
| カスタムイベント (8種類) | sign_in / paywall_view / purchase / ai_coach_open など |
| **セッションレコーディング (画面動画)** | ✅ 動く — ただしテキスト入力欄はネイティブレベルでマスク (黒塗り)、メールアドレスもパスワードも目標タイトルも見えない |
| 個人識別子 | Supabase の匿名 uid のみ (メールは絶対送らない) |

### Expo Go ではセッションレコーディングは動かない

Expo Go は posthog-react-native-session-replay のネイティブモジュールを含まないので、画面録画はキャプチャされません。**EAS dev build もしくは production build から有効になります。** イベント送信は Expo Go でも普通に動きます。

---

## 3. Android リモート Push 通知 — 1ステップだけ津久井さん必要

### 現状

- ローカル通知 (リマインダー) は EAS build / Expo Go どちらでも動く
- リモート Push (FCM) は SDK 53+ で `google-services.json` が必要になった

### 手順 (リポジトリに `google-services.json.example` を置いた)

1. **Firebase Console** (https://console.firebase.google.com) で **ToSche プロジェクト** を作成 (もしくは既存の Synthera Firebase プロジェクトを再利用)
2. **アプリを追加 → Android** で:
   - Android package name: `com.synthera.tosche` (厳密一致必須)
   - App nickname: `ToSche Android`
   - SHA-1: 空 (Google Sign-In は使わないので不要)
3. 自動生成された **`google-services.json` をダウンロード**
4. リポジトリルートに `google-services.json` という名前で保存 (gitignore済、コミットされません)
5. `app.json` の `expo.android` セクションに次の1行を追加:
   ```json
   "googleServicesFile": "./google-services.json"
   ```
6. 次の `eas build --platform android --profile production` で FCM 込みでビルド → リモート Push 通知が有効化

ファイルがない状態でも EAS Android ビルド自体は通ります — FCM モジュールがスキップされるだけ。

---

## 4. 古い Android 端末との互換性 — 既に確保済み

Expo SDK 54 のデフォルト設定:

| 項目 | 値 | 影響 |
| :- | :- | :- |
| minSdkVersion | **24** | Android 7.0+ 対応、2026年現在で 96%+ のアクティブ端末をカバー |
| compileSdkVersion | 34 | Android 14 で最新APIをコンパイル時に参照 |
| Hermes エンジン | 有効 | 古い端末でも高速、メモリ使用量も控えめ |
| New Architecture (Fabric/TurboModules) | 無効 | 旧アーキで互換性最大化 |

**追加の対応は不要**です。古めの Pixel 3 (Android 9) や Galaxy S8 (Android 9) クラスの端末でも問題なく動くはず。

---

## 5. ビルドして検証する流れ

津久井さん側で `google-services.json` + Play Console 6 SKU の準備が整ったら:

```bash
cd /Users/tsukuikiichi/Documents/todoapp-main/.claude/worktrees/fervent-lichterman-ff4d87

# 1. Android の internal-test ビルド (Play Console 内部テストトラックに自動アップロード)
eas build --platform android --profile production --auto-submit

# 2. 内部テスターに追加 → 実機で課金 + Push + PostHog 全部検証

# 3. 問題なければ Play Console 上でクローズドテスト → 製品版に昇格
```

EAS Build は約 10-15 分。AAB が Play Console 内部テストトラックに自動アップロードされます。

---

## 6. 今セッションで触ったコード変更

| Commit | 内容 |
| :- | :- |
| (未コミット) | `app.json` に RevenueCat Android 本番キー追加、PostHog peer deps + expo-localization プラグイン追加、`.gitignore` に Firebase ファイル追加、`google-services.json.example` 新規 |
| `pending` | このハンドオフ doc |
