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
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Mail, ArrowLeft } from 'lucide-react-native';

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    setError(null);

    if (!email.trim()) {
      setError(t('auth.errorEmailRequired'));
      return;
    }

    setLoading(true);
    const { error: err } = await resetPassword(email.trim());
    setLoading(false);

    if (err) {
      if (err.includes('rate limit')) {
        setError(t('auth.errorRateLimit'));
      } else {
        setError(err);
      }
      return;
    }

    setSent(true);
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
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} color="#1a1a2e" />
            <Text style={styles.backText}>{t('auth.backToLogin')}</Text>
          </TouchableOpacity>

          <View style={styles.headingSection}>
            <Text style={styles.title}>{t('auth.resetPasswordTitle')}</Text>
            <Text style={styles.subtitle}>
              {t('auth.resetPasswordSubtitle')}
            </Text>
          </View>

          {sent ? (
            <View style={styles.sentCard}>
              <Text style={styles.sentTitle}>{t('auth.emailSentTitle')}</Text>
              <Text style={styles.sentText}>
                {t('auth.emailSentBody', { email })}
              </Text>
              <Text style={styles.sentNote}>
                {t('auth.emailSentNote')}
              </Text>
              <TouchableOpacity
                style={styles.resendButton}
                onPress={() => {
                  setSent(false);
                  setError(null);
                }}
              >
                <Text style={styles.resendText}>{t('auth.resendEmail')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formSection}>
              {error && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

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

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>{t('auth.sendResetEmail')}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
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
    padding: 24,
    paddingTop: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backText: {
    fontSize: 15,
    color: '#1a1a2e',
    marginLeft: 6,
    fontWeight: '500',
  },
  headingSection: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#6b6b7b',
    lineHeight: 22,
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e2ea',
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 20,
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
  sentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e2ea',
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  sentTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  sentText: {
    fontSize: 15,
    color: '#4a4a5a',
    lineHeight: 22,
    marginBottom: 16,
  },
  sentNote: {
    fontSize: 13,
    color: '#8a8a9a',
    lineHeight: 19,
    marginBottom: 20,
  },
  resendButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  resendText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
    textDecorationLine: 'underline',
  },
});
