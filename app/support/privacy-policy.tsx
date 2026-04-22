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
        <Text style={styles.updatedAt}>最終改定日: 2026年4月22日</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.body}>
            Synthera（以下「当社」）は、モバイルアプリケーション「ToSche」（以下「本アプリ」）におけるユーザーの個人情報の取扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」）を定めます。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. 事業者情報</Text>
          <Text style={styles.body}>
            提供者: Synthera{"\n"}
            メール: support@synthera.jp{"\n"}
            Webサイト: https://www.synthera.jp
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>2. 取得する情報</Text>
          <Text style={styles.body}>
            当社は、本アプリの提供にあたり、以下の情報を取得します。{"\n\n"}
            (1) ユーザーが直接提供する情報{"\n"}
            ・アカウント情報（メールアドレス、パスワード）{"\n"}
            ・Google認証を利用する場合のアカウント情報{"\n"}
            ・ユーザーが入力したコンテンツ（ToDo、スケジュール、ルーティン、ワークスペース設定等）{"\n\n"}
            (2) 自動的に取得する情報{"\n"}
            ・端末識別情報（プッシュ通知用トークン）{"\n"}
            ・端末の種類、OSバージョン{"\n"}
            ・アプリの利用状況（エラーログ、クラッシュレポート）{"\n"}
            ・利用日時、アクセスログ{"\n\n"}
            (3) 取得しない情報{"\n"}
            ・位置情報{"\n"}
            ・連絡先、写真、カメラへのアクセス（本アプリでは使用しません）
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>3. 利用目的</Text>
          <Text style={styles.body}>
            取得した情報は、以下の目的のためにのみ利用します。{"\n\n"}
            ・本アプリの提供、運営、改善{"\n"}
            ・ユーザー認証、アカウント管理{"\n"}
            ・データの同期、保存、復元{"\n"}
            ・プッシュ通知によるリマインダー配信{"\n"}
            ・不正利用の防止、セキュリティの維持{"\n"}
            ・障害の検知、解析、対応{"\n"}
            ・ユーザーサポートへの対応{"\n"}
            ・利用規約違反への対応{"\n"}
            ・法令または行政機関の要請に基づく対応
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>4. 第三者提供</Text>
          <Text style={styles.body}>
            当社は、以下の場合を除き、ユーザーの同意なく個人情報を第三者に提供しません。{"\n\n"}
            ・法令に基づく場合{"\n"}
            ・人の生命、身体または財産の保護のために必要がある場合{"\n"}
            ・公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合{"\n"}
            ・国の機関もしくは地方公共団体またはその委託を受けた者が法令の定める事務を遂行することに対して協力する必要がある場合
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>5. 業務委託先</Text>
          <Text style={styles.body}>
            当社は、サービス提供に必要な範囲で、以下の業務委託先にデータの取扱いを委託しています。{"\n\n"}
            ・Supabase（データベース、認証基盤）{"\n"}
            ・Expo / EAS（アプリ配信、プッシュ通知）{"\n"}
            ・Apple（App Store配信、決済処理）{"\n"}
            ・Google（OAuth認証）{"\n\n"}
            各委託先は、それぞれのプライバシーポリシーに基づきデータを取り扱います。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>6. データの保管</Text>
          <Text style={styles.body}>
            1. ユーザーデータは、当社が利用するクラウド基盤（Supabase）上に保管されます。{"\n"}
            2. データの保管期間は、利用目的の達成に必要な期間、または法令により保存が義務付けられる期間とします。{"\n"}
            3. データの保管にあたっては、暗号化通信（TLS）およびアクセス制御等の適切な安全管理措置を講じます。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>7. ユーザーの権利</Text>
          <Text style={styles.body}>
            ユーザーは、個人情報の保護に関する法令に基づき、以下の権利を行使できます。{"\n\n"}
            ・個人情報の開示請求{"\n"}
            ・個人情報の訂正、追加、削除の請求{"\n"}
            ・個人情報の利用停止、消去の請求{"\n"}
            ・個人情報の第三者提供の停止の請求{"\n\n"}
            これらの請求は、アプリ内のお問い合わせ窓口または support@synthera.jp までご連絡ください。本人確認の上、合理的な期間内に対応いたします。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>8. アカウント削除とデータの消去</Text>
          <Text style={styles.body}>
            1. ユーザーは、アプリ内の設定画面から自己のデータを削除できます。{"\n"}
            2. アカウントの完全な削除を希望する場合は、support@synthera.jp までご連絡ください。{"\n"}
            3. アカウント削除後、当該ユーザーに紐づくデータは合理的な期間内に完全に削除されます。ただし、法令により保存が義務付けられるデータはこの限りではありません。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>9. Cookie・トラッキング</Text>
          <Text style={styles.body}>
            本アプリは、Cookieやサードパーティのトラッキングツール（広告ID等）を使用しません。{"\n"}
            App Store提出情報上、米国輸出管理規則（EAR）における「免除対象でない暗号化」の申告は行っておらず、該当する暗号化機能は利用していません。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>10. 未成年者の利用</Text>
          <Text style={styles.body}>
            本アプリは、特に年齢制限を設けていませんが、未成年者が利用する場合は保護者の同意を得た上で利用してください。当社は、未成年者から意図的に個人情報を収集することはありません。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>11. 安全管理措置</Text>
          <Text style={styles.body}>
            当社は、個人情報の漏洩、滅失または毀損の防止のために、以下の措置を講じています。{"\n\n"}
            ・通信の暗号化（TLS/SSL）{"\n"}
            ・パスワードのハッシュ化{"\n"}
            ・アクセス制御の実施{"\n"}
            ・定期的なセキュリティ確認
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>12. 本ポリシーの変更</Text>
          <Text style={styles.body}>
            1. 当社は、法令の改正、サービスの変更その他の事由により、本ポリシーを変更することがあります。{"\n"}
            2. 重要な変更がある場合は、アプリ内表示またはメール等の適切な方法で事前に通知します。{"\n"}
            3. 変更後のポリシーは、アプリ内およびWebサイト上で公開した時点から効力を生じます。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>13. 準拠法・裁判管轄</Text>
          <Text style={styles.body}>
            本ポリシーは日本法に準拠します。本アプリに関して紛争が生じた場合、法令に別段の定めがある場合を除き、当社所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>14. お問い合わせ窓口</Text>
          <Text style={styles.body}>
            本ポリシーに関するお問い合わせは、以下の窓口までお願いいたします。{"\n\n"}
            提供者: Synthera{"\n"}
            メール: support@synthera.jp{"\n"}
            Webサイト: https://www.synthera.jp/contact
          </Text>
        </View>

        <Text style={styles.footer}>以上</Text>
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
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
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
  footer: {
    textAlign: 'center',
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    marginBottom: 20,
  },
});
