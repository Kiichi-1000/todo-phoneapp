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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, Mail, Lock, Eye, EyeOff } from 'lucide-react-native';

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSuccessMessage(null);

    if (!email.trim() || !password.trim()) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    if (!isLogin && password.length < 6) {
      setError('パスワードは6文字以上で入力してください');
      return;
    }

    setLoading(true);

    if (isLogin) {
      const { error: err } = await signIn(email.trim(), password);
      if (err) {
        setError(getErrorMessage(err));
      }
    } else {
      const { error: err } = await signUp(email.trim(), password);
      if (err) {
        setError(getErrorMessage(err));
      } else {
        setSuccessMessage('アカウントを作成しました。ログインしてください。');
        setIsLogin(true);
        setPassword('');
        setConfirmPassword('');
      }
    }

    setLoading(false);
  };

  const getErrorMessage = (err: string): string => {
    if (err.includes('Invalid login credentials')) {
      return 'メールアドレスまたはパスワードが正しくありません';
    }
    if (err.includes('User already registered')) {
      return 'このメールアドレスは既に登録されています';
    }
    if (err.includes('Email rate limit')) {
      return 'しばらく待ってからもう一度お試しください';
    }
    return err;
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError(null);
    setSuccessMessage(null);
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
            <Text style={styles.appName}>FreeTask</Text>
            <Text style={styles.appTagline}>
              {isLogin ? 'おかえりなさい' : 'はじめましょう'}
            </Text>
          </View>

          <View style={styles.formSection}>
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {successMessage && (
              <View style={styles.successContainer}>
                <Text style={styles.successText}>{successMessage}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <View style={styles.inputWrapper}>
                <Mail size={18} color="#8a8a9a" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="メールアドレス"
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
                  placeholder="パスワード"
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

              {!isLogin && (
                <View style={styles.inputWrapper}>
                  <Lock size={18} color="#8a8a9a" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="パスワード（確認）"
                    placeholderTextColor="#8a8a9a"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    textContentType="password"
                    editable={!loading}
                  />
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isLogin ? 'ログイン' : 'アカウント作成'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchButton}
              onPress={switchMode}
              disabled={loading}
            >
              <Text style={styles.switchText}>
                {isLogin
                  ? 'アカウントをお持ちでない方'
                  : '既にアカウントをお持ちの方'}
              </Text>
              <Text style={styles.switchAction}>
                {isLogin ? '新規登録' : 'ログイン'}
              </Text>
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
});
