// Claude Integration setup screen — v1.4 USP.
//
// Lets the user create / revoke MCP API keys that they paste into Claude.ai's
// custom connector settings. The plaintext key is shown exactly once on
// generation; after that only the prefix is visible.

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
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  ArrowLeft,
  Box,
  ChevronRight,
  Copy,
  Edit3,
  ExternalLink,
  KeyRound,
  MessageSquare,
  MoreHorizontal,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';

// Pre-registered OAuth client IDs (see oauth_clients table).
// Users paste these into Claude.ai's "Advanced settings" when adding the
// connector. Stable across deployments.
const CLAUDE_WEB_CLIENT_ID = 'tsche_claude_web';
const CLAUDE_CODE_CLIENT_ID = 'tsche_claude_code';

interface McpKey {
  id: string;
  key_prefix: string;
  label: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

// Resolve the MCP server URL from the same Supabase project the app talks to.
function getMcpServerUrl(): string {
  const url =
    (Constants.expoConfig?.extra as { supabaseUrl?: string } | undefined)?.supabaseUrl ??
    'https://utfyxsvxyvzxjqcgzjjl.supabase.co';
  return `${url.replace(/\/$/, '')}/functions/v1/mcp-server`;
}
function getOpenApiUrl(): string {
  return `${getMcpServerUrl()}/openapi.json`;
}

export default function ClaudeIntegrationScreen() {
  const router = useRouter();
  const [keys, setKeys] = useState<McpKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const mcpUrl = getMcpServerUrl();
  const openApiUrl = getOpenApiUrl();

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
      await loadKeys();
    } catch (e: any) {
      Alert.alert('生成失敗', e?.message ?? '新規キーを生成できませんでした');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (text: string, label = 'コピーしました') => {
    await Clipboard.setStringAsync(text);
    if (Platform.OS === 'android') {
      // Android はトーストが OS 標準で出るが、念のため Alert.
      Alert.alert(label);
    } else {
      Alert.alert(label);
    }
  };

  const handleRevoke = (key: McpKey) => {
    Alert.alert(
      'キーを破棄',
      `${key.label ?? key.key_prefix} を破棄します。Claude.ai 側でこのキーを使った接続は即座に使えなくなります。`,
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
    return d.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const activeKeys = keys.filter((k) => !k.revoked_at);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
          <ArrowLeft size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI 連携</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIconWrap}>
            <Sparkles size={28} color="#6366F1" />
          </View>
          <Text style={styles.heroTitle}>Claude / ChatGPT で目標を立てる</Text>
          <Text style={styles.heroSub}>
            Claude.ai や ChatGPT と ToSche をつなぐと、AI が立てた目標・ロードマップが
            自動で ToSche に流れ込みます。日々のタスク分解は ToSche AI が引き受けます。
          </Text>
        </View>

        {/* Setup: Claude (OAuth — recommended) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Claude.ai に接続 (推奨・OAuth)</Text>
          <Text style={styles.muted}>
            キー手動コピペ不要。Claude.ai を開いて、下の2つの値を貼り付ければ、
            ToSche の認可画面が出ます。承認すれば連携完了。
          </Text>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() =>
              Linking.openURL(
                'https://claude.ai/customize/connectors?modal=add-custom-connector',
              )
            }
          >
            <ExternalLink size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Claude.ai を開く</Text>
          </TouchableOpacity>

          <Step n="1" title="MCP Server URL を貼り付け">
            <TouchableOpacity
              onPress={() => handleCopy(mcpUrl, 'MCP URLをコピーしました')}
              style={styles.codeBox}
            >
              <Text style={styles.codeText} numberOfLines={1}>
                {mcpUrl}
              </Text>
              <Copy size={16} color="#475569" />
            </TouchableOpacity>
          </Step>

          <Step n="2" title="詳細設定 → OAuth Client ID を貼り付け">
            <TouchableOpacity
              onPress={() => handleCopy(CLAUDE_WEB_CLIENT_ID, 'Client IDをコピーしました')}
              style={styles.codeBox}
            >
              <Text style={styles.codeText} numberOfLines={1}>
                {CLAUDE_WEB_CLIENT_ID}
              </Text>
              <Copy size={16} color="#475569" />
            </TouchableOpacity>
          </Step>

          <Step n="3" title="認可画面で「許可する」">
            ToSche のサインインダイアログが出ます。メール+パスワード、または「メールでサインインリンク」(Apple/Google サインインの方) でログイン → 「許可する」
          </Step>
        </View>

        {/* Setup: Claude Code CLI */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Claude Code CLI に接続</Text>
          <Text style={styles.muted}>
            ターミナルで以下のコマンドを実行。OAuthが自動で起動して、ブラウザで承認するだけ。
          </Text>
          <TouchableOpacity
            onPress={() =>
              handleCopy(
                `claude mcp add tosche --transport http ${mcpUrl} --oauth-client-id ${CLAUDE_CODE_CLIENT_ID}`,
                'コマンドをコピーしました',
              )
            }
            style={styles.codeBox}
          >
            <Text style={styles.codeText} numberOfLines={2}>
              {`claude mcp add tosche --transport http ${mcpUrl} --oauth-client-id ${CLAUDE_CODE_CLIENT_ID}`}
            </Text>
            <Copy size={16} color="#475569" />
          </TouchableOpacity>
        </View>

        {/* Setup: ChatGPT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ChatGPT Custom GPT に接続</Text>
          <Text style={styles.muted}>
            Custom GPT (ChatGPT Plus/Pro) で OpenAPI Action として組み込み。
            こちらは下の APIキー が必要。
          </Text>

          <Step n="1" title="chat.openai.com → My GPTs → Create → Configure → Actions">
            「Import from URL」を選択
          </Step>

          <Step n="2" title="OpenAPI スキーマURLを貼り付け">
            <TouchableOpacity
              onPress={() => handleCopy(openApiUrl, 'OpenAPI URLをコピーしました')}
              style={styles.codeBox}
            >
              <Text style={styles.codeText} numberOfLines={1}>
                {openApiUrl}
              </Text>
              <Copy size={16} color="#475569" />
            </TouchableOpacity>
          </Step>

          <Step n="3" title="Authentication = API Key, Auth Type = Bearer">
            下で生成したキーを Bearer Token として設定
          </Step>

          <Step n="4" title="保存後、必ずサイドバーから「ToSche目標設定コーチ」を選んでチャット">
            <View style={styles.warnBox}>
              <Text style={styles.warnTitle}>⚠️ ChatGPT 特有の重要ポイント</Text>
              <Text style={styles.warnText}>
                Claude と違って、ChatGPT は通常のチャットからは ToSche に話しかけても反応しません。
              </Text>
              <Text style={styles.warnText}>
                ChatGPT のサイドバー (左側) を開き、{'\n'}
                「GPT」セクションの「ToSche - 目標設定コーチ」をタップしてからチャットしてください。
                開いた状態で「今月の目標を立てたい」「目標を一覧表示して」と話しかけると、ToSche に反映されます。
              </Text>
            </View>

            <Text style={styles.mockCaption}>↓ ChatGPT のサイドバー イメージ</Text>
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
          </Step>
        </View>

        {/* Key list */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>APIキー</Text>
            <Text style={styles.sectionTitleCount}>{activeKeys.length} / 10</Text>
          </View>

          {loading ? (
            <ActivityIndicator style={{ paddingVertical: 24 }} color="#6366F1" />
          ) : keys.length === 0 ? (
            <Text style={styles.emptyText}>
              まだキーがありません。下のボタンから生成してください。
            </Text>
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
                  <TouchableOpacity onPress={() => handleRevoke(k)} style={styles.revokeBtn}>
                    <Trash2 size={16} color="#dc2626" />
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}

          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => setShowCreateModal(true)}
            disabled={activeKeys.length >= 10}
          >
            <Text style={styles.createBtnText}>+ 新しいキーを生成</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.disclaimer}>
          ※ APIキーはClaudeから ToSche の目標・ロードマップを読み書きする権限を持ちます。
          流出した場合は速やかに破棄してください。タスク削除や他のデータ操作は MCP では行えません。
        </Text>
      </ScrollView>

      {/* Create modal: label input → after create, show plaintext key once */}
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
                  このキーは二度と表示されません。下の「コピー」をタップしてClaude.aiに貼り付けてください。
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
                  placeholder="例: Mac の Claude.ai"
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

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>{title}</Text>
        {typeof children === 'string' ? (
          <Text style={styles.stepDesc}>{children}</Text>
        ) : (
          children
        )}
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

  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleCount: { fontSize: 12, color: '#94a3b8', marginBottom: 12 },
  muted: { fontSize: 12, color: '#64748b', lineHeight: 18, marginBottom: 12 },

  step: { flexDirection: 'row', marginBottom: 14, gap: 12 },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepBody: { flex: 1 },
  stepTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 4 },
  stepDesc: { fontSize: 13, color: '#64748b', lineHeight: 18 },

  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
    gap: 8,
  },
  codeText: { flex: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, color: '#0f172a' },

  // ChatGPT 特有の警告枠 + サイドバーから GPT を選ばないと動かない件を視覚化するモック。
  warnBox: {
    backgroundColor: '#fff7ed',
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 10,
    gap: 6,
  },
  warnTitle: { fontSize: 12.5, fontWeight: '700', color: '#7c2d12' },
  warnText: { fontSize: 12, color: '#7c2d12', lineHeight: 18 },
  mockCaption: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 8,
    marginBottom: 4,
    fontWeight: '600',
  },
  gptSidebarMock: {
    backgroundColor: '#0F0F0F',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#27272A',
    marginTop: 4,
    gap: 2,
  },
  gptSidebarHeader: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 4,
  },
  gptSidebarLogo: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  gptSidebarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    gap: 9,
  },
  gptSidebarRowHover: {
    backgroundColor: '#202020',
  },
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
  gptSidebarTargetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gptSidebarRowActive: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#818CF8',
    backgroundColor: 'rgba(129,140,248,0.18)',
  },
  gptSidebarRowActiveText: {
    flex: 1,
    fontSize: 12,
    color: '#fff',
    fontWeight: '700',
  },
  gptSidebarPointer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 2,
  },
  gptSidebarPointerText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
  },

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
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingVertical: 13,
    marginBottom: 14,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  disclaimer: {
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 16,
    paddingHorizontal: 4,
    marginTop: 4,
  },

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
