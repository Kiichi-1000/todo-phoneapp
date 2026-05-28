// AI Integration setup screen — v1.4 USP.
//
// 構成 (2段階):
//   1. 接続先を選ぶ (Claude / ChatGPT)
//   2. 選んだ方だけの「画像つき・超丁寧マニュアル」を表示
//
// 連携が未経験のユーザーが大半なので、各ステップに
//   ・「どこで操作するか」バッジ (ToScheアプリ内 / PCのブラウザ)
//   ・実機スクショ or 再現図 (Figure)
//   ・コピーできる実値
// を必ず添える。両方を1ページに並べると長すぎるので、選択で出し分ける。
//
// MCP API キーは ChatGPT 連携でのみ必要 (Claude は OAuth でキー不要)。
// よってキー生成/一覧は ChatGPT ガイド内に置く。

import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
  TextInput,
  Platform,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  ArrowLeft,
  Bot,
  Box,
  CheckCircle2,
  ChevronRight,
  Copy,
  Edit3,
  ExternalLink,
  Image as ImageIcon,
  KeyRound,
  Monitor,
  MoreHorizontal,
  Search,
  Smartphone,
  Sparkles,
  Terminal,
  Trash2,
  X,
  MessageSquare,
} from 'lucide-react-native';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';
import { track } from '@/lib/posthog';

// Pre-registered OAuth client IDs (see oauth_clients table).
const CLAUDE_WEB_CLIENT_ID = 'tsche_claude_web';
const CLAUDE_CODE_CLIENT_ID = 'tsche_claude_code';

// claude.ai web の custom-connector OAuth discovery 対策で Worker フロント経由。
const CLAUDE_WEB_MCP_URL = 'https://tosche-oauth.kiichitsukui111806.workers.dev';

// ─────────────────────────────────────────────────────────────
// ガイド用スクリーンショット。
// iOS シミュレーターで撮影した実機スクショを assets/images/guide/ に置き、
// ここで require して紐付ける。未撮影のものは null のままにしておくと、
// Figure が「再現図 (children)」または準備中プレースホルダにフォールバックする。
// require() は存在しないファイルだとバンドルが壊れるので、撮影後に差し替える。
// ─────────────────────────────────────────────────────────────
interface McpKey {
  id: string;
  key_prefix: string;
  label: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function getMcpServerUrl(): string {
  const url =
    (Constants.expoConfig?.extra as { supabaseUrl?: string } | undefined)?.supabaseUrl ??
    'https://utfyxsvxyvzxjqcgzjjl.supabase.co';
  return `${url.replace(/\/$/, '')}/functions/v1/mcp-server`;
}
function getOpenApiUrl(): string {
  return `${getMcpServerUrl()}/openapi.json`;
}

type Provider = 'claude' | 'chatgpt';
type ClaudeMode = 'web' | 'cli';

export default function ClaudeIntegrationScreen() {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [claudeMode, setClaudeMode] = useState<ClaudeMode>('web');

  const [keys, setKeys] = useState<McpKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const mcpUrl = getMcpServerUrl();

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mcp-keys', {
        body: { action: 'list' },
      });
      if (error) throw error;
      setKeys((data as { keys: McpKey[] }).keys ?? []);
    } catch (e: any) {
      Alert.alert('読み込み失敗', e?.message ?? 'キー一覧を取得できませんでした');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('mcp-keys', {
        body: { action: 'create', label: newKeyLabel.trim() || null },
      });
      if (error) throw error;
      const key = (data as { key: string }).key;
      setCreatedKey(key);
      setNewKeyLabel('');
      track('mcp_key_generated').catch(() => {});
      await loadKeys();
    } catch (e: any) {
      Alert.alert('生成失敗', e?.message ?? '新規キーを生成できませんでした');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (text: string, label = 'コピーしました') => {
    await Clipboard.setStringAsync(text);
    Alert.alert(label);
  };

  const handleRevoke = (key: McpKey) => {
    Alert.alert(
      'キーを破棄',
      `${key.label ?? key.key_prefix} を破棄します。この後はこのキーを使った接続は即座に使えなくなります。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '破棄',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.functions.invoke('mcp-keys', {
                body: { action: 'revoke', id: key.id },
              });
              if (error) throw error;
              await loadKeys();
            } catch (e: any) {
              Alert.alert('破棄失敗', e?.message ?? String(e));
            }
          },
        },
      ],
    );
  };

  const formatDate = (iso: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const activeKeys = keys.filter((k) => !k.revoked_at);

  // 戻るボタン: ガイド表示中は「接続先の選択」に戻る。選択画面では前画面へ。
  const handleBack = () => {
    if (provider) {
      setProvider(null);
    } else {
      router.back();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.headerBack}>
          <ArrowLeft size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {provider === 'claude'
            ? 'Claude と連携'
            : provider === 'chatgpt'
              ? 'ChatGPT と連携'
              : 'AI 連携'}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {provider === null && (
          <ProviderChooser onSelect={setProvider} />
        )}

        {provider === 'claude' && (
          <ClaudeGuide
            mode={claudeMode}
            onModeChange={setClaudeMode}
            mcpUrl={mcpUrl}
            onCopy={handleCopy}
          />
        )}

        {provider === 'chatgpt' && (
          <ChatGptGuide
            onCopy={handleCopy}
            keys={keys}
            activeKeys={activeKeys}
            loading={loading}
            formatDate={formatDate}
            onRevoke={handleRevoke}
            onCreate={() => setShowCreateModal(true)}
          />
        )}
      </ScrollView>

      {/* キー生成モーダル (ChatGPT 用) */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowCreateModal(false);
          setCreatedKey(null);
          setNewKeyLabel('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {createdKey ? (
              <>
                <Text style={styles.modalTitle}>APIキー生成完了</Text>
                <Text style={styles.modalDesc}>
                  このキーは二度と表示されません。下の「コピー」をタップして ChatGPT に貼り付けてください。
                </Text>
                <TouchableOpacity
                  onPress={() => handleCopy(createdKey, 'APIキーをコピーしました')}
                  style={styles.keyDisplay}
                >
                  <Text style={styles.keyDisplayText} numberOfLines={2}>
                    {createdKey}
                  </Text>
                  <Copy size={18} color="#6366F1" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={() => {
                    setShowCreateModal(false);
                    setCreatedKey(null);
                  }}
                >
                  <Text style={styles.modalBtnPrimaryText}>完了</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>新しいAPIキー</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowCreateModal(false);
                      setNewKeyLabel('');
                    }}
                  >
                    <X size={20} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalDesc}>
                  どの用途で使うキーか分かるラベルを付けてください (任意)。
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="例: Mac の ChatGPT"
                  placeholderTextColor="#94a3b8"
                  value={newKeyLabel}
                  onChangeText={setNewKeyLabel}
                  maxLength={100}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreateKey}
                />
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={handleCreateKey}
                  disabled={creating}
                >
                  {creating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalBtnPrimaryText}>生成する</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════
// 接続先の選択
// ═══════════════════════════════════════════════════════════════
function ProviderChooser({ onSelect }: { onSelect: (p: Provider) => void }) {
  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroIconWrap}>
          <Sparkles size={28} color="#6366F1" />
        </View>
        <Text style={styles.heroTitle}>AI と ToSche をつなぐ</Text>
        <Text style={styles.heroSub}>
          Claude や ChatGPT と ToSche をつなぐと、AI が立てた目標・ロードマップが
          そのまま ToSche に流れ込みます。日々のタスク分解は ToSche AI が引き受けます。
        </Text>
        <View style={styles.reassureBox}>
          <CheckCircle2 size={15} color="#16a34a" />
          <Text style={styles.reassureText}>
            連携が初めての方でも大丈夫。この後、1ステップずつ画像つきで案内します。
          </Text>
        </View>
      </View>

      <Text style={styles.chooserPrompt}>まず、つなぎたい AI を選んでください</Text>

      {/* Claude */}
      <TouchableOpacity style={styles.choiceCard} onPress={() => onSelect('claude')} activeOpacity={0.85}>
        <View style={[styles.choiceLogo, { backgroundColor: '#F5EDE6' }]}>
          <Sparkles size={26} color="#C15F3C" />
        </View>
        <View style={styles.choiceBody}>
          <View style={styles.choiceTitleRow}>
            <Text style={styles.choiceTitle}>Claude と連携</Text>
            <View style={styles.choiceBadgeEasy}>
              <Text style={styles.choiceBadgeEasyText}>かんたん</Text>
            </View>
          </View>
          <Text style={styles.choiceSub}>
            Claude.ai（ブラウザ）と連携。キーのコピペ不要で、ボタンを貼り付けるだけ。
          </Text>
        </View>
        <ChevronRight size={20} color="#94a3b8" />
      </TouchableOpacity>

      {/* ChatGPT */}
      <TouchableOpacity style={styles.choiceCard} onPress={() => onSelect('chatgpt')} activeOpacity={0.85}>
        <View style={[styles.choiceLogo, { backgroundColor: '#E7F7F1' }]}>
          <Bot size={26} color="#10A37F" />
        </View>
        <View style={styles.choiceBody}>
          <Text style={styles.choiceTitle}>ChatGPT と連携</Text>
          <Text style={styles.choiceSub}>
            ChatGPT の「GPT」機能に組み込み。APIキーを使います（このアプリ内で生成）。
          </Text>
        </View>
        <ChevronRight size={20} color="#94a3b8" />
      </TouchableOpacity>

      <View style={styles.capabilityCard}>
        <Text style={styles.capabilityTitle}>連携でできること</Text>
        <Text style={styles.capabilityText}>
          目標の一覧表示・新規作成・ロードマップ追加・進捗マーク・
          <Text style={styles.capabilityEmph}>削除（要確認）</Text>
        </Text>
        <Text style={styles.capabilityNote}>
          ※ 削除は AI が必ず先に「本当に消して良いですか?」と確認してから実行します。
        </Text>
      </View>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Claude ガイド
// ═══════════════════════════════════════════════════════════════
function ClaudeGuide({
  mode,
  onModeChange,
  mcpUrl,
  onCopy,
}: {
  mode: ClaudeMode;
  onModeChange: (m: ClaudeMode) => void;
  mcpUrl: string;
  onCopy: (t: string, l?: string) => void;
}) {
  return (
    <>
      <GuideIntro
        accent="#C15F3C"
        accentBg="#F5EDE6"
        icon={<Sparkles size={24} color="#C15F3C" />}
        title="Claude と連携する"
        sub="所要 約3分。パソコンの Claude.ai を開いて、ToSche の値を2つ貼り付けるだけです。"
      />

      {/* サブ切り替え: ブラウザ / CLI */}
      <View style={styles.subToggle}>
        <TouchableOpacity
          style={[styles.subToggleBtn, mode === 'web' && styles.subToggleBtnActive]}
          onPress={() => onModeChange('web')}
        >
          <Monitor size={15} color={mode === 'web' ? '#fff' : '#475569'} />
          <Text style={[styles.subToggleText, mode === 'web' && styles.subToggleTextActive]}>
            Claude.ai（ブラウザ）
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subToggleBtn, mode === 'cli' && styles.subToggleBtnActive]}
          onPress={() => onModeChange('cli')}
        >
          <Terminal size={15} color={mode === 'cli' ? '#fff' : '#475569'} />
          <Text style={[styles.subToggleText, mode === 'cli' && styles.subToggleTextActive]}>
            Claude Code（上級者）
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'web' ? (
        <View style={styles.section}>
          <Step n="1" where="browser-claude" title="パソコンで Claude.ai のコネクタ設定を開く">
            <Text style={styles.stepDesc}>
              パソコンのブラウザで Claude.ai を開き、コネクタの追加画面を表示します。
              （下のボタンはこのスマホでも開けますが、操作はパソコン推奨です）
            </Text>
            <TouchableOpacity
              style={styles.linkBtnClaude}
              onPress={() =>
                Linking.openURL('https://claude.ai/customize/connectors?modal=add-custom-connector')
              }
            >
              <ExternalLink size={16} color="#fff" />
              <Text style={styles.linkBtnText}>Claude.ai のコネクタ追加を開く</Text>
            </TouchableOpacity>
            <Figure caption="Claude.ai：コネクタを追加する画面">
              <ClaudeConnectorMock highlight="add" />
            </Figure>
          </Step>

          <Step n="2" where="tosche" title="ToSche の「MCP Server URL」をコピー">
            <Text style={styles.stepDesc}>下の枠をタップするとコピーされます。</Text>
            <CopyBox value={CLAUDE_WEB_MCP_URL} onCopy={() => onCopy(CLAUDE_WEB_MCP_URL, 'MCP URLをコピーしました')} />
          </Step>

          <Step n="3" where="browser-claude" title="コピーした URL を貼り付け">
            <Text style={styles.stepDesc}>
              Claude.ai の「リモート MCP サーバー URL」の欄に貼り付けます。
            </Text>
            <Figure caption="Claude.ai：URL 入力欄に貼り付け">
              <ClaudeConnectorMock highlight="url" />
            </Figure>
          </Step>

          <Step n="4" where="tosche" title="ToSche の「OAuth Client ID」をコピー">
            <Text style={styles.stepDesc}>
              Claude.ai 側の「詳細設定（Advanced settings）」を開いて、下の値を貼り付けます。
            </Text>
            <CopyBox value={CLAUDE_WEB_CLIENT_ID} onCopy={() => onCopy(CLAUDE_WEB_CLIENT_ID, 'Client IDをコピーしました')} />
            <Figure caption="Claude.ai：記入が終わった状態の例（名前・MCP URL・OAuth Client ID）">
              <ClaudeConnectorMock highlight="clientId" />
            </Figure>
          </Step>

          <Step n="5" where="browser-claude" title="ToSche の認可画面で「許可する」">
            <Text style={styles.stepDesc}>
              追加すると ToSche のサインイン画面が出ます。アプリと同じアカウントで
              「Google で続ける」「Apple で続ける」を押すだけ（メール＋パスワードも可）。
              ログイン後に「許可する」を押せば連携完了です。
            </Text>
            <Figure caption="ToSche：認可ダイアログ">
              <AuthorizeMock />
            </Figure>
          </Step>

          <DoneCard
            text="Claude.ai のチャットで「今月の目標を立てて」「目標を一覧表示して」と話しかけると、ToSche に反映されます。"
          />
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.muted}>
            ターミナルで以下のコマンドを実行すると OAuth が自動で起動し、ブラウザで承認するだけで連携できます。
          </Text>
          <Step n="1" where="cli" title="ターミナルでコマンドを実行">
            <CopyBox
              value={`claude mcp add tosche --transport http ${mcpUrl} --oauth-client-id ${CLAUDE_CODE_CLIENT_ID}`}
              lines={2}
              onCopy={() =>
                onCopy(
                  `claude mcp add tosche --transport http ${mcpUrl} --oauth-client-id ${CLAUDE_CODE_CLIENT_ID}`,
                  'コマンドをコピーしました',
                )
              }
            />
          </Step>
          <Step n="2" where="browser-claude" title="ブラウザで「許可する」">
            <Text style={styles.stepDesc}>
              自動で開くブラウザで ToSche にログインし、「許可する」を押せば完了です。
            </Text>
          </Step>
        </View>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// ChatGPT ガイド
// ═══════════════════════════════════════════════════════════════
function ChatGptGuide({
  onCopy,
  keys,
  activeKeys,
  loading,
  formatDate,
  onRevoke,
  onCreate,
}: {
  onCopy: (t: string, l?: string) => void;
  keys: McpKey[];
  activeKeys: McpKey[];
  loading: boolean;
  formatDate: (iso: string | null) => string;
  onRevoke: (k: McpKey) => void;
  onCreate: () => void;
}) {
  return (
    <>
      <GuideIntro
        accent="#10A37F"
        accentBg="#E7F7F1"
        icon={<Bot size={24} color="#10A37F" />}
        title="ChatGPT と連携する"
        sub="所要 約5分。パソコンの ChatGPT で「開発者モード」を一度だけオンにして、ToSche を繋ぐだけ。GPT の作成も API キーも不要です。"
      />

      <View style={styles.noticeBox}>
        <Text style={styles.noticeText}>
          Claude と同じ「サーバーを繋いで、自分のアカウントでログインするだけ」の方式です。最初に一度だけ
          ChatGPT の「開発者モード」をオンにする必要があります（ChatGPT の有料プランが必要です）。
        </Text>
      </View>

      <View style={styles.section}>
        <Step n="1" where="browser-chatgpt" title="ChatGPT の設定 →「アプリ」→「高度な設定」">
          <Text style={styles.stepDesc}>
            パソコンで ChatGPT を開き、左下の自分の名前 →「設定」→「アプリ」を開きます。一番下の
            「高度な設定」をタップします。
          </Text>
          <Figure caption="ChatGPT：設定 → アプリ → 高度な設定">
            <ChatGptSettingsMock />
          </Figure>
        </Step>

        <Step n="2" where="browser-chatgpt" title="「開発者モード」をオンにする">
          <Text style={styles.stepDesc}>
            「開発者モード」のスイッチをオンにします。「リスクが上昇」と注意が出ますが、繋ぐのはあなた自身の
            ToSche だけなので安全です（ToSche の削除は AI が必ず確認してから実行します）。
          </Text>
          <Figure caption="ChatGPT：開発者モードをオン">
            <ChatGptDevModeMock />
          </Figure>
        </Step>

        <Step n="3" where="browser-chatgpt" title="「アプリを作成」→ ToSche の URL を貼り付け">
          <Text style={styles.stepDesc}>
            「アプリを作成する」を押し、名前に「ToSche」、「MCP サーバーの URL」に下の値を貼り付けます。
            認証は「OAuth」のまま（自動で検出されます）。確認のチェックを入れて「作成する」。
          </Text>
          <CopyBox value={CLAUDE_WEB_MCP_URL} onCopy={() => onCopy(CLAUDE_WEB_MCP_URL, 'MCP URLをコピーしました')} />
          <Figure caption="ChatGPT：MCP サーバーの URL を貼り付け">
            <ChatGptAddAppMock />
          </Figure>
        </Step>

        <Step n="4" where="browser-chatgpt" title="ToSche にログインして「許可する」">
          <Text style={styles.stepDesc}>
            ToSche のサインイン画面が出ます。<Text style={styles.bold}>ToSche アプリと同じアカウント</Text>で
            ログインしてください。
          </Text>
          <View style={styles.loginHintBox}>
            <Text style={styles.loginHintText}>
              ・Google / Apple でログインの方（ほとんどの方）：「Google で続ける」または
              「Apple で続ける」を押すだけ{'\n'}
              ・メール＋パスワードで登録した方：メールとパスワードを入力 →「サインイン」
            </Text>
          </View>
          <Text style={styles.stepDesc}>ログインできたら「許可する」を押せば連携完了です。</Text>
          <Figure caption="ToSche：ChatGPT に接続（アプリと同じアカウントでログイン）">
            <ToscheConnectMock />
          </Figure>
        </Step>

        <DoneCard text="新しいチャットで「今月の目標を立てて」「目標を一覧表示して」と話しかけると ToSche に反映されます。反応しない時は、入力欄の「＋」から ToSche をオンにしてください。" />
      </View>

      {/* 上級者向け: APIキー (通常は不要) */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>上級者向け：APIキー</Text>
          <Text style={styles.sectionTitleCount}>{activeKeys.length} / 10</Text>
        </View>
        <Text style={styles.muted}>
          上の手順は OAuth で繋がるので、通常このキーは不要です。ご自身のプログラムから直接 ToSche の API を
          呼び出したい上級者の方のみ、ここでキーを発行してください。
        </Text>

        {loading ? (
          <ActivityIndicator style={{ paddingVertical: 24 }} color="#6366F1" />
        ) : keys.length === 0 ? (
          <Text style={styles.emptyText}>まだキーがありません。</Text>
        ) : (
          keys.map((k) => (
            <View key={k.id} style={[styles.keyRow, k.revoked_at && styles.keyRowRevoked]}>
              <View style={styles.keyRowLeft}>
                <KeyRound size={18} color={k.revoked_at ? '#94a3b8' : '#475569'} />
                <View style={styles.keyRowText}>
                  <Text style={[styles.keyPrefix, k.revoked_at && styles.revoked]}>
                    {k.key_prefix}...
                    {k.label ? `  ${k.label}` : ''}
                  </Text>
                  <Text style={styles.keySub}>
                    {k.revoked_at
                      ? `破棄: ${formatDate(k.revoked_at)}`
                      : `最終使用: ${formatDate(k.last_used_at)} ・ 作成: ${formatDate(k.created_at)}`}
                  </Text>
                </View>
              </View>
              {!k.revoked_at && (
                <TouchableOpacity onPress={() => onRevoke(k)} style={styles.revokeBtn}>
                  <Trash2 size={16} color="#dc2626" />
                </TouchableOpacity>
              )}
            </View>
          ))
        )}

        <TouchableOpacity style={styles.createBtn} onPress={onCreate} disabled={activeKeys.length >= 10}>
          <Text style={styles.createBtnText}>+ 新しいキーを生成</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.disclaimer}>
        ※ APIキーは ToSche の目標・ロードマップを読み書き、および削除する権限を持ちます。第三者に渡さないで
        ください。削除操作は AI が必ず確認を取ってから実行する仕様です。タスク (ToDo) の削除は連携からは
        行えません。
      </Text>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// 共通パーツ
// ═══════════════════════════════════════════════════════════════
function GuideIntro({
  accent,
  accentBg,
  icon,
  title,
  sub,
}: {
  accent: string;
  accentBg: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <View style={[styles.guideIntro, { borderColor: accent }]}>
      <View style={[styles.guideIntroIcon, { backgroundColor: accentBg }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.guideIntroTitle}>{title}</Text>
        <Text style={styles.guideIntroSub}>{sub}</Text>
      </View>
    </View>
  );
}

function WhereBadge({ where }: { where: StepWhere }) {
  const map: Record<StepWhere, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    tosche: {
      label: 'ToSche アプリ内で操作',
      color: '#4338ca',
      bg: '#eef2ff',
      icon: <Smartphone size={12} color="#4338ca" />,
    },
    'browser-claude': {
      label: 'パソコンのブラウザ（Claude.ai）',
      color: '#9a4a2c',
      bg: '#F5EDE6',
      icon: <Monitor size={12} color="#9a4a2c" />,
    },
    'browser-chatgpt': {
      label: 'パソコンのブラウザ（ChatGPT）',
      color: '#0d8c6d',
      bg: '#E7F7F1',
      icon: <Monitor size={12} color="#0d8c6d" />,
    },
    cli: {
      label: 'パソコンのターミナル',
      color: '#475569',
      bg: '#f1f5f9',
      icon: <Terminal size={12} color="#475569" />,
    },
  };
  const m = map[where];
  return (
    <View style={[styles.whereBadge, { backgroundColor: m.bg }]}>
      {m.icon}
      <Text style={[styles.whereBadgeText, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

type StepWhere = 'tosche' | 'browser-claude' | 'browser-chatgpt' | 'cli';

function Step({
  n,
  title,
  where,
  children,
}: {
  n: string;
  title: string;
  where: StepWhere;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHeaderRow}>
        <View style={styles.stepNum}>
          <Text style={styles.stepNumText}>{n}</Text>
        </View>
        <Text style={styles.stepTitle}>{title}</Text>
      </View>
      <View style={styles.stepBody}>
        <WhereBadge where={where} />
        {children}
      </View>
    </View>
  );
}

function CopyBox({ value, onCopy, lines = 1 }: { value: string; onCopy: () => void; lines?: number }) {
  return (
    <TouchableOpacity onPress={onCopy} style={styles.codeBox}>
      <Text style={styles.codeText} numberOfLines={lines}>
        {value}
      </Text>
      <Copy size={16} color="#475569" />
    </TouchableOpacity>
  );
}

// 画像があれば実機スクショ、なければ再現図 (children)、どちらも無ければ準備中表示。
function Figure({
  image,
  caption,
  aspectRatio,
  children,
}: {
  image?: number | null;
  caption?: string;
  aspectRatio?: number;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.figureWrap}>
      {image ? (
        <View style={[styles.figureImgWrap, { aspectRatio: aspectRatio ?? 0.75 }]}>
          <Image source={image} style={styles.figureImgFill} resizeMode="contain" />
        </View>
      ) : children ? (
        children
      ) : (
        <View style={styles.figurePlaceholder}>
          <ImageIcon size={22} color="#cbd5e1" />
          <Text style={styles.figurePlaceholderText}>図を準備中</Text>
        </View>
      )}
      {caption ? <Text style={styles.figureCaption}>{caption}</Text> : null}
    </View>
  );
}

function DoneCard({ text }: { text: string }) {
  return (
    <View style={styles.doneCard}>
      <CheckCircle2 size={20} color="#16a34a" />
      <View style={{ flex: 1 }}>
        <Text style={styles.doneTitle}>これで完了！</Text>
        <Text style={styles.doneText}>{text}</Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// 再現図モック (スクショが撮れない外部画面の代替)
// ═══════════════════════════════════════════════════════════════
function ClaudeConnectorMock({ highlight }: { highlight: 'add' | 'url' | 'clientId' }) {
  return (
    <View style={styles.browserMock}>
      <View style={styles.browserBar}>
        <View style={styles.browserDot} />
        <View style={[styles.browserDot, { backgroundColor: '#fbbf24' }]} />
        <View style={[styles.browserDot, { backgroundColor: '#34d399' }]} />
        <Text style={styles.browserUrl}>claude.ai</Text>
      </View>
      <View style={styles.browserBody}>
        <Text style={styles.mockHeading}>カスタムコネクタを追加</Text>
        <Text style={styles.mockFieldLabel}>名前</Text>
        <View style={styles.mockInput}>
          <Text style={styles.mockInputText}>ToSche</Text>
        </View>
        <Text style={styles.mockFieldLabel}>リモート MCP サーバー URL</Text>
        <View style={[styles.mockInput, highlight === 'url' && styles.mockInputHi]}>
          <Text style={styles.mockInputText} numberOfLines={1}>
            tosche-oauth...workers.dev
          </Text>
        </View>
        <Text style={[styles.mockFieldLabel, highlight === 'clientId' && styles.mockLabelHi]}>
          詳細設定 ▸ OAuth Client ID
        </Text>
        <View style={[styles.mockInput, highlight === 'clientId' && styles.mockInputHi]}>
          <Text style={styles.mockInputText}>tsche_claude_web</Text>
        </View>
        <View style={[styles.mockPrimaryBtn, highlight === 'add' && styles.mockBtnHi]}>
          <Text style={styles.mockPrimaryBtnText}>追加</Text>
        </View>
      </View>
    </View>
  );
}

function AuthorizeMock() {
  return (
    <View style={styles.authMock}>
      <Sparkles size={24} color="#6366F1" />
      <Text style={styles.authTitle}>ToSche へのアクセスを許可</Text>
      <Text style={styles.authSub}>Claude があなたの目標を読み書きできるようになります</Text>
      <View style={styles.authPrimaryBtn}>
        <Text style={styles.authPrimaryBtnText}>許可する</Text>
      </View>
      <Text style={styles.authCancel}>キャンセル</Text>
    </View>
  );
}

function ChatGptCreateMock() {
  return (
    <View style={styles.browserMock}>
      <View style={styles.browserBar}>
        <View style={styles.browserDot} />
        <View style={[styles.browserDot, { backgroundColor: '#fbbf24' }]} />
        <View style={[styles.browserDot, { backgroundColor: '#34d399' }]} />
        <Text style={styles.browserUrl}>chatgpt.com/gpts/editor</Text>
      </View>
      <View style={styles.browserBody}>
        <View style={styles.gptTabs}>
          <Text style={styles.gptTab}>作成</Text>
          <View style={styles.gptTabActive}>
            <Text style={styles.gptTabActiveText}>構成</Text>
          </View>
        </View>
        <Text style={styles.mockFieldLabel}>名前</Text>
        <View style={styles.mockInput}>
          <Text style={styles.mockInputText}>ToSche - 目標設定コーチ</Text>
        </View>
        <View style={[styles.mockPrimaryBtn, styles.mockBtnHi, { backgroundColor: '#10A37F' }]}>
          <Text style={styles.mockPrimaryBtnText}>新しいアクションを作成</Text>
        </View>
      </View>
    </View>
  );
}

function ChatGptActionMock({ highlight }: { highlight: 'url' | 'auth' }) {
  return (
    <View style={styles.browserMock}>
      <View style={styles.browserBar}>
        <View style={styles.browserDot} />
        <View style={[styles.browserDot, { backgroundColor: '#fbbf24' }]} />
        <View style={[styles.browserDot, { backgroundColor: '#34d399' }]} />
        <Text style={styles.browserUrl}>アクションを追加</Text>
      </View>
      <View style={styles.browserBody}>
        <Text style={[styles.mockFieldLabel, highlight === 'auth' && styles.mockLabelHi]}>認証</Text>
        <View style={[styles.mockInput, highlight === 'auth' && styles.mockInputHi]}>
          <Text style={styles.mockInputText}>API キー ・ Bearer</Text>
        </View>
        <Text style={[styles.mockFieldLabel, highlight === 'url' && styles.mockLabelHi]}>スキーマ</Text>
        <View style={styles.gptImportRow}>
          <View style={[styles.gptImportBtn, highlight === 'url' && styles.mockBtnHi]}>
            <Text style={styles.gptImportBtnText}>URL から取り込む</Text>
          </View>
        </View>
        <View style={[styles.mockInput, highlight === 'url' && styles.mockInputHi]}>
          <Text style={styles.mockInputText} numberOfLines={1}>
            .../mcp-server/openapi.json
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── ChatGPT「繋ぐだけ」方式の再現図（開発者モード→MCP連携）─────────────
function ChatGptSettingsMock() {
  return (
    <View style={styles.browserMock}>
      <View style={styles.browserBar}>
        <View style={styles.browserDot} />
        <View style={[styles.browserDot, { backgroundColor: '#fbbf24' }]} />
        <View style={[styles.browserDot, { backgroundColor: '#34d399' }]} />
        <Text style={styles.browserUrl}>ChatGPT ・ 設定</Text>
      </View>
      <View style={styles.browserBody}>
        <Text style={styles.mockHeading}>設定 ＞ アプリ</Text>
        <Text style={styles.mockFieldLabel}>有効化されたアプリ</Text>
        <View style={styles.mockRow}>
          <Text style={styles.mockRowText}>GitHub</Text>
          <ChevronRight size={14} color="#94a3b8" />
        </View>
        <View style={[styles.mockRow, styles.mockRowHi]}>
          <Text style={styles.mockRowStrong}>高度な設定</Text>
          <View style={styles.mockPointer}>
            <ChevronRight size={12} color="#fff" />
            <Text style={styles.mockPointerText}>ここを開く</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function ChatGptDevModeMock() {
  return (
    <View style={styles.browserMock}>
      <View style={styles.browserBar}>
        <View style={styles.browserDot} />
        <View style={[styles.browserDot, { backgroundColor: '#fbbf24' }]} />
        <View style={[styles.browserDot, { backgroundColor: '#34d399' }]} />
        <Text style={styles.browserUrl}>高度な設定</Text>
      </View>
      <View style={styles.browserBody}>
        <View style={styles.devRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.devTitleRow}>
              <Text style={styles.mockRowStrong}>開発者モード</Text>
              <View style={styles.riskBadge}>
                <Text style={styles.riskBadgeText}>リスクが上昇</Text>
              </View>
            </View>
            <Text style={styles.devSub}>未検証のコネクターを追加できるようにします。</Text>
          </View>
          <View style={styles.toggleOn}>
            <View style={styles.toggleKnob} />
          </View>
        </View>
        <View style={[styles.mockPrimaryBtn, styles.mockBtnHi, { backgroundColor: '#10A37F', marginTop: 12 }]}>
          <Text style={styles.mockPrimaryBtnText}>アプリを作成する</Text>
        </View>
      </View>
    </View>
  );
}

function ChatGptAddAppMock() {
  return (
    <View style={styles.browserMock}>
      <View style={styles.browserBar}>
        <View style={styles.browserDot} />
        <View style={[styles.browserDot, { backgroundColor: '#fbbf24' }]} />
        <View style={[styles.browserDot, { backgroundColor: '#34d399' }]} />
        <Text style={styles.browserUrl}>新しいアプリ</Text>
      </View>
      <View style={styles.browserBody}>
        <Text style={styles.mockFieldLabel}>名前</Text>
        <View style={styles.mockInput}>
          <Text style={styles.mockInputText}>ToSche</Text>
        </View>
        <Text style={styles.mockFieldLabel}>MCP サーバーの URL</Text>
        <View style={[styles.mockInput, styles.mockInputHi]}>
          <Text style={styles.mockInputText} numberOfLines={1}>
            tosche-oauth...workers.dev
          </Text>
        </View>
        <Text style={styles.mockFieldLabel}>認証</Text>
        <View style={styles.mockInput}>
          <Text style={styles.mockInputText}>OAuth（自動で検出）</Text>
        </View>
        <View style={styles.checkRow}>
          <View style={styles.checkBox}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
          <Text style={styles.checkLabel}>理解したうえで、続行します</Text>
        </View>
        <View style={[styles.mockPrimaryBtn, { backgroundColor: '#10A37F' }]}>
          <Text style={styles.mockPrimaryBtnText}>作成する</Text>
        </View>
      </View>
    </View>
  );
}

function ToscheConnectMock() {
  return (
    <View style={styles.authMock}>
      <Sparkles size={22} color="#6366F1" />
      <Text style={styles.authTitle}>ChatGPT に接続</Text>
      <Text style={styles.authSub}>ToSche アプリと同じアカウントでログイン</Text>
      <View style={styles.authSocialBtn}>
        <Text style={styles.authSocialBtnText}>Google で続ける</Text>
      </View>
      <View style={styles.authSocialBtn}>
        <Text style={styles.authSocialBtnText}>Apple で続ける</Text>
      </View>
      <Text style={styles.authLink}>メールアドレスでログイン</Text>
    </View>
  );
}

function KeyModalMock() {
  return (
    <View style={styles.keyMock}>
      <Text style={styles.keyMockTitle}>APIキー生成完了</Text>
      <Text style={styles.keyMockDesc}>このキーは二度と表示されません。コピーして使ってください。</Text>
      <View style={styles.keyMockBox}>
        <Text style={styles.keyMockText} numberOfLines={1}>
          tsche_sk_a1b2c3d4...
        </Text>
        <Copy size={16} color="#6366F1" />
      </View>
    </View>
  );
}

// ChatGPT サイドバー再現図 (旧実装から流用)。
function GptSidebarMock() {
  return (
    <View style={styles.gptSidebarMock}>
      <View style={styles.gptSidebarHeader}>
        <Text style={styles.gptSidebarLogo}>ChatGPT</Text>
      </View>
      <View style={[styles.gptSidebarRow, styles.gptSidebarRowHover]}>
        <Edit3 size={14} color="#ECECF1" />
        <Text style={styles.gptSidebarRowText}>新しいチャット</Text>
      </View>
      <View style={styles.gptSidebarRow}>
        <Search size={14} color="#ECECF1" />
        <Text style={styles.gptSidebarRowText}>チャットを検索</Text>
      </View>
      <View style={styles.gptSidebarRow}>
        <MessageSquare size={14} color="#ECECF1" />
        <Text style={styles.gptSidebarRowText}>Codex</Text>
      </View>
      <View style={styles.gptSidebarRow}>
        <MoreHorizontal size={14} color="#ECECF1" />
        <Text style={styles.gptSidebarRowText}>さらに表示</Text>
      </View>
      <Text style={styles.gptSidebarSectionLabel}>GPT</Text>
      <View style={styles.gptSidebarTargetRow}>
        <View style={[styles.gptSidebarRow, styles.gptSidebarRowActive]}>
          <Box size={14} color="#ECECF1" />
          <Text style={styles.gptSidebarRowActiveText} numberOfLines={1}>
            ToSche - 目標設定コーチ
          </Text>
        </View>
        <View style={styles.gptSidebarPointer}>
          <ChevronRight size={14} color="#fff" />
          <Text style={styles.gptSidebarPointerText}>ここをタップ</Text>
        </View>
      </View>
      <View style={styles.gptSidebarRow}>
        <Box size={14} color="#ECECF1" />
        <Text style={styles.gptSidebarRowText}>GPT の詳細を見る</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerBack: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  scroll: { padding: 16, paddingBottom: 48 },

  // Hero
  hero: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  heroSub: { fontSize: 13, color: '#475569', lineHeight: 19, textAlign: 'center' },
  reassureBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f0fdf4',
    width: '100%',
  },
  reassureText: { flex: 1, fontSize: 12.5, color: '#15803d', lineHeight: 18 },

  // Chooser
  chooserPrompt: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 10, marginLeft: 2 },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  choiceLogo: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceBody: { flex: 1 },
  choiceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  choiceTitle: { fontSize: 15.5, fontWeight: '700', color: '#0f172a' },
  choiceBadgeEasy: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  choiceBadgeEasyText: { fontSize: 10, fontWeight: '700', color: '#16a34a' },
  choiceSub: { fontSize: 12, color: '#64748b', lineHeight: 17, marginTop: 3 },

  capabilityCard: {
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    gap: 4,
  },
  capabilityTitle: { fontSize: 13, fontWeight: '700', color: '#3730a3' },
  capabilityText: { fontSize: 12.5, color: '#3730a3', lineHeight: 18 },
  capabilityEmph: { fontWeight: '700', color: '#4338ca' },
  capabilityNote: { fontSize: 11, color: '#6366F1', lineHeight: 16, marginTop: 2 },

  // Guide intro
  guideIntro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
  },
  guideIntroIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideIntroTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  guideIntroSub: { fontSize: 12.5, color: '#475569', lineHeight: 18 },

  // Sub toggle
  subToggle: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    gap: 3,
  },
  subToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
  },
  subToggleBtnActive: { backgroundColor: '#6366F1' },
  subToggleText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  subToggleTextActive: { color: '#fff' },

  // Section
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitleCount: { fontSize: 12, color: '#94a3b8', marginBottom: 12 },
  muted: { fontSize: 12.5, color: '#64748b', lineHeight: 18, marginBottom: 12 },

  // Step
  step: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  stepHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  stepTitle: { flex: 1, fontSize: 14.5, fontWeight: '700', color: '#0f172a', lineHeight: 20 },
  stepBody: { paddingLeft: 36, gap: 8 },
  stepDesc: { fontSize: 13, color: '#475569', lineHeight: 19 },

  whereBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 2,
  },
  whereBadgeText: { fontSize: 11, fontWeight: '700' },

  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  codeText: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#0f172a',
  },

  linkBtnClaude: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#C15F3C',
    borderRadius: 10,
    paddingVertical: 12,
  },
  linkBtnChatgpt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10A37F',
    borderRadius: 10,
    paddingVertical: 12,
  },
  linkBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Figure
  figureWrap: { marginTop: 4 },
  // 実機スクショ用: width:100% + aspectRatio を View 側で持たせ、Image は
  // 親いっぱい (contain) に収める。Image に直接 width:'100%'+aspectRatio を
  // 付けると端末によっては intrinsic サイズではみ出すため、View でラップする。
  figureImgWrap: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  figureImgFill: { width: '100%', height: '100%' },
  figurePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    backgroundColor: '#f8fafc',
  },
  figurePlaceholderText: { fontSize: 11, color: '#94a3b8' },
  figureCaption: { fontSize: 11, color: '#94a3b8', marginTop: 6, textAlign: 'center' },

  // Done card
  doneCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  doneTitle: { fontSize: 14, fontWeight: '700', color: '#15803d', marginBottom: 3 },
  doneText: { fontSize: 12.5, color: '#166534', lineHeight: 18 },

  // Warn box
  warnBox: {
    backgroundColor: '#fff7ed',
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  warnTitle: { fontSize: 12.5, fontWeight: '700', color: '#7c2d12' },
  warnText: { fontSize: 12, color: '#7c2d12', lineHeight: 18 },

  // Browser mock
  browserMock: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  browserBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  browserDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#f87171' },
  browserUrl: {
    flex: 1,
    fontSize: 10.5,
    color: '#64748b',
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 6,
  },
  browserBody: { padding: 14, gap: 7 },
  mockHeading: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  mockFieldLabel: { fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 4 },
  mockLabelHi: { color: '#6366F1' },
  mockInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mockInputHi: { borderColor: '#6366F1', borderWidth: 2, backgroundColor: '#eef2ff' },
  mockInputText: { fontSize: 11.5, color: '#334155' },
  mockPrimaryBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: 8,
  },
  mockBtnHi: {
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  mockPrimaryBtnText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },

  // 汎用の設定行 / 開発者モード / チェック (ChatGPT 繋ぐだけ方式の再現図用)
  mockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginTop: 6,
  },
  mockRowHi: { borderColor: '#10A37F', borderWidth: 2, backgroundColor: '#E7F7F1' },
  mockRowText: { fontSize: 11.5, color: '#334155' },
  mockRowStrong: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  mockPointer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#10A37F',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  mockPointerText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  devRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  devTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  riskBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  riskBadgeText: { fontSize: 9.5, fontWeight: '700', color: '#b91c1c' },
  devSub: { fontSize: 11, color: '#64748b', marginTop: 3, lineHeight: 15 },
  toggleOn: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#10A37F',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 2,
  },
  toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 4 },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: '#10A37F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 12, fontWeight: '900' },
  checkLabel: { flex: 1, fontSize: 11, color: '#334155' },
  authInput: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginTop: 8,
  },
  authInputText: { fontSize: 11.5, color: '#94a3b8' },
  authLink: { fontSize: 11.5, color: '#6366F1', marginTop: 10, textDecorationLine: 'underline' },
  authSocialBtn: {
    width: '100%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 8,
  },
  authSocialBtnText: { fontSize: 12.5, fontWeight: '700', color: '#0f172a' },
  authDividerText: { fontSize: 10.5, color: '#94a3b8', marginTop: 12, marginBottom: 2 },

  // ChatGPT イントロの補足ボックス & ログインのヒント
  noticeBox: {
    backgroundColor: '#E7F7F1',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  noticeText: { fontSize: 12.5, color: '#0d6b54', lineHeight: 19 },
  bold: { fontWeight: '700', color: '#0f172a' },
  loginHintBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 11,
  },
  loginHintText: { fontSize: 12, color: '#334155', lineHeight: 19 },

  gptTabs: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  gptTab: { fontSize: 12, color: '#94a3b8', paddingVertical: 4, paddingHorizontal: 8 },
  gptTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#10A37F',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  gptTabActiveText: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  gptImportRow: { flexDirection: 'row', gap: 8 },
  gptImportBtn: {
    backgroundColor: '#f1f5f9',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  gptImportBtnText: { fontSize: 11.5, fontWeight: '600', color: '#334155' },

  // Authorize mock
  authMock: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  authTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 4 },
  authSub: { fontSize: 11.5, color: '#64748b', textAlign: 'center', lineHeight: 16 },
  authPrimaryBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 40,
    marginTop: 8,
  },
  authPrimaryBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  authCancel: { fontSize: 12, color: '#94a3b8', marginTop: 4 },

  // Key mock
  keyMock: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  keyMockTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  keyMockDesc: { fontSize: 11.5, color: '#64748b', lineHeight: 16 },
  keyMockBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    marginTop: 4,
  },
  keyMockText: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11.5,
    color: '#0f172a',
  },

  // ChatGPT sidebar mock
  gptSidebarMock: {
    backgroundColor: '#0F0F0F',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 2,
  },
  gptSidebarHeader: { paddingHorizontal: 8, paddingVertical: 6, marginBottom: 4 },
  gptSidebarLogo: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
  gptSidebarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    gap: 9,
  },
  gptSidebarRowHover: { backgroundColor: '#202020' },
  gptSidebarRowText: { fontSize: 12, color: '#ECECF1' },
  gptSidebarSectionLabel: {
    fontSize: 10,
    color: '#8E8EA0',
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 4,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  gptSidebarTargetRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gptSidebarRowActive: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#818CF8',
    backgroundColor: 'rgba(129,140,248,0.18)',
  },
  gptSidebarRowActiveText: { flex: 1, fontSize: 12, color: '#fff', fontWeight: '700' },
  gptSidebarPointer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 2,
  },
  gptSidebarPointerText: { fontSize: 10, color: '#fff', fontWeight: '700' },

  // Key list
  emptyText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  keyRowRevoked: { opacity: 0.55 },
  keyRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  keyRowText: { flex: 1 },
  keyPrefix: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  revoked: { textDecorationLine: 'line-through' },
  keySub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  revokeBtn: { padding: 8 },
  createBtn: {
    marginTop: 12,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  createBtnText: { fontSize: 14, fontWeight: '600', color: '#6366F1' },

  disclaimer: { fontSize: 11, color: '#94a3b8', lineHeight: 16, paddingHorizontal: 4, marginTop: 4 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  modalDesc: { fontSize: 13, color: '#475569', lineHeight: 19, marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 16,
  },
  keyDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 10,
    marginBottom: 16,
  },
  keyDisplayText: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#0f172a',
  },
  modalBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalBtnPrimary: { backgroundColor: '#6366F1' },
  modalBtnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
