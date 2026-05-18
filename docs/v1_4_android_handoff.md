# v1.4 Android Launch — 津久井さん タスクリスト

**最終更新**: 2026-05-18
**前提**: コード側 (Claude Code担当) は完了。以下は外部システム操作が必要なため津久井さんしかできないタスク。

---

## 1. Google Play Console (15-30分)

**前提**: Developer アカウント作成済み

1. https://play.google.com/console を開く
2. 「アプリを作成」→
   - アプリ名: **ToSche**
   - 規定の言語: 日本語
   - アプリ or ゲーム: アプリ
   - 無料 or 有料: 無料 (アプリ内サブスク)
3. パッケージ名(後で固定): **`com.synthera.tosche`** ← `app.json` の `android.package` と一致必須
4. 「アプリのコンテンツ」セクションを埋める:
   - プライバシーポリシーURL: `https://todo-phoneapp.pages.dev/legal/tosche/privacy.html` (既存)
   - 広告: なし
   - アクセス権 (RECORD_AUDIO, POST_NOTIFICATIONS): 用途を記入
   - ターゲット層: 13歳以上
   - データセーフティ: 既存iOSの内容を流用

---

## 2. Google Play Store: 6商品の作成 (20分)

「収益化 → アプリ内アイテム → サブスクリプション」で以下を作成:

| 商品ID (厳密に一致) | 名前 | 価格 (¥) | 周期 |
| :---- | :---- | :---- | :---- |
| `tosche_basic_monthly` | ToSche Basic 月額 | 300 | 月額 |
| `tosche_basic_yearly` | ToSche Basic 年額 | 3,240 | 年額 |
| `tosche_ai_standard_monthly` | ToSche AI Standard 月額 | 1,200 | 月額 |
| `tosche_ai_standard_yearly` | ToSche AI Standard 年額 | 12,960 | 年額 |
| `tosche_ai_pro_monthly` | ToSche AI Pro 月額 | 2,000 | 月額 |
| `tosche_ai_pro_yearly` | ToSche AI Pro 年額 | 21,600 | 年額 |

※ 商品IDは `supabase/functions/revenuecat-webhook/index.ts` の `PRODUCT_MAP` と一致しています。**変更すると課金が動かなくなります**。

---

## 3. RevenueCat 設定 (10分)

1. https://app.revenuecat.com で同じプロジェクトを開く
2. **Apps → Add App → Google Play**
3. Package name: `com.synthera.tosche`
4. Google Play Service Account を連携:
   - Play Console → API access → Create service account
   - 役割: 「財務データを表示」「注文と返金を管理」
   - JSONキーをダウンロード → RevenueCat にアップロード
5. RevenueCat の **Public API key (Android)** をコピー
6. `app.json` の `extra.revenuecatApiKeyAndroid` に貼り付け (現在は空文字列)

   ```json
   "revenuecatApiKeyAndroid": "goog_xxxxxxxxxxxxx"
   ```

7. (Production用) `extra.revenuecatApiKeyAndroidProd` も追加するなら同じ手順
8. RevenueCat の **Entitlements / Offerings** で iOS と同じ構成にする
   - Google Play 商品を既存 Entitlement (`ai_pro` / `ai_standard` / `basic`) に紐付け

---

## 4. Webhook 設定 (RevenueCat → Supabase) — 既存設定の確認のみ

iOS 用に設定済みのwebhookがそのままAndroidでも動きます。`event.store` で `PLAY_STORE` が来たら自動的に `platform = 'android'` で記録されます。

確認だけ: RevenueCat → Integrations → Webhooks → URL が
`https://utfyxsvxyvzxjqcgzjjl.supabase.co/functions/v1/revenuecat-webhook`
になっていればOK。

---

## 5. (オプション) Google Sign In OAuth 設定 (15分)

Android では Apple Sign In が動かないため、Google Sign In が主な認証手段です。Supabase OAuth で Google が既に有効ならスキップ可。

確認:
1. Supabase Dashboard → Authentication → Providers → Google が ENABLED
2. OAuth credentials が Google Cloud Console で発行済み
3. Redirect URLs に Android の deep link (`tosche://(auth)/callback`) が含まれる

---

## 6. (オプション) Firebase / FCM (push通知 - 後回し可)

v1.4 では FCM はスキップ可 (ローカル通知のみ動作)。後で対応する場合:
1. Firebase Console でプロジェクト作成
2. Android アプリ追加 → `google-services.json` ダウンロード
3. リポジトリ root に配置 → `app.json` の `android.googleServicesFile: "./google-services.json"` を追加
4. RevenueCat も FCM 設定で push 通知の挙動を有効化

---

## 7. EAS Build → Play Store 提出 (僕担当の最終段階)

津久井さんが上記1-3を完了したら、僕が以下を実行:

```bash
# 開発ビルド (実機テスト用)
eas build --platform android --profile development

# 本番ビルド + 自動Play提出
eas build --platform android --profile production --auto-submit
```

`eas.json` の submit設定で `track: "internal"` にしてあるので、内部テストトラックに自動アップロードされます。津久井さんが Play Console で内部テスト → クローズドテスト → 製品版に昇格させていきます。

---

## まとめ

| # | タスク | 担当 | 必要時間 |
| :---- | :---- | :---- | :---- |
| 1 | Play Console アプリ作成 | 津久井さん | 15-30分 |
| 2 | 6商品作成 (商品IDは厳守) | 津久井さん | 20分 |
| 3 | RevenueCat Android連携 + APIキー取得 | 津久井さん | 10分 |
| 4 | app.json に Android APIキー貼り付け | 津久井さん or Claude Code | 1分 |
| 5 | Webhook URL確認 | 津久井さん | 1分 |
| 6 | (オプション) Google OAuth確認 | 津久井さん | 15分 |
| 7 | EAS Android build + submit | Claude Code | 10分 (待ち時間別) |

合計: **約 1-2時間** (津久井さん側) + ビルド時間
