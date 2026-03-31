import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

export default function UsageGuideScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={20} color="#222" />
          <Text style={styles.backText}>戻る</Text>
        </TouchableOpacity>
        <Text style={styles.title}>使い方ガイド</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. 基本の流れ</Text>
          <Text style={styles.body}>
            FreeTaskは日ごとにワークスペースを作成し、ToDoを整理・完了管理するアプリです。{"\n"}
            まず「ワークスペース」でタスクを追加し、必要に応じてリマインダーを設定してください。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>2. ワークスペースの使い方</Text>
          <Text style={styles.body}>
            ・日付ごとにページが作成され、左右スワイプで移動できます。{"\n"}
            ・4分割モードではエリアごとにタスクを整理できます。{"\n"}
            ・チェックを付けると完了として記録され、統計に反映されます。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>3. スケジュール連携</Text>
          <Text style={styles.body}>
            設定の「ToDo リマインダー同期」を有効にすると、リマインダー付きToDoがスケジュール画面に反映されます。{"\n"}
            同期設定をオフにした場合でも、既に作成済みのスケジュールは自動削除されません。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>4. データの取り扱い</Text>
          <Text style={styles.body}>
            データはユーザーの操作に基づいて保存・更新されます。{"\n"}
            誤操作防止のため、重要操作（全データ削除など）では確認ダイアログが表示されます。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>5. ご利用上の注意</Text>
          <Text style={styles.body}>
            本アプリはタスク管理支援を目的とするものであり、医療・法律・税務等の専門判断を代替するものではありません。{"\n"}
            端末故障、通信障害、外部サービス障害等により、表示遅延・同期遅延が生じる場合があります。
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
