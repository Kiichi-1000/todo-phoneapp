import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';

type Section = { title?: string; body: string };

const SECTIONS_JA: Section[] = [
  {
    body:
      'この利用規約（以下「本規約」）は、Synthera（以下「当社」）が提供するモバイルアプリケーション「ToSche」（以下「本アプリ」）の利用条件を定めるものです。本アプリを利用する全てのユーザー（以下「ユーザー」）は、本規約に同意の上、ご利用ください。\n\n本規約は法令の改正、サービス内容の変更等に伴い改定されることがあり、改定の内容に応じてアプリ上で改めて同意をお願いする場合があります（詳細は第17条）。',
  },
  {
    title: '第1条（適用）',
    body:
      '1. 本規約は、ユーザーと当社との間の本アプリの利用に関わる一切の関係に適用されます。\n2. 当社が本アプリ上で掲示する個別規定やガイドラインは、本規約の一部を構成します。\n3. 本規約と個別規定が矛盾する場合は、個別規定が優先されます。',
  },
  {
    title: '第2条（アカウント登録）',
    body:
      '1. ユーザーは、正確かつ最新の情報を提供してアカウント登録を行うものとします。\n2. ユーザーは、自己のアカウント情報（メールアドレス、パスワード等）を適切に管理する責任を負います。\n3. アカウントの第三者への譲渡、貸与、共有は禁止します。\n4. アカウント情報の管理不十分、第三者の使用等による損害について、当社は一切の責任を負いません。',
  },
  {
    title: '第3条（サービス内容）',
    body:
      '1. 本アプリは、日次ToDo管理、スケジュール管理、ルーティン管理等のタスク管理支援サービスを提供します。\n2. 当社は、本アプリの機能追加、変更、削除を、事前の通知なく行うことができるものとします。\n3. 本アプリはタスク管理支援を目的とするものであり、医療・法律・税務等の専門的判断を代替するものではありません。',
  },
  {
    title: '第4条（料金および無料機能）',
    body:
      '1. 本アプリは、以下の基本機能を無料で利用できます。\n・4分割ポストイット、個別ポストイット、手描きノートを含むワークスペース機能\n・スケジュール機能（リスト表示および24時間円形表示）\n・ルーティン機能（朝・昼・夜の各テンプレート）\n・統計機能（達成率の表示）\n・基本設定機能\n\n2. 以下の機能は、有料サブスクリプションプランに加入したユーザーのみ利用できます（詳細は第5条）。\n・AI アシスタント機能（自然言語によるタスク・予定・リマインダー操作）\n・AI エージェント機能（ツール実行による自動操作）\n・目標設定機能（長期目標、年次、半期、月次の階層管理）\n・目標コーチング AI 機能\n\n3. 当社は、合理的な範囲で、無料機能と有料機能の区分を変更できるものとします。重大な変更がある場合は、事前にアプリ内通知またはメール等で告知します。',
  },
  {
    title: '第5条（サブスクリプションプラン）',
    body:
      '1. 当社は、本アプリにおいて以下のサブスクリプションプラン（以下「本プラン」）を提供します。各プランの月額・年額・付与クレジット額は、本アプリ内のサブスクリプション購入画面（以下「Paywall」）に表示します。\n\n・ToSche プラン（月額または年額）\n・AI Standard プラン（月額または年額）\n・AI Pro プラン（月額または年額）\n\n2. 各プランには、毎月一定額相当の AI 利用クレジット（以下「AI クレジット」）が付与されます。AI クレジットは、AI アシスタント機能および目標コーチング機能の利用時に消費されます。\n3. AI クレジットは、付与月の翌月末日まで繰越されます。翌月末日を超えて未使用の残額は失効し、現金等への払戻はできません。\n4. AI クレジットは、Apple ID（iOS）または Google アカウント（Android）単位での残高であり、解約後または別プラン変更後は、当該プランで付与された残額にアクセスできなくなる場合があります。\n5. 同一サブスクリプショングループ（Apple）または定期購入グループ（Google Play）内のプラン間では、各ストアの規約に従い、アップグレードまたはダウングレードが可能です。アップグレードは即時反映され、各プラットフォームにより精算されます。ダウングレードは、現在の請求期間の終了時に反映されます。',
  },
  {
    title: '第6条（自動更新）',
    body:
      '1. 本プランは、自動更新型サブスクリプションです。請求期間（月額プランは1か月、年額プランは1年）の終了日の少なくとも24時間前までに自動更新を解除しない限り、同条件で自動的に更新されます。\n2. 各請求期間の終了の24時間以内に、Apple ID（iOS）または Google アカウント（Android）に登録された支払方法に対し、次の請求期間の料金が請求されます。\n3. 当社は、料金、付与クレジット額、その他の条件を変更することがあります。変更がある場合は、変更が効力を生じる前に、合理的な方法でユーザーに通知します。ユーザーが変更後の条件に同意しない場合は、次回更新前に第7条に定める方法でサブスクリプションを解約することができます。',
  },
  {
    title: '第7条（解約および返金）',
    body:
      '1. サブスクリプションの解約は、購入したプラットフォームの設定画面から行います。\n\n【iOS（Apple）の場合】\n「設定」アプリ →「Apple ID」（画面上部） →「サブスクリプション」→「ToSche」を選択 →「サブスクリプションをキャンセルする」\n\n【Android（Google Play）の場合】\n「Google Play」アプリ → 右上のプロフィールアイコン →「お支払いと定期購入」→「定期購入」→「ToSche」を選択 →「定期購入を解約」\n\n2. 解約手続きを完了した場合、現在の請求期間の終了をもってサブスクリプションが終了します。期間中の機能利用は引き続き可能です。\n3. 本アプリ内で解約操作を完結することはできません。Apple および Google のシステム仕様により、解約は各プラットフォームの設定画面からのみ可能です。\n4. 既に支払い済みの請求期間中の途中解約による日割り返金は、当社からは行いません。返金は各プラットフォームのポリシーに従い、購入元（Apple: https://support.apple.com/ja-jp/HT204084 ／ Google Play: https://support.google.com/googleplay/answer/2479637 ）に直接ご請求ください。\n5. 当社の重大な過失により本プランが利用不可能となった場合、当社は合理的な範囲で日割り相当額の補填（クレジット付与等）を行う場合があります。',
  },
  {
    title: '第8条（無料試用期間）',
    body:
      '1. 当社が無料試用期間付きのプランを提供する場合、その期間と条件は Paywall に表示します。\n2. 無料試用期間は、Apple ID または Google アカウント 1 つにつき本アプリの初回サブスクリプション加入時のみ適用されます。\n3. 無料試用期間中に解約しない場合、試用期間終了時に自動的に有料サブスクリプションへ移行し、登録された支払方法に課金されます。',
  },
  {
    title: '第9条（プロモーションコード）',
    body:
      '1. 当社は、特定のキャンペーン期間または特定ユーザーに対し、プロモーションコードを発行することがあります。\n2. プロモーションコードによる無料利用または割引利用には、コードごとに有効期限その他の条件があります。詳細は配布時に明示します。\n3. プロモーションコードによる利用期間が終了した場合、自動的に通常のサブスクリプション料金が請求されるものではありません（自動移行しない設計です）。',
  },
  {
    title: '第10条（禁止事項）',
    body:
      'ユーザーは、本アプリの利用にあたり、以下の行為を行ってはなりません。\n\n1. 法令または公序良俗に違反する行為\n2. 犯罪行為に関連する行為\n3. 当社のサーバーまたはネットワークの機能を妨害する行為\n4. 本アプリの運営を妨害するおそれのある行為\n5. 他のユーザーまたは第三者の知的財産権、プライバシー、名誉その他の権利を侵害する行為\n6. 本アプリのリバースエンジニアリング、逆コンパイル、逆アセンブル\n7. 不正アクセスまたはこれを試みる行為\n8. 自動化ツール等による大量アクセスまたはデータ収集\n9. 本アプリを通じた営利目的の宣伝、広告、勧誘\n10. その他、当社が不適切と判断する行為',
  },
  {
    title: '第11条（利用制限および登録抹消）',
    body:
      '1. 当社は、ユーザーが以下のいずれかに該当する場合、事前の通知なく、アカウントの利用制限または登録抹消を行うことができます。\n\n・本規約のいずれかの条項に違反した場合\n・登録情報に虚偽の事実があることが判明した場合\n・長期間にわたりアカウントが利用されていない場合\n・その他、当社がサービスの利用を適当でないと判断した場合\n\n2. 当社は、本条に基づく措置によりユーザーに生じた損害について、一切の責任を負いません。',
  },
  {
    title: '第12条（サービスの停止・中断）',
    body:
      '1. 当社は、以下のいずれかに該当する場合、事前の通知なく本アプリの全部または一部の提供を停止または中断することができます。\n\n・システムの保守点検または更新を行う場合\n・地震、落雷、火災、停電等の不可抗力により提供が困難な場合\n・第三者サービス（クラウド基盤、認証基盤等）の障害が発生した場合\n・その他、当社が停止または中断を必要と判断した場合\n\n2. 当社は、サービスの停止または中断によりユーザーまたは第三者に生じた損害について、当社に故意または重過失がある場合を除き、一切の責任を負いません。',
  },
  {
    title: '第13条（知的財産権）',
    body:
      '1. 本アプリに関する著作権、商標権その他の知的財産権は、当社または正当な権利者に帰属します。\n2. ユーザーが本アプリに入力・保存したコンテンツ（ToDo、スケジュール等）の権利はユーザーに帰属します。\n3. ユーザーは、当社に対し、サービス提供に必要な範囲でユーザーコンテンツを利用する非独占的な許諾を与えるものとします。',
  },
  {
    title: '第14条（免責事項）',
    body:
      '1. 当社は、本アプリに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、有効性、特定目的への適合性を含みますが、これらに限りません）がないことを明示的にも黙示的にも保証しません。\n2. 当社は、本アプリの利用によりユーザーに生じた損害について、当社に故意または重過失がある場合を除き、一切の責任を負いません。\n3. 当社がユーザーに対して損害賠償責任を負う場合であっても、その範囲は、当社の責めに帰すべき事由により直接かつ通常生ずべき範囲の損害に限り、特別損害、逸失利益、間接損害は含みません。ただし、当社に故意または重過失がある場合はこの限りではありません。\n4. 当社は、ユーザー間またはユーザーと第三者との間で生じたトラブルについて、一切関与しません。',
  },
  {
    title: '第15条（データの取扱い）',
    body:
      '1. ユーザーが本アプリに保存したデータ（ToDo、スケジュール、ルーティン等）は、当社が利用するクラウド基盤上に保管されます。\n2. 当社は、データの保全に合理的な努力を行いますが、データの消失、毀損について完全な保証はいたしません。\n3. ユーザーは、重要なデータについて自己の責任でバックアップを取得することを推奨します。\n4. アカウント削除時は、当該ユーザーに紐づくデータを合理的な期間内に削除します。',
  },
  {
    title: '第16条（通知機能）',
    body:
      '1. 本アプリは、リマインダー等の機能においてプッシュ通知を使用します。\n2. 通知の受信には端末の通知許可が必要です。\n3. 通信環境、端末設定、OS仕様等により、通知が遅延または届かない場合があります。当社はこれにより生じた損害について責任を負いません。',
  },
  {
    title: '第17条（規約の変更）',
    body:
      '1. 当社は、法令の改正、本アプリの運営上・技術上の必要性、サービス内容の追加・変更等に応じて、本規約を随時改定することがあります。\n2. 改定後の本規約は、本アプリ内、当社Webサイトその他当社が適当と判断する方法で公表し、公表内容に定める効力発生日に効力を生じます。重要な変更がある場合は、公表に加え、アプリ内通知等で周知するよう努めます。\n3. 当社は、改定の内容に応じて、法令上必要な場合または当社が合理的に必要と判断する場合、ユーザーに対しアプリ上の操作その他の方法により、改定後の本規約への同意を改めて求めることがあります。ユーザーが当該同意を完了しない場合、本アプリの利用の全部または一部を停止または制限することがあります。\n4. 当社が本条3に基づく同意の取得を求めない改定については、改定後の本規約の効力発生日以降にユーザーが本アプリを利用した場合、ユーザーは改定後の規約に同意したものとみなします。',
  },
  {
    title: '第18条（個人情報の取扱い）',
    body: 'ユーザーの個人情報の取扱いについては、別途定めるプライバシーポリシーに従います。',
  },
  {
    title: '第19条（準拠法・裁判管轄）',
    body:
      '1. 本規約の解釈は、日本法に準拠するものとします。\n2. 本アプリに関して紛争が生じた場合、法令に別段の定めがある場合を除き、当社所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。',
  },
  {
    title: '第20条（お問い合わせ）',
    body:
      '本規約に関するお問い合わせは、以下の窓口までお願いいたします。\n\n提供者: Synthera\nメール: support@synthera.jp\nWebサイト: https://www.synthera.jp/contact',
  },
];

const SECTIONS_EN: Section[] = [
  {
    body:
      'These Terms of Service (the "Terms") set out the conditions for using the mobile application "ToSche" (the "App") provided by Synthera ("we" or "us"). All users of the App ("Users") must agree to these Terms before using it.\n\nThese Terms may be revised in connection with changes in laws, service content, or other circumstances; depending on the change, you may be asked to agree again from within the App (see Section 17).',
  },
  {
    title: 'Section 1 (Application)',
    body:
      '1. These Terms apply to all relationships between Users and us regarding the App.\n2. Any individual rules or guidelines we post within the App form part of these Terms.\n3. If these Terms conflict with any individual rule, the individual rule prevails.',
  },
  {
    title: 'Section 2 (Account Registration)',
    body:
      '1. Users shall register their account with accurate and up-to-date information.\n2. Users are responsible for properly managing their account information (email, password, etc.).\n3. Transferring, lending, or sharing accounts with third parties is prohibited.\n4. We bear no responsibility for damages caused by inadequate management of account information or use by third parties.',
  },
  {
    title: 'Section 3 (Services)',
    body:
      '1. The App provides task-management support services such as daily todos, schedules, and routines.\n2. We may add, change, or remove App features at any time without prior notice.\n3. The App is intended only as task-management support and is not a substitute for professional judgment in fields such as medicine, law, or tax.',
  },
  {
    title: 'Section 4 (Fees and Free Features)',
    body:
      "1. The following features of the App are available free of charge:\n• Workspace features including 4-grid post-its, individual post-its, and handwritten notes\n• Schedule features (list view and 24-hour circular view)\n• Routine features (morning / daytime / evening templates)\n• Statistics (completion rate display)\n• Basic settings\n\n2. The following features are available only to users subscribed to a paid plan (see Section 5):\n• AI assistant (natural-language operation of tasks, schedules, and reminders)\n• AI agent features (automatic operations via tool execution)\n• Goals (long-term, yearly, half-year, and monthly hierarchical management)\n• Goal-coaching AI\n\n3. We may change the boundary between free and paid features within a reasonable scope. For significant changes, we will notify users in advance via in-app notification or email.",
  },
  {
    title: 'Section 5 (Subscription Plans)',
    body:
      '1. We provide the following subscription plans (the "Plans") in the App. The monthly, yearly, and credit grant amounts for each plan are displayed on the in-app subscription purchase screen (the "Paywall").\n\n• ToSche Plan (monthly or yearly)\n• AI Standard Plan (monthly or yearly)\n• AI Pro Plan (monthly or yearly)\n\n2. Each Plan grants a monthly AI usage credit (the "AI Credit") equivalent to a fixed amount. AI Credits are consumed when using AI assistant and goal-coaching features.\n3. AI Credits roll over until the end of the month following the grant. Any unused balance after that period expires and is not refundable in cash or equivalents.\n4. AI Credits are held against an Apple ID (iOS) or Google account (Android). After cancellation or plan change, you may lose access to the remaining balance granted by the previous plan.\n5. Within the same subscription group (Apple) or subscription group (Google Play), upgrades and downgrades are possible per the respective store\'s rules. Upgrades take effect immediately and are prorated by the platform. Downgrades take effect at the end of the current billing period.',
  },
  {
    title: 'Section 6 (Auto-Renewal)',
    body:
      "1. The Plans are auto-renewing subscriptions. Unless auto-renewal is canceled at least 24 hours before the end of the current billing period (1 month for monthly plans, 1 year for yearly plans), the subscription will automatically renew under the same terms.\n2. Within 24 hours of the end of each billing period, the payment method registered to your Apple ID (iOS) or Google account (Android) will be charged for the next period.\n3. We may change pricing, credit grant amounts, or other terms. If we do, we will notify users in advance by a reasonable method. If you do not agree to the new terms, you may cancel before the next renewal as set out in Section 7.",
  },
  {
    title: 'Section 7 (Cancellation and Refunds)',
    body:
      "1. Cancellation is performed from the settings of the platform where you purchased.\n\n[iOS (Apple)]\nOpen Settings app → Apple ID (top of screen) → Subscriptions → ToSche → Cancel Subscription\n\n[Android (Google Play)]\nOpen the Google Play app → profile icon (top right) → Payments & subscriptions → Subscriptions → ToSche → Cancel subscription\n\n2. Once canceled, the subscription remains active until the end of the current billing period. Features remain usable during that period.\n3. You cannot complete cancellation entirely from within the App. By Apple's and Google's design, cancellation is only possible from each platform's settings.\n4. We do not provide prorated refunds for mid-period cancellation. Refunds follow each platform's policy and must be directed to the place of purchase (Apple: https://support.apple.com/en-us/HT204084 / Google Play: https://support.google.com/googleplay/answer/2479637).\n5. If a Plan becomes unusable due to our gross negligence, we may, within reasonable scope, compensate with credit equivalent to the prorated period.",
  },
  {
    title: 'Section 8 (Free Trial)',
    body:
      "1. If we offer a Plan with a free trial, its duration and conditions are displayed on the Paywall.\n2. The free trial applies only to the user's first subscription per Apple ID or Google account.\n3. If you do not cancel during the trial period, you will automatically transition to the paid subscription and your registered payment method will be charged at the end of the trial.",
  },
  {
    title: 'Section 9 (Promotional Codes)',
    body:
      '1. We may issue promotional codes for specific campaigns or users.\n2. Free use or discounts via promotional codes are subject to expiration dates and other conditions per code. Details are presented at issuance.\n3. When the promotional usage period ends, no automatic transition to paid subscription occurs (no auto-migration).',
  },
  {
    title: 'Section 10 (Prohibited Acts)',
    body:
      'Users must not engage in any of the following when using the App:\n\n1. Acts that violate laws or public order and morals\n2. Acts related to criminal activity\n3. Acts that interfere with our servers or network\n4. Acts that may interfere with the operation of the App\n5. Acts that infringe the intellectual property, privacy, reputation, or other rights of other Users or third parties\n6. Reverse-engineering, decompiling, or disassembling the App\n7. Unauthorized access or attempts thereof\n8. Mass access or data collection via automated tools\n9. Commercial advertising, promotion, or solicitation through the App\n10. Any other act we deem inappropriate',
  },
  {
    title: 'Section 11 (Restriction and Termination)',
    body:
      '1. We may, without prior notice, restrict use of an account or terminate registration if a User:\n\n• Violates any provision of these Terms\n• Has registered information found to be false\n• Has not used the account for a long period\n• Otherwise is judged unsuitable by us\n\n2. We bear no responsibility for any damages incurred by Users as a result of measures under this section.',
  },
  {
    title: 'Section 12 (Suspension)',
    body:
      '1. We may suspend or interrupt the App, in whole or in part, without prior notice when:\n\n• Performing system maintenance or updates\n• Provision becomes difficult due to force majeure (earthquakes, lightning, fire, power outages, etc.)\n• Failures occur in third-party services (cloud, authentication, etc.)\n• We otherwise determine suspension is necessary\n\n2. Except in cases of our willful misconduct or gross negligence, we bear no responsibility for damages caused to Users or third parties by such suspension.',
  },
  {
    title: 'Section 13 (Intellectual Property)',
    body:
      '1. Copyright, trademark, and other intellectual property rights related to the App belong to us or rightful owners.\n2. Rights to content (todos, schedules, etc.) entered or saved by Users belong to the User.\n3. Users grant us a non-exclusive license to use such content as needed to provide the service.',
  },
  {
    title: 'Section 14 (Disclaimer)',
    body:
      '1. We make no express or implied warranty that the App is free from defects in fact or law (including security, reliability, accuracy, completeness, validity, or fitness for a particular purpose).\n2. Except in cases of our willful misconduct or gross negligence, we bear no responsibility for damages incurred by Users through use of the App.\n3. Even where we are liable, our liability is limited to direct and ordinarily anticipated damages caused by reasons attributable to us, and does not include special damages, lost profits, or indirect damages — except in cases of our willful misconduct or gross negligence.\n4. We are not involved in disputes between Users or between a User and a third party.',
  },
  {
    title: 'Section 15 (Data Handling)',
    body:
      '1. Data saved in the App by Users (todos, schedules, routines, etc.) is stored on the cloud infrastructure we use.\n2. We make reasonable efforts to preserve data but do not fully guarantee against loss or corruption.\n3. We recommend that Users back up important data at their own responsibility.\n4. Upon account deletion, data associated with that User will be deleted within a reasonable period.',
  },
  {
    title: 'Section 16 (Notifications)',
    body:
      '1. The App uses push notifications for features such as reminders.\n2. Receiving notifications requires notification permission on the device.\n3. Notifications may be delayed or fail due to network conditions, device settings, or OS specifications. We bear no responsibility for damages arising therefrom.',
  },
  {
    title: 'Section 17 (Changes to Terms)',
    body:
      '1. We may revise these Terms from time to time as needed in light of legal changes, operational or technical needs, or service changes.\n2. The revised Terms take effect from the effective date stated when published in the App, on our website, or by another means we deem appropriate. For significant changes, we will additionally make efforts to notify Users via in-app notice.\n3. Where required by law or where we reasonably determine necessary, we may ask Users to agree again to the revised Terms via an action in the App or other means. If a User does not complete that consent, all or part of the App may be suspended or restricted.\n4. For revisions where consent is not requested under paragraph 3 above, a User who uses the App on or after the effective date is deemed to have agreed to the revised Terms.',
  },
  {
    title: 'Section 18 (Personal Information)',
    body: 'Handling of personal information is governed by our separately defined Privacy Policy.',
  },
  {
    title: 'Section 19 (Governing Law and Jurisdiction)',
    body:
      '1. These Terms shall be governed by the laws of Japan.\n2. In the event of a dispute, except where laws provide otherwise, the courts having jurisdiction over our location shall have exclusive jurisdiction as the court of first instance.',
  },
  {
    title: 'Section 20 (Contact)',
    body:
      'For inquiries regarding these Terms, please contact:\n\nProvider: Synthera\nEmail: support@synthera.jp\nWebsite: https://www.synthera.jp/contact',
  },
];

export default function TermsScreen() {
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
        <Text style={styles.title}>{t('support.termsTitle')}</Text>
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
