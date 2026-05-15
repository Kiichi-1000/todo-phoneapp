// Paywall route — AI / Goals 機能の課金壁。
//
// v1.2 から RevenueCat ダッシュボードで管理する組み込み Paywall コンポーネントに切替えました。
// 旧バージョンの「カスタム React Native UI で価格カードを描く」方式は廃止。
//
// なぜ切替えたか:
// - RevenueCat ダッシュボードで AI Paywall Builder + 手作業で完成度の高い Paywall が作れる
// - ローカライズ (日本語/英語) が RC 側で完結 (再ビルド不要で文言修正可能)
// - A/B テストや差替えがコード変更なしで可能
// - SDK が自動的に Offering の `current` から商品リストを取得 → 価格表示が常に正しい
//
// 必要条件 (RC ダッシュボード側):
// 1. `default` Offering が `is_current: true`
// 2. その Offering に Paywall が attach されている (Web UI から手動で実施が必要)
// 3. Offering に商品 (Package) が紐づいている
// 4. SDK が初期化されている (= `ensureRevenueCat(userId)` が呼ばれている)
//
// 動作フロー:
//   ユーザーが AI / Goals タップ
//   → router.push('/paywall')
//   → このスクリーンが modal で開く
//   → ensureRevenueCat() で SDK init を待つ
//   → <RevenueCatUI.Paywall> が現在の Offering の Paywall を全画面表示
//   → 購入完了 / 復元完了 → サブスク状態を即時同期 → /(tabs)/ai に遷移
//   → 閉じる (X タップ / 購入せず終了) → /(tabs)/workspace に遷移 (= 無限ループ防止)
//
// 購入後の「即時解放」について:
//   購入の正本反映は RevenueCat Webhook (Edge Function: revenuecat-webhook) が
//   担うが、サーバ間通信のラグ (数秒〜十数秒) がある。その間 AI タブに戻ると
//   checkAiAccess() がまだ「未加入」を返し課金壁が再表示される。
//   → 購入/復元成功時に syncSubscriptionAfterPurchase() を呼び、クライアントが
//     掴んでいる customerInfo を Edge Function (sync-subscription) に渡して
//     user_subscriptions を即 active にしてからタブ遷移する。
//   方式 (a): 即時同期 Edge Function を選んだ理由 —
//     方式 (b) の「checkAiAccess をリトライ」だけだと、Webhook が来るまで
//     user_subscriptions が空のままなので何回リトライしても active にならず、
//     Webhook 到着までの数秒〜十数秒ユーザーを待たせることになる。
//     (a) なら購入直後にこちら起点で確定的に解放できる。

import { useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import RevenueCatUI from 'react-native-purchases-ui';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  ensureRevenueCat,
  isRevenueCatConfigured,
  syncSubscriptionAfterPurchase,
} from '@/lib/revenueCat';

export default function PaywallScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { lang } = useLanguage();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SDK 初期化を待つ。configure が未完で <Paywall> をレンダすると getOfferings が
  // 空を返して「商品が見つかりません」エラーが出るため、必ず ready=true 待ち。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!isRevenueCatConfigured()) {
          // API キー未設定 (= stub モード) のとき。開発用ビルドのまま運用してると起きる。
          if (!cancelled) {
            setError(
              lang === 'ja'
                ? 'RevenueCat が未設定です。アプリの再ビルドが必要かもしれません。'
                : 'RevenueCat is not configured. The app may need to be rebuilt.',
            );
            setReady(true);
          }
          return;
        }
        await ensureRevenueCat(user?.id);
        if (!cancelled) setReady(true);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? String(e));
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, lang]);

  // 課金せずに閉じた場合の遷移先。
  // router.back() だと paywall を出した元タブ (AI / Goals) に戻ってしまい、
  // 元タブの useFocusEffect が再判定 → 再度 paywall push の無限ループになる。
  // → workspace タブに replace してループを断つ。
  const handleClose = () => {
    router.replace('/(tabs)/workspace');
  };

  // 購入 / 復元の成功時: まずサブスク状態を即時同期してから AI タブへ遷移する。
  // 同期に失敗しても (= sync が false / 例外) AI タブには進める。その場合は
  // RevenueCat Webhook が後追いで user_subscriptions を確定し、AI タブの
  // useFocusEffect 再判定で最終的に解放される。
  // storeTransaction.productIdentifier が取れれば product_id を sync に渡す。
  const handlePurchaseOrRestore = async (info: {
    customerInfo: unknown;
    storeTransaction?: { productIdentifier?: string } | null;
  }) => {
    try {
      const productId = info?.storeTransaction?.productIdentifier;
      await syncSubscriptionAfterPurchase(info?.customerInfo, productId);
    } catch (e) {
      if (__DEV__) console.warn('[Paywall] sync after purchase failed', e);
      // 同期失敗は致命的でない — Webhook が後で補正する。遷移は続行。
    }
    router.replace('/(tabs)/ai');
  };

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0F172A" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.errorHint} onPress={handleClose}>
          {lang === 'ja' ? '閉じる' : 'Close'}
        </Text>
      </View>
    );
  }

  return (
    <RevenueCatUI.Paywall
      style={styles.paywall}
      options={{
        // 閉じるボタンを表示。下スワイプは _layout.tsx 側で gestureEnabled:false にしてあるので
        // X タップが唯一の脱出経路 → handleClose で必ず workspace に遷移する。
        displayCloseButton: true,
      }}
      onPurchaseCompleted={({ customerInfo, storeTransaction }) => {
        // 購入成功 → サブスク状態を即時同期 → AI タブへ。同期で
        // user_subscriptions が active になるので、AI タブの useFocusEffect
        // 再判定で paywall は出ない (Webhook 反映ラグを待たない)。
        void handlePurchaseOrRestore({ customerInfo, storeTransaction });
      }}
      onRestoreCompleted={({ customerInfo }) => {
        // 復元成功 (機種変等で過去購入を取り戻すケース)。
        // restore では storeTransaction が無いため product_id は customerInfo
        // 由来で sync 側が既存値を温存する。
        void handlePurchaseOrRestore({ customerInfo });
      }}
      onPurchaseError={({ error: e }) => {
        if (__DEV__) console.warn('[Paywall] purchase error', e);
        // ユーザーキャンセルは通常エラー扱いせず、SDK が握り潰す。
      }}
      onDismiss={() => {
        // X タップまたは内蔵 close で閉じられたとき
        handleClose();
      }}
    />
  );
}

const styles = StyleSheet.create({
  paywall: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  errorText: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
  },
  errorHint: {
    fontSize: 14,
    color: '#1D4ED8',
    fontWeight: '600',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});
