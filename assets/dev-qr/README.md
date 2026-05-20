# Expo Go dev preview QR

iOS / Android 両対応の Expo Go から ToSche 開発ビルドを開くための QR。

```
URL:        exp://192.168.11.21:8081
Metro port: 8081
LAN host:   192.168.11.21
```

## 使い方

### iOS (iPhone / iPad)
1. App Store から **Expo Go** をインストール
2. **iOS のカメラアプリ**で `tosche-expo-go.png` をかざす
   → 「Expo Go で開く」通知をタップ
3. ToSche が Metro 経由で起動

### Android
1. Google Play から **Expo Go** をインストール
2. Expo Go アプリを起動 → 「Scan QR Code」
3. `tosche-expo-go.png` をかざす
4. ToSche が Metro 経由で起動

## 必須条件: 同一 LAN
- Mac (Metro) と端末は **同じ Wi-Fi** にいる必要あり
- Mac の IP が変わったら expo を再起動して QR を再生成

## Expo Go では動かないもの
| 機能 | 挙動 |
| :- | :- |
| RevenueCat 課金 | スタブモード (購入ボタン無効) |
| PostHog セッションレコーディング | 録画なし (イベント送信はOK) |
| Apple Sign In | iOS でも非表示 (entitlement 必須のため) |
| FCM リモート Push | 受信不可 (ローカル通知はOK) |

これらの動作確認は **EAS dev / production build** が必要。

## 関連ファイル
- `tosche-expo-go.png` — `exp://192.168.11.21:8081` 用 QR (iOS/Android 共通)
