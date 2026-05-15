// AIConsentModal — Apple ガイドライン 5.1.1(i) / 5.1.2(i) 対応の同意モーダル。
//
// なぜ必要か:
//   Apple は「第三者 AI サービス (= Anthropic Claude) にユーザーデータを送る前に、
//   何を、誰に、何のために送るかを明示し、ユーザーの明示的同意を取る」ことを要求している。
//   利用規約への記載のみでは不十分 (Apple ガイドライン 5.1.1(i) で明示)。
//
// 設計:
//   - 初回 AI 機能利用時に 1 度だけ表示
//   - 同意を AsyncStorage に保存 (= 端末ローカル、デバイス変更で再表示)
//   - 同意なしでは AI 機能を使えない (= AI chat 送信ボタンが gate される)
//   - サブスク無し時に表示する Paywall とは独立 (Paywall は機能購入の同意、
//     こちらはデータ送信の同意。両方必要)
//   - 「同意しない」を押すと AI 機能を放棄して画面を閉じる (元タブに戻る)

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles, Check, ExternalLink, X } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLegalPrivacyUrl } from '@/lib/legalUrls';

const STORAGE_KEY = 'tosche_ai_consent_v1';

/**
 * 端末上の AI 同意状態を読む。Boolean を返す Promise。
 * AsyncStorage の値が 'true' なら同意済み。
 */
export async function isAiConsentGranted(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

/** 同意取得を保存。サインアウト時にもクリアしない (端末単位の同意)。 */
export async function setAiConsentGranted(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // 失敗してもクラッシュさせない (= ローカルストレージ問題のみ)
  }
}

interface Props {
  visible: boolean;
  /** ユーザーが「同意する」を押した時 */
  onConsent: () => void;
  /** ユーザーが「同意しない」を押した、もしくはモーダルを閉じた時 */
  onDecline: () => void;
}

export default function AIConsentModal({ visible, onConsent, onDecline }: Props) {
  const { lang } = useLanguage();
  const [accepting, setAccepting] = useState(false);

  const handleAccept = async () => {
    setAccepting(true);
    await setAiConsentGranted();
    setAccepting(false);
    onConsent();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDecline}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onDecline} style={styles.closeBtn} activeOpacity={0.7}>
            <X size={20} color="#475569" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.heroIcon}>
            <Sparkles size={36} color="#7C3AED" strokeWidth={1.8} />
          </View>

          <Text style={styles.title}>
            {lang === 'ja'
              ? 'AI 機能の利用に関するお知らせ'
              : 'Before using AI features'}
          </Text>

          <Text style={styles.subtitle}>
            {lang === 'ja'
              ? 'AI 機能を利用するには、以下の内容をご確認の上、同意してください。'
              : 'Please review and consent to the following before using AI features.'}
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {lang === 'ja' ? '🤝 第三者 AI サービスへのデータ送信' : '🤝 Data sent to a third-party AI service'}
            </Text>
            <Text style={styles.cardBody}>
              {lang === 'ja'
                ? 'AI アシスタント機能および目標コーチング機能を利用すると、あなたがアプリで入力した以下のデータが、AI モデル提供企業である Anthropic, PBC (米国) に送信され、応答生成のために処理されます。'
                : 'When you use the AI assistant and goal-coaching features, the following data you enter in the app is sent to Anthropic, PBC (USA), the AI model provider, and processed to generate responses.'}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {lang === 'ja' ? '📤 送信される情報' : '📤 What is sent'}
            </Text>
            <View style={styles.bulletList}>
              {(lang === 'ja'
                ? [
                    'AI チャット欄に入力したテキスト',
                    'AI への操作意図を理解するため、現在のタスク・予定・目標等の関連情報 (タイトルや日時等)',
                    '会話の文脈を保つための直近のチャット履歴',
                  ]
                : [
                    'Text you enter in the AI chat',
                    'Related context (task titles, dates, goals) so the AI can act on your data',
                    'Recent chat history to maintain conversation context',
                  ]
              ).map((line) => (
                <View key={line} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{line}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {lang === 'ja' ? '🛡️ 送信されない情報' : '🛡️ What is NOT sent'}
            </Text>
            <View style={styles.bulletList}>
              {(lang === 'ja'
                ? [
                    'パスワード、認証トークン、決済情報',
                    '位置情報、連絡先、写真、カメラ',
                    'AI 機能と関係のないアプリ内データ',
                  ]
                : [
                    'Passwords, auth tokens, payment information',
                    'Location, contacts, photos, camera data',
                    'App data unrelated to the AI feature',
                  ]
              ).map((line) => (
                <View key={line} style={styles.bulletRow}>
                  <View style={[styles.bulletDot, styles.bulletDotSafe]} />
                  <Text style={styles.bulletText}>{line}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {lang === 'ja' ? '🏢 送信先と利用範囲' : '🏢 Where data goes and how it is used'}
            </Text>
            <Text style={styles.cardBody}>
              {lang === 'ja'
                ? '送信先: Anthropic, PBC (https://www.anthropic.com)\n用途: AI 応答の生成のみ\nAnthropic は API 経由で受信したデータを、自社の AI モデルの学習に使用しないことを公式に表明しています (https://www.anthropic.com/legal/privacy)。'
                : 'Recipient: Anthropic, PBC (https://www.anthropic.com)\nPurpose: solely to generate AI responses\nAnthropic publicly commits not to use API-submitted data for training its models (https://www.anthropic.com/legal/privacy).'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => Linking.openURL(getLegalPrivacyUrl())}
            style={styles.linkRow}
            activeOpacity={0.7}
          >
            <ExternalLink size={14} color="#1D4ED8" strokeWidth={2.2} />
            <Text style={styles.linkText}>
              {lang === 'ja' ? 'プライバシーポリシー全文を読む' : 'Read full Privacy Policy'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 24 }} />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity onPress={onDecline} style={styles.declineBtn} activeOpacity={0.7}>
            <Text style={styles.declineBtnText}>
              {lang === 'ja' ? '同意しない' : 'Do not consent'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleAccept}
            disabled={accepting}
            style={[styles.acceptBtn, accepting && { opacity: 0.7 }]}
            activeOpacity={0.85}
          >
            <Check size={16} color="#fff" strokeWidth={2.4} />
            <Text style={styles.acceptBtnText}>
              {lang === 'ja' ? '同意して AI を使う' : 'Consent and continue'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
  },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  heroIcon: {
    alignSelf: 'center',
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: '#F3E8FF',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22, fontWeight: '700', color: '#0F172A',
    textAlign: 'center', marginBottom: 8,
  },
  subtitle: {
    fontSize: 13, color: '#64748B',
    textAlign: 'center', marginBottom: 20,
    lineHeight: 19,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 13, fontWeight: '700', color: '#0F172A',
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 12.5, color: '#475569',
    lineHeight: 19,
  },
  bulletList: { gap: 6 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#7C3AED',
    marginTop: 7,
  },
  bulletDotSafe: { backgroundColor: '#10B981' },
  bulletText: { flex: 1, fontSize: 12.5, color: '#475569', lineHeight: 19 },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center',
    paddingVertical: 12,
  },
  linkText: { fontSize: 12.5, color: '#1D4ED8', fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  declineBtn: {
    flex: 1,
    paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  declineBtnText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  acceptBtn: {
    flex: 1.4,
    flexDirection: 'row', gap: 6,
    paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center', justifyContent: 'center',
  },
  acceptBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
