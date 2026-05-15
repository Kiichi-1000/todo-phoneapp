import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';

type Section = { title?: string; body: string };

const SECTIONS_JA: Section[] = [
  {
    body:
      'Synthera（以下「当社」）は、モバイルアプリケーション「ToSche」（以下「本アプリ」）におけるユーザーの個人情報の取扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」）を定めます。',
  },
  {
    title: '1. 事業者情報',
    body: '提供者: Synthera\nメール: support@synthera.jp\nWebサイト: https://www.synthera.jp',
  },
  {
    title: '2. 取得する情報',
    body:
      '当社は、本アプリの提供にあたり、以下の情報を取得します。\n\n(1) ユーザーが直接提供する情報\n・アカウント情報（メールアドレス、パスワード）\n・Google 認証 / Apple 認証を利用する場合の各プロバイダ提供情報\n・ユーザーが入力したコンテンツ（ToDo、スケジュール、ルーティン、ワークスペース設定、目標、ノート、AI チャット履歴等）\n・AI アシスタント機能で送信されたテキスト（タスク操作の意図解釈に利用）\n・音声入力機能で送信された音声データ（テキスト変換後は音声データを保存しません）\n\n(2) 自動的に取得する情報\n・端末識別情報（プッシュ通知用トークン、サブスクリプション照合用の RevenueCat ID）\n・端末の種類、OS バージョン、言語設定、地域コード\n・アプリの利用状況（エラーログ、クラッシュレポート）\n・利用日時、アクセスログ\n・AI 機能の利用量・コスト計測情報（AI クレジット残高管理のため）\n\n(3) サブスクリプション・決済関連情報\n・購入したプラン種別、契約期間、自動更新の有無\n・購入日時、有効期限、解約日時\n・RevenueCat 経由の購買ステータス通知（Apple ID で照合される匿名 ID）\n・※ 当社はクレジットカード番号、銀行口座番号その他の決済情報を直接取得・保存することはありません。これらは Apple および各 OS の決済基盤によって処理されます。\n\n(4) 取得しない情報\n・位置情報\n・連絡先、写真、カメラへのアクセス\n・端末上の他のアプリの情報\n・広告 ID（IDFA）',
  },
  {
    title: '3. 利用目的',
    body:
      '取得した情報は、以下の目的のためにのみ利用します。\n\n・本アプリの提供、運営、改善\n・ユーザー認証、アカウント管理\n・データの同期、保存、復元\n・プッシュ通知によるリマインダー配信\n・AI アシスタント機能および目標コーチング機能の応答生成\n・AI 利用量の計測およびクレジット残高管理\n・サブスクリプションの管理（購入、更新、解約処理、領収書照合）\n・プロモーションコードの照合および特典付与\n・不正利用の防止、セキュリティの維持\n・障害の検知、解析、対応\n・ユーザーサポートへの対応\n・利用規約違反への対応\n・法令または行政機関の要請に基づく対応',
  },
  {
    title: '4. 第三者提供',
    body:
      '当社は、以下の場合を除き、ユーザーの同意なく個人情報を第三者に提供しません。\n\n・法令に基づく場合\n・人の生命、身体または財産の保護のために必要がある場合\n・公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合\n・国の機関もしくは地方公共団体またはその委託を受けた者が法令の定める事務を遂行することに対して協力する必要がある場合',
  },
  {
    title: '4-2. 第三者 AI サービスへのデータ送信について',
    body:
      '本アプリの AI アシスタント機能および目標コーチング機能を利用する際、以下のデータが第三者の AI モデル提供企業に送信されます。\n\n【送信先】\nAnthropic, PBC（米国デラウェア州法人）\nウェブサイト: https://www.anthropic.com\nプライバシーポリシー: https://www.anthropic.com/legal/privacy\n\n【送信されるデータ】\n・ユーザーが AI チャット欄に入力したテキスト\n・AI が操作の意図を理解するために必要な、現在のタスク・予定・目標等の関連情報（タイトル、日時、内容等）\n・会話の文脈を保つための直近のチャット履歴\n\n【送信されないデータ】\n・パスワード、認証トークン、決済情報\n・位置情報、連絡先、写真、カメラのデータ\n・AI 機能と関係のない他のアプリ内データ\n\n【利用目的】\n送信されたデータは、AI 応答の生成のみに利用されます。\n\n【AI モデルの学習への利用】\nAnthropic, PBC は、API 経由で受信したデータを、自社の AI モデルの学習に使用しないことを公式に表明しています。\n\n【ユーザーの同意取得】\n本アプリは、AI 機能の初回利用時にこれらのデータ送信について明示的な同意をユーザーから取得します。同意しない場合、AI 機能は利用できませんが、AI 機能以外の機能は引き続き利用可能です。\n\n【データの保護】\nデータの送信は TLS（HTTPS）により暗号化されます。',
  },
  {
    title: '4-3. 音声認識サービスへのデータ送信について',
    body:
      '本アプリの音声入力機能を利用する際、以下のデータが第三者の音声認識サービスに送信されます。\n\n【送信先】\nGoogle LLC（米国） — Google Cloud Speech-to-Text\nプライバシーポリシー: https://policies.google.com/privacy\n\n【送信されるデータ】\n・ユーザーが録音した音声データ\n\n【利用目的】\n音声をテキストに変換する目的のみで利用されます。変換完了後、当社およびユーザーの端末側で音声データは保存されません。\n\n【ユーザーの同意取得】\n音声入力機能の利用前に、端末の OS がマイクアクセスの許可をユーザーに求めます。',
  },
  {
    title: '5. 業務委託先',
    body:
      '当社は、サービス提供に必要な範囲で、以下の業務委託先にデータの取扱いを委託しています。\n\n・Supabase（データベース、認証基盤、Edge Functions、データ保管）\n・Expo / EAS（アプリ配信、プッシュ通知配信基盤）\n・Apple（App Store 配信、サブスクリプション課金処理、Apple ID 認証）\n・Google（OAuth 認証、音声認識 [Google Speech-to-Text]）\n・Anthropic（AI アシスタント・目標コーチングの応答生成 [Claude モデル]）\n・RevenueCat（サブスクリプション状態の同期および照合）\n・Cloudflare（法務文書ホスティング）\n\n各委託先は、それぞれのプライバシーポリシーに基づきデータを取り扱います。各社の対応する文書は以下のとおりです（参考）。\n・Supabase: https://supabase.com/privacy\n・Apple: https://www.apple.com/legal/privacy/\n・Google: https://policies.google.com/privacy\n・Anthropic: https://www.anthropic.com/legal/privacy\n・RevenueCat: https://www.revenuecat.com/privacy',
  },
  {
    title: '6. データの保管',
    body:
      '1. ユーザーデータは、当社が利用するクラウド基盤（Supabase）上に保管されます。\n2. データの保管期間は、利用目的の達成に必要な期間、または法令により保存が義務付けられる期間とします。\n3. データの保管にあたっては、暗号化通信（TLS）およびアクセス制御等の適切な安全管理措置を講じます。',
  },
  {
    title: '7. ユーザーの権利',
    body:
      'ユーザーは、個人情報の保護に関する法令に基づき、以下の権利を行使できます。\n\n・個人情報の開示請求\n・個人情報の訂正、追加、削除の請求\n・個人情報の利用停止、消去の請求\n・個人情報の第三者提供の停止の請求\n\nこれらの請求は、アプリ内のお問い合わせ窓口または support@synthera.jp までご連絡ください。本人確認の上、合理的な期間内に対応いたします。',
  },
  {
    title: '8. アカウント削除とデータの消去',
    body:
      '1. ユーザーは、アプリ内の設定画面から自己のデータを削除できます。\n2. アカウントの完全な削除を希望する場合は、support@synthera.jp までご連絡ください。\n3. アカウント削除後、当該ユーザーに紐づくデータは合理的な期間内に完全に削除されます。ただし、法令により保存が義務付けられるデータはこの限りではありません。',
  },
  {
    title: '9. Cookie・トラッキング',
    body:
      '本アプリは、Cookieやサードパーティのトラッキングツール（広告ID等）を使用しません。\nApp Store提出情報上、米国輸出管理規則（EAR）における「免除対象でない暗号化」の申告は行っておらず、該当する暗号化機能は利用していません。',
  },
  {
    title: '10. 未成年者の利用',
    body:
      '本アプリは、特に年齢制限を設けていませんが、未成年者が利用する場合は保護者の同意を得た上で利用してください。当社は、未成年者から意図的に個人情報を収集することはありません。',
  },
  {
    title: '11. 安全管理措置',
    body:
      '当社は、個人情報の漏洩、滅失または毀損の防止のために、以下の措置を講じています。\n\n・通信の暗号化（TLS/SSL）\n・パスワードのハッシュ化\n・アクセス制御の実施\n・定期的なセキュリティ確認',
  },
  {
    title: '12. 本ポリシーの変更',
    body:
      '1. 当社は、法令の改正、サービスの変更その他の事由により、本ポリシーを変更することがあります。\n2. 重要な変更がある場合は、アプリ内表示またはメール等の適切な方法で事前に通知します。\n3. 変更後のポリシーは、アプリ内およびWebサイト上で公開した時点から効力を生じます。',
  },
  {
    title: '13. 準拠法・裁判管轄',
    body:
      '本ポリシーは日本法に準拠します。本アプリに関して紛争が生じた場合、法令に別段の定めがある場合を除き、当社所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。',
  },
  {
    title: '14. お問い合わせ窓口',
    body:
      '本ポリシーに関するお問い合わせは、以下の窓口までお願いいたします。\n\n提供者: Synthera\nメール: support@synthera.jp\nWebサイト: https://www.synthera.jp/contact',
  },
];

const SECTIONS_EN: Section[] = [
  {
    body:
      'Synthera ("we" or "us") sets out the following Privacy Policy (this "Policy") regarding the handling of Users\' personal information in the mobile application "ToSche" (the "App").',
  },
  {
    title: '1. Provider Information',
    body: 'Provider: Synthera\nEmail: support@synthera.jp\nWebsite: https://www.synthera.jp',
  },
  {
    title: '2. Information We Collect',
    body:
      'We collect the following information in connection with providing the App:\n\n(1) Information you provide directly\n• Account information (email address, password)\n• Provider-supplied information when you use Google or Apple authentication\n• Content you enter (todos, schedules, routines, workspace settings, goals, notes, AI chat history, etc.)\n• Text submitted to the AI assistant (used to interpret task-operation intent)\n• Audio submitted via voice input (audio is discarded after transcription; only the transcript is stored)\n\n(2) Information collected automatically\n• Device identifiers (push notification tokens; RevenueCat ID for subscription matching)\n• Device type, OS version, language setting, region code\n• App usage information (error logs, crash reports)\n• Date/time of use, access logs\n• AI usage and cost metrics (for AI credit balance management)\n\n(3) Subscription and payment-related information\n• Plan tier purchased, contract period, auto-renewal status\n• Purchase date, expiration date, cancellation date\n• Purchase status notifications via RevenueCat (anonymous IDs matched against Apple ID)\n• Note: We do NOT directly collect or store credit card numbers, bank account numbers, or other payment credentials. These are processed solely by Apple\'s and each OS\'s payment infrastructure.\n\n(4) Information we do NOT collect\n• Location information\n• Access to contacts, photos, or camera\n• Information about other apps on your device\n• Advertising ID (IDFA)',
  },
  {
    title: '3. Purposes of Use',
    body:
      'We use collected information only for the following purposes:\n\n• Providing, operating, and improving the App\n• User authentication and account management\n• Data sync, storage, and recovery\n• Delivering reminders via push notification\n• Generating AI assistant and goal-coaching responses\n• Measuring AI usage and managing credit balances\n• Subscription management (purchase, renewal, cancellation, receipt verification)\n• Promotional code validation and benefit grant\n• Preventing fraud and maintaining security\n• Detecting, analyzing, and responding to incidents\n• Responding to user support inquiries\n• Addressing violations of the Terms of Service\n• Responding to lawful requests from authorities',
  },
  {
    title: '4. Disclosure to Third Parties',
    body:
      'We do not disclose personal information to third parties without User consent, except in the following cases:\n\n• When required by law\n• When necessary to protect the life, body, or property of a person\n• When particularly necessary to improve public health or promote the sound development of children\n• When cooperation with national or local government bodies (or their delegates) is needed to perform statutory duties',
  },
  {
    title: '5. Service Providers',
    body:
      "To the extent needed to provide the service, we entrust data handling to the following service providers:\n\n• Supabase (database, authentication infrastructure, Edge Functions, data storage)\n• Expo / EAS (app distribution, push notification infrastructure)\n• Apple (App Store distribution, subscription payment processing, Apple ID authentication)\n• Google (OAuth authentication, voice recognition [Google Speech-to-Text])\n• Anthropic (AI assistant and goal-coaching response generation [Claude models])\n• RevenueCat (subscription state synchronization and verification)\n• Cloudflare (legal document hosting)\n\nEach provider handles data in accordance with its own privacy policy. References (for your information):\n• Supabase: https://supabase.com/privacy\n• Apple: https://www.apple.com/legal/privacy/\n• Google: https://policies.google.com/privacy\n• Anthropic: https://www.anthropic.com/legal/privacy\n• RevenueCat: https://www.revenuecat.com/privacy",
  },
  {
    title: '6. Data Storage',
    body:
      '1. User data is stored on cloud infrastructure (Supabase) we use.\n2. The data retention period is the period needed to achieve the purpose of use, or the period required by law.\n3. We apply appropriate safeguards such as encrypted communication (TLS) and access controls.',
  },
  {
    title: '7. Your Rights',
    body:
      'Under applicable personal information protection laws, Users may exercise the following rights:\n\n• Request disclosure of personal information\n• Request correction, addition, or deletion of personal information\n• Request suspension or erasure of use of personal information\n• Request suspension of provision to third parties\n\nTo make such a request, please contact us through the in-app support links or at support@synthera.jp. We will respond within a reasonable period after verifying identity.',
  },
  {
    title: '8. Account Deletion and Data Erasure',
    body:
      '1. Users can delete their own data via the Settings screen in the App.\n2. To request complete deletion of an account, please contact support@synthera.jp.\n3. After account deletion, data associated with that User is fully deleted within a reasonable period, except where retention is required by law.',
  },
  {
    title: '9. Cookies and Tracking',
    body:
      'The App does not use cookies or third-party tracking tools (advertising IDs, etc.).\nIn submissions to the App Store, we have not declared "non-exempt encryption" under U.S. Export Administration Regulations (EAR), and we do not use applicable encryption features.',
  },
  {
    title: '10. Use by Minors',
    body:
      'The App does not impose a specific age limit, but minors should obtain parental consent before using it. We do not intentionally collect personal information from minors.',
  },
  {
    title: '11. Security Measures',
    body:
      'To prevent leakage, loss, or corruption of personal information, we take the following measures:\n\n• Communication encryption (TLS/SSL)\n• Password hashing\n• Access controls\n• Periodic security reviews',
  },
  {
    title: '12. Changes to This Policy',
    body:
      '1. We may change this Policy due to changes in laws, the service, or other reasons.\n2. For significant changes, we will provide advance notice via in-app display, email, or other appropriate means.\n3. The revised Policy takes effect from the time it is published in the App and on our website.',
  },
  {
    title: '13. Governing Law and Jurisdiction',
    body:
      'This Policy is governed by the laws of Japan. In the event of a dispute regarding the App, except where laws provide otherwise, the courts having jurisdiction over our location shall have exclusive jurisdiction as the court of first instance.',
  },
  {
    title: '14. Contact',
    body:
      'For inquiries regarding this Policy, please contact:\n\nProvider: Synthera\nEmail: support@synthera.jp\nWebsite: https://www.synthera.jp/contact',
  },
];

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const sections = lang === 'en' ? SECTIONS_EN : SECTIONS_JA;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={20} color="#222" />
          <Text style={styles.backText}>{t('support.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('support.privacyTitle')}</Text>
        <Text style={styles.updatedAt}>{t('support.termsUpdatedAt')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {sections.map((section, idx) => (
          <View key={idx} style={styles.card}>
            {section.title && <Text style={styles.sectionTitle}>{section.title}</Text>}
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}
        <Text style={styles.footer}>{t('support.footerEnd')}</Text>
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
