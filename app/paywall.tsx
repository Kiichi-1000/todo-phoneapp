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
//   → ヘッダーに「閉じる」ボタンを明示表示 (RC template が X を出さなくても確実に脱出可能)
//   → <RevenueCatUI.Paywall> が現在の Offering の Paywall を全画面表示
//   → 購入完了 / 復元完了 → サブスク状態を即時同期 → /(tabs)/ai に遷移
//   → 閉じる (ヘッダー閉じる / X タップ / swipe down / 購入せず終了) → /(tabs)/workspace に遷移
//
// dismissal 経路 (= 全て workspace に集約):
//   1. ヘッダー左の「閉じる」ボタン (常時表示)
//   2. RC Paywall の X ボタン (displayCloseButton: true)
//   3. iOS modal の下スワイプ (gestureEnabled: true)
//   いずれも onDismiss / handleClose を経由して /(tabs)/workspace へ replace。
//   元タブ (AI / Goals) に router.back() で戻すと useFocusEffect が再判定して
//   paywall を再 push する無限ループになるため、必ず replace で切る。
//
// 購入後の「即時解放」について:
//   購入の正本反映は RevenueCat Webhook (Edge Function: revenuecat-webhook) が
//   担うが、サーバ間通信のラグ (数秒〜十数秒) がある。その間 AI タブに戻ると
//   checkAiAccess() がまだ「未加入」を返し課金壁が再表示される。
//   → 購入/復元成功時に syncSubscriptionAfterPurchase() を呼び、クライアントが
//     掴んでいる customerInfo を Edge Function (sync-subscription) に渡して
//     user_subscriptions を即 active にしてからタブ遷移する。

import { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
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

  // 二重発火防止フラグ。 X タップ / swipe / ヘッダー閉じる が同時にトリガーされたとき、
  // router.replace を 2 回呼ぶと navigation state が破綻するので、最初の dismiss だけ
  // 処理する。
  const dismissingRef = useRef(false);

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
    if (dismissingRef.current) return;
    dismissingRef.current = true;
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
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    try {
      const productId = info?.storeTransaction?.productIdentifier;
      await syncSubscriptionAfterPurchase(info?.customerInfo, productId);
    } catch (e) {
      if (__DEV__) console.warn('[Paywall] sync after purchase failed', e);
      // 同期失敗は致命的でない — Webhook が後で補正する。遷移は続行。
    }
    router.replace('/(tabs)/ai');
  };

  // 共通ヘッダー: 左に「閉じる」ボタンを必ず表示。RC Paywall の template が
  // X を出さない場合の救済線。loading / error / paywall 表示中いずれの状態でも見える。
  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={handleClose}
        style={styles.closeButton}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={lang === 'ja' ? '閉じる' : 'Close'}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <X size={22} color="#0F172A" strokeWidth={2.3} />
        <Text style={styles.closeText}>
          {lang === 'ja' ? '閉じる' : 'Close'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (!ready) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0F172A" />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={handleClose} style={styles.errorButton} activeOpacity={0.7}>
            <Text style={styles.errorButtonText}>
              {lang === 'ja' ? '戻る' : 'Back'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderHeader()}
      <RevenueCatUI.Paywall
        style={styles.paywall}
        options={{
          // RC template 内蔵の X ボタンも併用。表示するかは template 次第だが、
          // 出るならユーザーの選択肢が増えるので有効化したまま。
          displayCloseButton: true,
        }}
        onPurchaseCompleted={({ customerInfo, storeTransaction }) => {
          void handlePurchaseOrRestore({ customerInfo, storeTransaction });
        }}
        onRestoreCompleted={({ customerInfo }) => {
          void handlePurchaseOrRestore({ customerInfo });
        }}
        onPurchaseError={({ error: e }) => {
          if (__DEV__) console.warn('[Paywall] purchase error', e);
        }}
        onDismiss={() => {
          handleClose();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFF' },
  paywall: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FAFBFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  closeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
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
    lineHeight: 20,
  },
  errorButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#0F172A',
  },
  errorButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
