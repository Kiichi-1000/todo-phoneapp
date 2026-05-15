import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpen, Square, CheckSquare } from 'lucide-react-native';
import { getLegalPrivacyUrl, getLegalTermsUrl } from '@/lib/legalUrls';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  onAccept: () => void;
}

export default function ConsentScreen({ onAccept }: Props) {
  const { t } = useLanguage();
  const [termsChecked, setTermsChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);

  const canAccept = termsChecked && privacyChecked;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.logoSection}>
          <View style={styles.logoContainer}>
            <BookOpen size={40} color="#1a1a2e" />
          </View>
          <Text style={styles.appName}>ToSche</Text>
          <Text style={styles.appTagline}>{t('consent.tagline')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardText}>
            {t('consent.cardBody')}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setTermsChecked(!termsChecked)}
          activeOpacity={0.7}
        >
          {termsChecked ? (
            <CheckSquare size={22} color="#1a1a2e" />
          ) : (
            <Square size={22} color="#999" />
          )}
          <View style={styles.checkTextWrap}>
            <Text style={styles.checkLabel}>
              {t('consent.agreeToTermsPrefix')}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL(getLegalTermsUrl())}
              >
                {t('consent.termsLinkText')}
              </Text>
              {t('consent.agreeToTermsSuffix')}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setPrivacyChecked(!privacyChecked)}
          activeOpacity={0.7}
        >
          {privacyChecked ? (
            <CheckSquare size={22} color="#1a1a2e" />
          ) : (
            <Square size={22} color="#999" />
          )}
          <View style={styles.checkTextWrap}>
            <Text style={styles.checkLabel}>
              {t('consent.agreeToPrivacyPrefix')}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL(getLegalPrivacyUrl())}
              >
                {t('consent.privacyLinkText')}
              </Text>
              {t('consent.agreeToPrivacySuffix')}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.acceptButton, !canAccept && styles.acceptButtonDisabled]}
          onPress={onAccept}
          disabled={!canAccept}
        >
          <Text style={styles.acceptButtonText}>{t('consent.acceptStart')}</Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          {t('consent.footerNote')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f0',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e2e2ea',
  },
  cardText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 22,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e2ea',
  },
  checkTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  checkLabel: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  link: {
    color: '#2563eb',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  acceptButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptButtonDisabled: {
    opacity: 0.4,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footerNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
  },
});
