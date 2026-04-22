import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

export default function TermsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={20} color="#222" />
          <Text style={styles.backText}>戻る</Text>
        </TouchableOpacity>
        <Text style={styles.title}>利用規約</Text>
        <Text style={styles.updatedAt}>最終改定日: 2026年4月22日</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.body}>
            この利用規約（以下「本規約」）は、Synthera（以下「当社」）が提供するモバイルアプリケーション「ToSche」（以下「本アプリ」）の利用条件を定めるものです。本アプリを利用する全てのユーザー（以下「ユーザー」）は、本規約に同意の上、ご利用ください。{"\n\n"}
            本規約は法令の改正、サービス内容の変更等に伴い改定されることがあり、改定の内容に応じてアプリ上で改めて同意をお願いする場合があります（詳細は第12条）。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第1条（適用）</Text>
          <Text style={styles.body}>
            1. 本規約は、ユーザーと当社との間の本アプリの利用に関わる一切の関係に適用されます。{"\n"}
            2. 当社が本アプリ上で掲示する個別規定やガイドラインは、本規約の一部を構成します。{"\n"}
            3. 本規約と個別規定が矛盾する場合は、個別規定が優先されます。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第2条（アカウント登録）</Text>
          <Text style={styles.body}>
            1. ユーザーは、正確かつ最新の情報を提供してアカウント登録を行うものとします。{"\n"}
            2. ユーザーは、自己のアカウント情報（メールアドレス、パスワード等）を適切に管理する責任を負います。{"\n"}
            3. アカウントの第三者への譲渡、貸与、共有は禁止します。{"\n"}
            4. アカウント情報の管理不十分、第三者の使用等による損害について、当社は一切の責任を負いません。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第3条（サービス内容）</Text>
          <Text style={styles.body}>
            1. 本アプリは、日次ToDo管理、スケジュール管理、ルーティン管理等のタスク管理支援サービスを提供します。{"\n"}
            2. 当社は、本アプリの機能追加、変更、削除を、事前の通知なく行うことができるものとします。{"\n"}
            3. 本アプリはタスク管理支援を目的とするものであり、医療・法律・税務等の専門的判断を代替するものではありません。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第4条（料金）</Text>
          <Text style={styles.body}>
            1. 本アプリの基本機能は無料で利用できます。{"\n"}
            2. 当社は、一部有料の追加機能（プレミアム機能）を提供する場合があります。{"\n"}
            3. 有料機能の料金、支払方法、更新・解約条件は、当該機能の購入画面で明示します。{"\n"}
            4. App Store経由の購入に関する返金は、Appleの返金ポリシーに従います。{"\n"}
            5. 料金の変更がある場合は、事前に適切な方法で通知します。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第5条（禁止事項）</Text>
          <Text style={styles.body}>
            ユーザーは、本アプリの利用にあたり、以下の行為を行ってはなりません。{"\n\n"}
            1. 法令または公序良俗に違反する行為{"\n"}
            2. 犯罪行為に関連する行為{"\n"}
            3. 当社のサーバーまたはネットワークの機能を妨害する行為{"\n"}
            4. 本アプリの運営を妨害するおそれのある行為{"\n"}
            5. 他のユーザーまたは第三者の知的財産権、プライバシー、名誉その他の権利を侵害する行為{"\n"}
            6. 本アプリのリバースエンジニアリング、逆コンパイル、逆アセンブル{"\n"}
            7. 不正アクセスまたはこれを試みる行為{"\n"}
            8. 自動化ツール等による大量アクセスまたはデータ収集{"\n"}
            9. 本アプリを通じた営利目的の宣伝、広告、勧誘{"\n"}
            10. その他、当社が不適切と判断する行為
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第6条（利用制限および登録抹消）</Text>
          <Text style={styles.body}>
            1. 当社は、ユーザーが以下のいずれかに該当する場合、事前の通知なく、アカウントの利用制限または登録抹消を行うことができます。{"\n\n"}
            ・本規約のいずれかの条項に違反した場合{"\n"}
            ・登録情報に虚偽の事実があることが判明した場合{"\n"}
            ・長期間にわたりアカウントが利用されていない場合{"\n"}
            ・その他、当社がサービスの利用を適当でないと判断した場合{"\n\n"}
            2. 当社は、本条に基づく措置によりユーザーに生じた損害について、一切の責任を負いません。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第7条（サービスの停止・中断）</Text>
          <Text style={styles.body}>
            1. 当社は、以下のいずれかに該当する場合、事前の通知なく本アプリの全部または一部の提供を停止または中断することができます。{"\n\n"}
            ・システムの保守点検または更新を行う場合{"\n"}
            ・地震、落雷、火災、停電等の不可抗力により提供が困難な場合{"\n"}
            ・第三者サービス（クラウド基盤、認証基盤等）の障害が発生した場合{"\n"}
            ・その他、当社が停止または中断を必要と判断した場合{"\n\n"}
            2. 当社は、サービスの停止または中断によりユーザーまたは第三者に生じた損害について、当社に故意または重過失がある場合を除き、一切の責任を負いません。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第8条（知的財産権）</Text>
          <Text style={styles.body}>
            1. 本アプリに関する著作権、商標権その他の知的財産権は、当社または正当な権利者に帰属します。{"\n"}
            2. ユーザーが本アプリに入力・保存したコンテンツ（ToDo、スケジュール等）の権利はユーザーに帰属します。{"\n"}
            3. ユーザーは、当社に対し、サービス提供に必要な範囲でユーザーコンテンツを利用する非独占的な許諾を与えるものとします。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第9条（免責事項）</Text>
          <Text style={styles.body}>
            1. 当社は、本アプリに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、有効性、特定目的への適合性を含みますが、これらに限りません）がないことを明示的にも黙示的にも保証しません。{"\n"}
            2. 当社は、本アプリの利用によりユーザーに生じた損害について、当社に故意または重過失がある場合を除き、一切の責任を負いません。{"\n"}
            3. 当社がユーザーに対して損害賠償責任を負う場合であっても、その範囲は、当社の責めに帰すべき事由により直接かつ通常生ずべき範囲の損害に限り、特別損害、逸失利益、間接損害は含みません。ただし、当社に故意または重過失がある場合はこの限りではありません。{"\n"}
            4. 当社は、ユーザー間またはユーザーと第三者との間で生じたトラブルについて、一切関与しません。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第10条（データの取扱い）</Text>
          <Text style={styles.body}>
            1. ユーザーが本アプリに保存したデータ（ToDo、スケジュール、ルーティン等）は、当社が利用するクラウド基盤上に保管されます。{"\n"}
            2. 当社は、データの保全に合理的な努力を行いますが、データの消失、毀損について完全な保証はいたしません。{"\n"}
            3. ユーザーは、重要なデータについて自己の責任でバックアップを取得することを推奨します。{"\n"}
            4. アカウント削除時は、当該ユーザーに紐づくデータを合理的な期間内に削除します。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第11条（通知機能）</Text>
          <Text style={styles.body}>
            1. 本アプリは、リマインダー等の機能においてプッシュ通知を使用します。{"\n"}
            2. 通知の受信には端末の通知許可が必要です。{"\n"}
            3. 通信環境、端末設定、OS仕様等により、通知が遅延または届かない場合があります。当社はこれにより生じた損害について責任を負いません。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第12条（規約の変更）</Text>
          <Text style={styles.body}>
            1. 当社は、法令の改正、本アプリの運営上・技術上の必要性、サービス内容の追加・変更等に応じて、本規約を随時改定することがあります。{"\n"}
            2. 改定後の本規約は、本アプリ内、当社Webサイトその他当社が適当と判断する方法で公表し、公表内容に定める効力発生日に効力を生じます。重要な変更がある場合は、公表に加え、アプリ内通知等で周知するよう努めます。{"\n"}
            3. 当社は、改定の内容に応じて、法令上必要な場合または当社が合理的に必要と判断する場合、ユーザーに対しアプリ上の操作その他の方法により、改定後の本規約への同意を改めて求めることがあります。ユーザーが当該同意を完了しない場合、本アプリの利用の全部または一部を停止または制限することがあります。{"\n"}
            4. 当社が本条3に基づく同意の取得を求めない改定については、改定後の本規約の効力発生日以降にユーザーが本アプリを利用した場合、ユーザーは改定後の規約に同意したものとみなします。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第13条（個人情報の取扱い）</Text>
          <Text style={styles.body}>
            ユーザーの個人情報の取扱いについては、別途定めるプライバシーポリシーに従います。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第14条（準拠法・裁判管轄）</Text>
          <Text style={styles.body}>
            1. 本規約の解釈は、日本法に準拠するものとします。{"\n"}
            2. 本アプリに関して紛争が生じた場合、法令に別段の定めがある場合を除き、当社所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>第15条（お問い合わせ）</Text>
          <Text style={styles.body}>
            本規約に関するお問い合わせは、以下の窓口までお願いいたします。{"\n\n"}
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
