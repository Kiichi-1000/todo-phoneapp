# ToSche v1.4.0 — App Store 提出チェックリスト & 文面

## ビルド状態
- **v1.4.0 / Build 46** を EAS で本番ビルド → `eas submit` で App Store Connect にアップロード済み（2026-05-21）。
- Apple 側で処理中（アップロード後 5〜10 分で TestFlight / ビルド選択欄に出現）。
- ASC App ID: `6761228359` ／ Bundle: `com.synthera.tosche`

## ⛔ 私が代行できなかった点
- App Store Connect (web) は**未ログイン**（Apple ID + 2FA が必要なため代行不可）。
- 下記の最終組み立ては、**あなたが ASC にログインした後**に実施する（私が Chrome で代行も可。ログイン後に声をかけてください）。

## ✅ 提出までのチェックリスト（ASC ログイン後）
1. **ビルド添付**: アプリ → iOS App → バージョン 1.4.0 → 「ビルド」で **Build 46** を選択（処理完了後に選択可能）。
2. **輸出コンプライアンス**: `ITSAppUsesNonExemptEncryption=false` を app.json で宣言済み → 追加質問は出ない想定。
3. **サブスク**: 既存サブスク（v1.x で承認済み）の状態が「準備完了/承認済み」であること。新規追加サブスクがある場合は JA/EN 両ローカライズが「審査待ち」か確認。
4. **App Privacy**: 「収集するデータ」に以下が反映されているか確認（v1.4 の新規）:
   - **オーディオデータ**（音声入力 → Google Speech-to-Text）
   - **使用状況データ/診断**（PostHog プロダクト分析・セッションリプレイ）
   - **ユーザーコンテンツ**（AI チャット入力 → Anthropic）
5. **What's New** を入力（下記文面）。
6. **App Review メモ**（下記英文）とレビュアー用テスト口座（メール/パスワード）を入力。
7. 問題なければ右上 **「審査用に追加」→「審査へ提出」** ボタン（＝ここをあなたが押す）。

## What's New（リリースノート）
### 日本語
```
・AI 連携を強化：Claude / ChatGPT など外部 AI から目標を作成・同期できる連携機能を追加しました。
・音声入力に対応：目標コーチングで声からテキストを入力できます。
・ペイウォール表示の高速化と安定性の改善。
・設定画面を再構成（カテゴリの折りたたみ・「バグの報告」窓口を追加）。
・ログイン周りの安定性向上とその他の不具合修正。
```
### English
```
- Expanded AI integration: connect external AI (Claude / ChatGPT) to create and sync your goals.
- Voice input: dictate into goal coaching by voice.
- Faster, more reliable paywall rendering.
- Reorganized Settings (collapsible sections, new "Report a bug" entry).
- Sign-in stability improvements and other bug fixes.
```

## App Review メモ（英語・コピペ用）
```
Hello, and thank you for reviewing ToSche v1.4.0.

This update expands the AI features and adds voice input.

[AI / Privacy 5.1.1]
- On first use of any AI feature the app shows an explicit consent screen and gates access behind it.
- The privacy policy discloses exactly what is sent, the recipient (Anthropic, PBC — Delaware, USA), the purpose (response generation only), and that the data is NOT used to train models. Voice input is transcribed by Google Speech-to-Text and not stored after transcription.

[In-App Purchase 3.1.1]
- All paid features are unlocked solely via Apple In-App Purchase entitlements. There is no external payment path or promo-code entry UI in the app.

[Sign-in for review]
- Email: <レビュア用テストアカウントのメール>
- Password: <レビュア用テストアカウントのパスワード>
- Apple/Google sign-in is also available.

Please let us know if anything else is needed. Thank you!
```
> ※ テスト口座は実機でログインが通るものを記入すること（スキルのチェック項目）。

## 関連
- Android(Play): ビルドのアップロードが前提でサブスク作成可。プロモ画像は Cowork 依頼（`docs/v1_4_release_readiness_2026-05-21.md` 参照）。
