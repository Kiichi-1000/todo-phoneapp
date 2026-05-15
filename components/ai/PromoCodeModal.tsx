import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { X, Gift, Check } from 'lucide-react-native';
import { supabase, supabaseUrl } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface RedeemResponse {
  ok?: boolean;
  error?: string;
  kind?: 'free_access' | 'token_grant';
  valid_until?: string;
  granted_token_yen?: number;
}

const ERROR_MESSAGES_JA: Record<string, string> = {
  code_not_found: 'コードが見つかりません',
  code_inactive: 'このコードは無効化されています',
  code_not_yet_active: 'このコードはまだ利用開始前です',
  code_expired: 'このコードは有効期限切れです',
  code_redemption_limit_reached: 'このコードの利用上限に達しました',
  already_redeemed: '既に利用済みのコードです',
};
const ERROR_MESSAGES_EN: Record<string, string> = {
  code_not_found: 'Code not found',
  code_inactive: 'This code is no longer active',
  code_not_yet_active: 'This code is not yet active',
  code_expired: 'This code has expired',
  code_redemption_limit_reached: 'Redemption limit reached',
  already_redeemed: 'You\'ve already redeemed this code',
};

export default function PromoCodeModal({ visible, onClose, onSuccess }: Props) {
  const { t, lang } = useLanguage();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<RedeemResponse | null>(null);

  const handleClose = () => {
    setCode('');
    setError(null);
    setSuccess(null);
    onClose();
  };

  const handleSubmit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${supabaseUrl}/functions/v1/redeem-promo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json() as RedeemResponse;
      if (!res.ok || !data.ok) {
        const errKey = data.error || 'unknown_error';
        const dict = lang === 'en' ? ERROR_MESSAGES_EN : ERROR_MESSAGES_JA;
        setError(dict[errKey] ?? errKey);
        return;
      }
      setSuccess(data);
      setTimeout(() => {
        onSuccess?.();
        handleClose();
      }, 2000);
    } catch (e: any) {
      setError(e?.message ?? 'エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso?: string): string => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    } catch { return ''; }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {lang === 'ja' ? 'クーポンコード' : 'Promo Code'}
          </Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <X size={20} color="#475569" />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <View style={styles.iconWrap}>
            <Gift size={36} color="#7c3aed" />
          </View>

          <Text style={styles.description}>
            {lang === 'ja'
              ? 'コードを入力して AI 機能を無料で利用できます。'
              : 'Enter a code to unlock free AI access.'}
          </Text>

          <TextInput
            style={[styles.input, error && styles.inputError]}
            value={code}
            onChangeText={(t) => { setCode(t.toUpperCase()); setError(null); }}
            placeholder={lang === 'ja' ? 'コードを入力' : 'Enter code'}
            placeholderTextColor="#94a3b8"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!submitting && !success}
            maxLength={32}
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          {success && (
            <View style={styles.successBox}>
              <Check size={18} color="#16a34a" />
              <Text style={styles.successText}>
                {lang === 'ja'
                  ? `クーポンが適用されました${success.valid_until ? `（${formatDate(success.valid_until)}まで）` : ''}`
                  : `Coupon applied${success.valid_until ? ` (until ${formatDate(success.valid_until)})` : ''}`}
              </Text>
            </View>
          )}

          {!success && (
            <TouchableOpacity
              style={[styles.submitBtn, (!code.trim() || submitting) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!code.trim() || submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.submitBtnText}>{lang === 'ja' ? '適用する' : 'Apply'}</Text>}
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  closeBtn: { padding: 6 },
  body: { padding: 28, alignItems: 'center' },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f3e8ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  description: { fontSize: 14, color: '#475569', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  input: {
    width: '100%',
    height: 52,
    backgroundColor: '#f1f4f9',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 17,
    fontWeight: '600',
    color: '#0f172a',
    letterSpacing: 1.5,
    textAlign: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputError: { borderColor: '#dc2626' },
  errorText: { color: '#dc2626', fontSize: 13, marginTop: 8, alignSelf: 'flex-start' },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 16,
  },
  successText: { color: '#166534', fontSize: 13, fontWeight: '500' },
  submitBtn: {
    width: '100%',
    height: 50,
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  submitBtnDisabled: { backgroundColor: '#cbd5e1' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
