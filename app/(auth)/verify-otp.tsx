import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldCheck } from 'lucide-react-native';

const RESEND_COOLDOWN = 30; // seconds

export default function VerifyOtpScreen() {
  const { completeOtpLogin, sendEmailOtp } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; mode?: string }>();
  const email = (Array.isArray(params.email) ? params.email[0] : params.email) ?? '';
  const mode = (Array.isArray(params.mode) ? params.mode[0] : params.mode) === 'enroll'
    ? 'enroll'
    : 'login';

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleVerify = async () => {
    setError(null);
    const token = code.replace(/\s/g, '');
    if (!token) {
      setError('確認コードを入力してください');
      return;
    }
    setLoading(true);
    const { error: err } = await completeOtpLogin(email, token, mode === 'enroll');
    if (err) {
      setLoading(false);
      setError(
        err.includes('expired') || err.includes('invalid') || err.includes('Token')
          ? '確認コードが正しくないか、有効期限が切れています。コードを再送信してください。'
          : err,
      );
      return;
    }
    // 成功: completeOtpLogin 内で session 同期 → RootNavigator がタブへ遷移する。
    if (mode === 'enroll') {
      Alert.alert('2段階認証を有効にしました', '次回以降のログインで確認コードが必要になります。');
    }
    // loading は解除しない（画面はすぐ unmount される）。
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setError(null);
    setResending(true);
    const { error: err } = await sendEmailOtp(email);
    setResending(false);
    if (err) {
      setError(
        err.includes('rate limit')
          ? 'コードの再送信が制限されています。しばらく待ってからお試しください。'
          : err,
      );
      return;
    }
    setCooldown(RESEND_COOLDOWN);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerSection}>
            <View style={styles.iconContainer}>
              <ShieldCheck size={36} color="#1a1a2e" />
            </View>
            <Text style={styles.title}>2段階認証</Text>
            <Text style={styles.subtitle}>
              {email
                ? `${email} に確認コードを送信しました。メールに記載の確認コードを入力してください。`
                : 'メールに記載の確認コードを入力してください。'}
            </Text>
          </View>

          <View style={styles.formSection}>
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TextInput
              style={styles.codeInput}
              placeholder="________"
              placeholderTextColor="#c4c4cc"
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, 8))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={8}
              editable={!loading}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleVerify}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>確認</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resendButton}
              onPress={handleResend}
              disabled={cooldown > 0 || resending || loading}
            >
              {resending ? (
                <ActivityIndicator color="#6b6b7b" size="small" />
              ) : (
                <Text style={[styles.resendText, cooldown > 0 && styles.resendTextDisabled]}>
                  {cooldown > 0
                    ? `コードを再送信（${cooldown}秒）`
                    : 'コードを再送信'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              disabled={loading}
            >
              <Text style={styles.backText}>ログインに戻る</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f0',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a1a2e',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b6b7b',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  formSection: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  codeInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e2ea',
    height: 64,
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
    letterSpacing: 12,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resendButton: {
    alignSelf: 'center',
    marginTop: 20,
    paddingVertical: 6,
  },
  resendText: {
    fontSize: 14,
    color: '#1a1a2e',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  resendTextDisabled: {
    color: '#a0a0ad',
    textDecorationLine: 'none',
  },
  backButton: {
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 4,
  },
  backText: {
    fontSize: 14,
    color: '#6b6b7b',
    textDecorationLine: 'underline',
  },
});
