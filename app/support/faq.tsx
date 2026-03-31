import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

const FAQ_ITEMS = [
  {
    question: 'Q. データはどこに保存されますか？',
    answer:
      'A. 入力したToDoや設定は、アプリ提供のクラウド基盤に保存されます。ログイン情報や通知情報も、サービス提供に必要な範囲で管理されます。',
  },
  {
    question: 'Q. 誤って削除したデータは復元できますか？',
    answer:
      'A. 状況により復元できない場合があります。重要データは定期的なエクスポートを推奨します。',
  },
  {
    question: 'Q. 通知が届かない場合は？',
    answer:
      'A. 端末の通知設定、アプリの通知許可、ネットワーク状態、バッテリー最適化設定をご確認ください。',
  },
  {
    question: 'Q. サービスが一時的に使えない場合がありますか？',
    answer:
      'A. メンテナンス、通信障害、外部サービス障害などにより、一時的に利用できない場合があります。復旧に努めます。',
  },
  {
    question: 'Q. 料金や返金の扱いは？',
    answer:
      'A. 有料機能を導入した場合は、購入画面または別途規約で料金・更新・解約・返金条件を明示します。消費者保護法令に反する運用は行いません。',
  },
  {
    question: 'Q. 事故や損害が発生した場合の責任は？',
    answer:
      'A. 当社は法令に従って責任を負います。当社に故意または重過失がある場合を除き、通常生ずべき範囲の損害を基準に対応します。',
  },
  {
    question: 'Q. 問い合わせはどうすればよいですか？',
    answer:
      'A. アプリ内のサポート導線からお問い合わせください。内容確認後、順次対応します。',
  },
];

export default function FaqScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={20} color="#222" />
          <Text style={styles.backText}>戻る</Text>
        </TouchableOpacity>
        <Text style={styles.title}>FAQ</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {FAQ_ITEMS.map((item) => (
          <View key={item.question} style={styles.card}>
            <Text style={styles.question}>{item.question}</Text>
            <Text style={styles.answer}>{item.answer}</Text>
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
