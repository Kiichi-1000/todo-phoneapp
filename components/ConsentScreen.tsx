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

interface Props {
  onAccept: () => void;
}

export default function ConsentScreen({ onAccept }: Props) {
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
          <Text style={styles.appTagline}>ご利用にあたって</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardText}>
            ToScheをご利用いただくには、以下の利用規約およびプライバシーポリシーへの同意が必要です。内容をご確認の上、チェックを入れてください。{"\n\n"}
            利用規約は将来改定されることがあり、その内容に応じてアプリ上で再度同意をお願いすることがあります（利用規約第12条）。
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
              <Text
                style={styles.link}
                onPress={() => Linking.openURL(getLegalTermsUrl())}
              >
                利用規約
              </Text>
              に同意する
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
              <Text
                style={styles.link}
                onPress={() => Linking.openURL(getLegalPrivacyUrl())}
              >
                プライバシーポリシー
              </Text>
              に同意する
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.acceptButton, !canAccept && styles.acceptButtonDisabled]}
          onPress={onAccept}
          disabled={!canAccept}
        >
          <Text style={styles.acceptButtonText}>同意して始める</Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          上記リンクはブラウザで掲載ページを開きます。同意後は設定画面からアプリ内表示・同じ掲載先からもご確認いただけます。
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
