import { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { BookOpen, Mail, Lock, Eye, EyeOff, Apple } from 'lucide-react-native';

export default function LoginScreen() {
  const {
    verifyPasswordForLogin,
    adoptSession,
    sendEmailOtp,
    signInWithGoogle,
    signInWithApple,
  } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  // Unified screen: "Continue with Google/Apple" handles both sign-up and
  // login. Email/password is a login-only fallback for users who registered
  // before the social-login consolidation, hidden behind a link by default.
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  const handleEmailLogin = async () => {
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError(t('auth.errorEmailPasswordRequired'));
      return;
    }

    setLoading(true);
    const { error: err, twoFactorEnabled, session } = await verifyPasswordForLogin(
      email.trim(),
      password,
    );

    if (err) {
      setLoading(false);
      setError(getErrorMessage(err));
      return;
    }

    // Account has email 2FA enabled -> send a code and go to the OTP screen.
    if (twoFactorEnabled) {
      const { error: otpErr } = await sendEmailOtp(email.trim());
      setLoading(false);
      if (otpErr) {
        setError(getErrorMessage(otpErr));
        return;
      }
      router.push({
        pathname: '/(auth)/verify-otp',
        params: { email: email.trim(), mode: 'login' },
      });
      return;
    }

    // 2FA not enabled -> offer enrollment (asked, not forced).
    setLoading(false);
    Alert.alert(
      '2段階認証の設定',
      'セキュリティ向上のため、ログイン時にメールへ届く確認コードでの本人確認（2段階認証）を設定できます。今すぐ設定しますか？',
      [
        {
          text: '後で',
          style: 'cancel',
          onPress: () => {
            if (session) adoptSession(session);
          },
        },
        {
          text: '設定する',
          onPress: async () => {
            setLoading(true);
            const { error: otpErr } = await sendEmailOtp(email.trim());
            setLoading(false);
            if (otpErr) {
              // Couldn't send the code — log in normally rather than block.
              setError(getErrorMessage(otpErr));
              if (session) await adoptSession(session);
              return;
            }
            router.push({
              pathname: '/(auth)/verify-otp',
              params: { email: email.trim(), mode: 'enroll' },
            });
          },
        },
      ],
      { cancelable: true },
    );
  };

  const getErrorMessage = (err: string): string => {
    if (err.includes('Invalid login credentials')) {
      return t('auth.errorInvalidCredentials');
    }
    if (err.includes('User already registered')) {
      return t('auth.errorEmailInUse');
    }
    if (err.includes('Email rate limit') || err.includes('rate limit')) {
      return t('auth.errorRateLimit');
    }
    return err;
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    const { error: err } = await signInWithGoogle();
    if (err) {
      setError(err);
    }
    setGoogleLoading(false);
  };

  const handleAppleSignIn = async () => {
    setError(null);
    setAppleLoading(true);
    const { error: err } = await signInWithApple();
    if (err) {
      setError(err);
    }
    setAppleLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        // Android: let the native windowSoftInputMode=adjustResize handle the
        // keyboard. On the New Architecture (Fabric), stacking behavior="height"
        // on top of native resize causes the layout to oscillate ("ガタガタ").
        // iOS still needs explicit "padding".
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoSection}>
            <View style={styles.logoContainer}>
              <BookOpen size={40} color="#1a1a2e" />
            </View>
            <Text style={styles.appName}>ToSche</Text>
            <Text style={styles.appTagline}>目標・ToDo・予定をひとつに</Text>
          </View>

          <View style={styles.formSection}>
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* 主導線: 「続ける」は新規登録とログインを兼ねる。
                Apple Sign In は iOS / Web (Safari) のみ。Android は Google のみ。 */}
            {Platform.OS !== 'android' && (
              <TouchableOpacity
                style={[styles.appleButton, appleLoading && styles.submitButtonDisabled]}
                onPress={handleAppleSignIn}
                disabled={loading || appleLoading || googleLoading}
              >
                {appleLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Apple size={18} color="#fff" />
                    <Text style={styles.appleButtonText}>{t('auth.continueWithApple')}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.googleButton, googleLoading && styles.submitButtonDisabled]}
              onPress={handleGoogleSignIn}
              disabled={loading || googleLoading || appleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator color="#1a1a2e" size="small" />
              ) : (
                <>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={styles.googleButtonText}>{t('auth.continueWithGoogle')}</Text>
                </>
              )}
            </TouchableOpacity>

            {/* 既存ユーザー向け: メール/パスワードでのログイン。新規登録は不可
                (アカウント作成は Google / Apple に一本化済み)。 */}
            {!showEmailLogin ? (
              <TouchableOpacity
                style={styles.emailLoginLink}
                onPress={() => {
                  setError(null);
                  setShowEmailLogin(true);
                }}
                disabled={loading || googleLoading || appleLoading}
              >
                <Text style={styles.emailLoginLinkText}>メールアドレスでログイン</Text>
              </TouchableOpacity>
            ) : (
              <>
                <View style={styles.dividerContainer}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>{t('auth.or')}</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.inputWrapper}>
                    <Mail size={18} color="#8a8a9a" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder={t('auth.email')}
                      placeholderTextColor="#8a8a9a"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      editable={!loading}
                    />
                  </View>

                  <View style={styles.inputWrapper}>
                    <Lock size={18} color="#8a8a9a" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder={t('auth.password')}
                      placeholderTextColor="#8a8a9a"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      textContentType="password"
                      editable={!loading}
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff size={18} color="#8a8a9a" />
                      ) : (
                        <Eye size={18} color="#8a8a9a" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                  onPress={handleEmailLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.submitButtonText}>{t('auth.login')}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.forgotButton}
                  onPress={() => router.push('/(auth)/forgot-password')}
                  disabled={loading}
                >
                  <Text style={styles.forgotText}>{t('auth.forgotPasswordPrompt')}</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.legalFooter}>
              <Text style={styles.legalFooterText}>
                <Text
                  style={styles.legalFooterLink}
                  onPress={() => router.push('/support/terms')}
                >
                  {t('auth.termsLink')}
                </Text>
                <Text style={styles.legalFooterText}>・</Text>
                <Text
                  style={styles.legalFooterLink}
                  onPress={() => router.push('/support/privacy-policy')}
                >
                  {t('auth.privacyLink')}
                </Text>
              </Text>
            </View>
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
  logoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
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
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1a1a2e',
    letterSpacing: -0.5,
  },
  appTagline: {
    fontSize: 16,
    color: '#6b6b7b',
    marginTop: 8,
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
  successContainer: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  successText: {
    color: '#16a34a',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  inputGroup: {
    gap: 12,
    marginBottom: 24,
  },
  signupNotice: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e2ea',
    padding: 16,
    marginBottom: 8,
  },
  signupNoticeText: {
    fontSize: 14,
    color: '#444',
    textAlign: 'center',
    lineHeight: 21,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e2ea',
    paddingHorizontal: 16,
    height: 52,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a2e',
    height: '100%',
  },
  eyeButton: {
    padding: 4,
    marginLeft: 8,
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
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e2ea',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 13,
    color: '#8a8a9a',
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    borderRadius: 12,
    height: 52,
    gap: 10,
    marginBottom: 12,
  },
  appleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    height: 52,
    borderWidth: 1,
    borderColor: '#e2e2ea',
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
    marginRight: 10,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  emailLoginLink: {
    alignSelf: 'center',
    marginTop: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  emailLoginLinkText: {
    fontSize: 14,
    color: '#6b6b7b',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  forgotButton: {
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 14,
    color: '#6b6b7b',
    textDecorationLine: 'underline',
  },
  switchButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    gap: 6,
  },
  switchText: {
    fontSize: 14,
    color: '#6b6b7b',
  },
  switchAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
    textDecorationLine: 'underline',
  },
  legalFooter: {
    marginTop: 20,
    alignItems: 'center',
  },
  legalFooterText: {
    fontSize: 13,
    color: '#6b6b7b',
    textAlign: 'center',
  },
  legalFooterLink: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
