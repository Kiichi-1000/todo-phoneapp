import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={20} color="#222" />
          <Text style={styles.backText}>戻る</Text>
        </TouchableOpacity>
        <Text style={styles.title}>プライバシーポリシー</Text>
        <Text style={styles.updatedAt}>最終改定日: 2026年3月29日</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. 事業者情報</Text>
          <Text style={styles.body}>
            本アプリ（以下「本サービス」）は、運営者（以下「当社」）が提供します。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>2. 取得する情報</Text>
          <Text style={styles.body}>
            当社は、次の情報を取得する場合があります。{"\n"}
            ・アカウント情報（メールアドレス等）{"\n"}
            ・ユーザーが入力したToDo、スケジュール、設定情報{"\n"}
            ・通知配信に必要な識別情報{"\n"}
            ・障害解析や品質改善に必要な技術情報（端末種別、OSバージョン、ログ情報など）
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>3. 利用目的</Text>
          <Text style={styles.body}>
            取得情報は、以下の目的で利用します。{"\n"}
            ・本サービスの提供、本人認証、データ同期、通知配信{"\n"}
            ・不正利用防止、セキュリティ維持、障害対応{"\n"}
            ・機能改善、利用状況分析、サポート対応{"\n"}
            ・法令または行政機関の要請に基づく対応
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>4. 第三者提供・委託</Text>
          <Text style={styles.body}>
            当社は、法令で認められる場合を除き、本人同意なく個人情報を第三者に提供しません。{"\n"}
            ただし、クラウド基盤・認証・通知配信等の提供に必要な範囲で、適切な委託先に取り扱いを委託することがあります。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>5. 利用者の権利</Text>
          <Text style={styles.body}>
            利用者は、法令の定めに従い、自己情報の開示、訂正、削除、利用停止等を求めることができます。{"\n"}
            請求方法はアプリ内サポート窓口等で案内します。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>6. 保管期間と削除</Text>
          <Text style={styles.body}>
            当社は、利用目的達成に必要な期間、または法令で保存が求められる期間、情報を保管します。{"\n"}
            不要となった情報は、合理的な方法で削除または匿名化します。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>7. 免責・責任の範囲</Text>
          <Text style={styles.body}>
            当社は、民法・消費者契約法その他の法令に反しない範囲で、本サービスに関する損害について責任を負います。{"\n"}
            当社の責めに帰すべき事由による損害賠償責任は、通常生ずべき損害に限られ、当社に故意または重過失がある場合を除き、特別損害や逸失利益は含みません。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>8. 準拠法・裁判管轄</Text>
          <Text style={styles.body}>
            本ポリシーは日本法に準拠します。{"\n"}
            本サービスに関して紛争が生じた場合、法令に別段の定めがある場合を除き、当社所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>9. 改定</Text>
          <Text style={styles.body}>
            本ポリシーは、法令改正やサービス改善に応じて改定されることがあります。重要な変更がある場合は、アプリ内表示等の適切な方法で周知します。
          </Text>
        </View>
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
  updatedAt: {
    marginTop: 6,
    fontSize: 12,
    color: '#777',
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: '#444',
    lineHeight: 21,
  },
});
