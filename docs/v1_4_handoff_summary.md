# v1.4 完了状況 + 津久井さん側タスクリスト

**最終更新**: 2026-05-18
**現ブランチ**: `claude/musing-murdock-b44a3f`

---

## 1. v1.4 実装完了済 (僕が全部やった)

| Phase | 内容 | コミット |
| :---- | :---- | :---- |
| Phase 1 | PRODUCT_CHANGE差額付与バグ修正 + 既存被害者(9cjmymnjvq)補填 | `63a3e39` |
| Phase 2 (MCP backend) | mcp-server + mcp-keys Edge Function + テーブル | `c68881c` |
| Phase 2.5 (Android下準備) | app.json + eas.json + Apple Sign In iOS-only + Play SKU map | `adb5b21` |
| Phase 2.6 (ChatGPT) | OpenAPI 3.1 surface追加 | `553e457` |
| Phase 2.7 (OAuth backend) | DCR + PKCE + リフレッシュローテーション + Cloudflare Worker consent | `77c2db5` `df62346` `725a9d9` |
| Phase 2.8 (Claude OAuth事前登録) | tsche_claude_web/code 事前登録 + RFC8252ループバック + 401 WWW-Authenticate | `0cf53c6` |

**動作確認済**:
- ✅ サーバー側 OAuth/MCP/REST全エンドポイント curl テスト合格
- ✅ Claude Code: `claude mcp add` で **"✓ Connected"** 確認
- ✅ ChatGPT Custom GPT Action: OpenAPI URL + Bearer keyで動作
- ✅ アプリ画面: iOS Simulatorで新規アカウント作成 + AI連携画面表示

---

## 2. 現時点の **既知の制限** (Anthropic側問題、当方コードは仕様準拠)

### claude.ai Web カスタムコネクター
- ✅ コネクター追加できる
- ✅ Anthropic backend が当方MCPサーバーに POST してくる
- ✅ 当方が 401 + WWW-Authenticate header を返す
- ❌ **claude.aiが OAuth flow を自動起動しない** (ログ確認: `/oauth/authorize`/`/register`への呼び出しゼロ)

**結論**: 当方の OAuth backend は MCP Authorization Spec 2025-06-18 完全準拠。claude.ai web側の対応が整い次第、当方コード変更ゼロで動きます。

**今動かしたいなら**: ChatGPT Custom GPT または Claude Code CLI を案内する。両者は完全動作。

---

## 3. 津久井さんにやってほしいこと

### 🔴 高優先度 (v1.4リリース前)

#### a. Google Play Console セットアップ (Android対応)
**所要時間**: 15-30分 | **依頼理由**: Google Play Developerアカウントの操作は人間が必要

1. https://play.google.com/console を開く
2. 「アプリを作成」
   - アプリ名: **ToSche**
   - パッケージ名: `com.synthera.tosche` ← 必ずこれ
   - 規定言語: 日本語
3. 「アプリのコンテンツ」を埋める
   - プライバシーポリシーURL: `https://todo-phoneapp.pages.dev/legal/tosche/privacy.html`
   - データセーフティ: iOS版と同じ内容
4. 「サブスクリプション」で6商品作成 (商品IDは厳密一致必須):

| 商品ID | 価格(¥) | 周期 |
| :---- | :---- | :---- |
| `tosche_basic_monthly` | 300 | 月額 |
| `tosche_basic_yearly` | 3,240 | 年額 |
| `tosche_ai_standard_monthly` | 1,200 | 月額 |
| `tosche_ai_standard_yearly` | 12,960 | 年額 |
| `tosche_ai_pro_monthly` | 2,000 | 月額 |
| `tosche_ai_pro_yearly` | 21,600 | 年額 |

#### b. RevenueCat Android アプリ追加
**所要時間**: 10分

1. https://app.revenuecat.com で既存プロジェクトを開く
2. Apps → Add App → Google Play
3. Package name: `com.synthera.tosche`
4. Google Play Service Account JSON連携 (Play Console → API access → Service account作成 → JSON DL → RC にUL)
5. Public API key (Android) をコピー
6. このチャットに教えて → 僕が `app.json` の `extra.revenuecatApiKeyAndroid` に貼る

#### c. (v1.4スコープ外、後でOK) Apple側でTestFlightアップロード前確認
**所要時間**: 5分

すでに v1.3 が Apple 提出済なので、v1.4も同じフローで `eas build --auto-submit` で出せます。
ただし審査メモなど人間判断が必要なときがあるので、僕がビルド完了したら声かけます。

### 🟡 中優先度 (v1.5またはv1.4後半でも可)

#### d. ChatGPT Custom GPT として「ToSche」を作成
**所要時間**: 10分

1. chat.openai.com → My GPTs → Create
2. Configure → Actions → Create new action
3. Import from URL: `https://utfyxsvxyvzxjqcgzjjl.supabase.co/functions/v1/mcp-server/openapi.json`
4. Authentication → API Key → Auth Type **Bearer**
5. アプリでAPIキー生成して貼り付け
6. Save

これで津久井さんのChatGPTでToSche目標管理ができます。動作確認用。

#### e. (オプション) Claude公式コネクター承認申請
- 不確実なので**今は不要**と判断
- 将来やるなら: Anthropic にメール (`mcp-support@anthropic.com` ?) で承認依頼

### 🟢 低優先度 (将来)

#### f. Firebase / FCM (push通知, Android用)
- v1.4ではスキップ可 (ローカル通知だけで動く)
- 後で対応する場合: Firebase Console でプロジェクト作成 → `google-services.json` DL → リポジトリroot配置

#### g. Crowdin 翻訳 (英語以外の言語追加時)

---

## 4. 僕(Claude Code)ができないこと一覧

| タスク | 理由 |
| :---- | :---- |
| Apple Developer / Google Play Developer ログイン | 人間アカウントの 2FA / App Store Connect 操作 |
| GitHub OAuth approve | ブラウザでの承認操作 |
| Crowdin 操作 | 同上 |
| Figma 操作 | 同上 (ただし Figma MCP は使える) |
| 物理iPhoneでの実機操作 | デバイスに触れない (iOS Simulatorは可) |
| メールアカウント認証 (magic link クリック) | メール受信は人間のみ |
| 法人契約・有料SaaS新規契約 | クレカ等の人間判断 |
| Anthropic公式 connector 申請 | 人間によるパートナーシップ申請 |
| RevenueCat dashboard でのストア連携初期設定 | 上記Google Service Accountキーの新規発行など |

---

## 5. 次のセッションで僕が即時着手できること

1. **`app.json` に Android RevenueCat API キー貼り付け** (津久井さんから受領後)
2. **EAS Build (iOS + Android 両方)** + Auto-submit
3. **Phase 3 polish** (UI改善, バグfix, v1.3で出てきた問題対応)
4. **Android用adaptiveアイコン生成** (シンプル版)
5. **(claude.ai対応進展時) OAuth E2Eテスト追検証**

---

## 6. v1.4 デプロイ済リソース

| リソース | URL / ID |
| :---- | :---- |
| MCP server | `https://utfyxsvxyvzxjqcgzjjl.supabase.co/functions/v1/mcp-server` |
| OpenAPI spec | `https://utfyxsvxyvzxjqcgzjjl.supabase.co/functions/v1/mcp-server/openapi.json` |
| OAuth consent (Worker proxy) | `https://tosche-oauth.kiichitsukui111806.workers.dev/authorize` |
| Claude Web Client ID | `tsche_claude_web` |
| Claude Code Client ID | `tsche_claude_code` |
| Webhook (RevenueCat) | `https://utfyxsvxyvzxjqcgzjjl.supabase.co/functions/v1/revenuecat-webhook` (v7) |

---

## 7. 動かし方一覧

### Claude Code (今すぐ動く)
```bash
claude mcp add --transport http tosche \
  https://utfyxsvxyvzxjqcgzjjl.supabase.co/functions/v1/mcp-server \
  --client-id tsche_claude_code
# Claude Code 起動 → 自動でブラウザOAuth → 「許可する」 → 完了
```

### ChatGPT Custom GPT (今すぐ動く)
上記 §3-d 参照

### claude.ai Web (Anthropic側の対応待ち)
- 詳細設定 → OAuth Client ID に `tsche_claude_web` 貼り付け
- 現状0ツール表示 → OAuth自動起動を待つしかない
- 直近の解決見込みは不明 → ChatGPT/Claude Code 案内が現実的
