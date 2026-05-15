import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';

const FAQ_NUMBERS = [1, 2, 3, 4, 5, 6, 7];

export default function FaqScreen() {
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={20} color="#222" />
          <Text style={styles.backText}>{t('support.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('support.faqTitle')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {FAQ_NUMBERS.map((n) => (
          <View key={n} style={styles.card}>
            <Text style={styles.question}>{t(`support.faq${n}Q`)}</Text>
            <Text style={styles.answer}>{t(`support.faq${n}A`)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  backText: {
    marginLeft: 4,
    fontSize: 14,
    color: '#222',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  question: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
    lineHeight: 22,
  },
  answer: {
    fontSize: 14,
    color: '#444',
    lineHeight: 21,
  },
});
