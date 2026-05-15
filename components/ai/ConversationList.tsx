import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Plus, MessageSquare, Trash2 } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface Conversation {
  id: string;
  title: string | null;
  message_count: number;
  last_message_at: string;
}

interface Props {
  visible: boolean;
  activeConversationId?: string;
  onClose: () => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
}

function formatRelative(iso: string, lang: 'ja' | 'en'): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const day = 24 * 60 * 60 * 1000;

    if (diffMs < day && d.getDate() === now.getDate()) {
      const h = d.getHours().toString().padStart(2, '0');
      const m = d.getMinutes().toString().padStart(2, '0');
      return lang === 'ja' ? `今日 ${h}:${m}` : `Today ${h}:${m}`;
    }
    if (diffMs < 7 * day) {
      const days = Math.floor(diffMs / day);
      return lang === 'ja' ? `${days}日前` : `${days}d ago`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return '';
  }
}

export default function ConversationList({
  visible,
  activeConversationId,
  onClose,
  onSelectConversation,
  onNewChat,
}: Props) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Only general-mode conversations belong here. Goal-coach uses its own
      // singleton conversation reachable from the goals page.
      const { data } = await supabase
        .from('ai_conversations')
        .select('id, title, message_count, last_message_at')
        .eq('user_id', user.id)
        .eq('mode', 'general')
        .order('last_message_at', { ascending: false })
        .limit(50);
      setConvs((data ?? []) as Conversation[]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const handleDelete = (id: string, title: string | null) => {
    const preview = (title ?? '(無題)').slice(0, 30);
    Alert.alert(
      lang === 'ja' ? '会話を削除' : 'Delete conversation',
      lang === 'ja'
        ? `「${preview}」を削除します。この操作は取り消せません。`
        : `Delete "${preview}"? This cannot be undone.`,
      [
        { text: lang === 'ja' ? 'キャンセル' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'ja' ? '削除' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('ai_conversations')
              .delete()
              .eq('id', id);
            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            setConvs((c) => c.filter((x) => x.id !== id));
            // If user deleted the currently-open conversation, force a fresh chat
            if (id === activeConversationId) {
              onNewChat();
              onClose();
            }
          },
        },
      ],
    );
  };

  const handleSelect = (id: string) => {
    onSelectConversation(id);
    onClose();
  };

  const handleNew = () => {
    onNewChat();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>{lang === 'ja' ? '履歴' : 'History'}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <X size={20} color="#475569" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.newBtn} onPress={handleNew} activeOpacity={0.85}>
          <Plus size={17} color="#fff" strokeWidth={2.5} />
          <Text style={styles.newText}>
            {lang === 'ja' ? '新しいチャット' : 'New chat'}
          </Text>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#64748b" />
          </View>
        ) : convs.length === 0 ? (
          <View style={styles.center}>
            <MessageSquare size={42} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>
              {lang === 'ja' ? 'まだ会話がありません' : 'No conversations yet'}
            </Text>
            <Text style={styles.emptySub}>
              {lang === 'ja'
                ? 'AIに話しかけると、ここに履歴が残ります'
                : 'Once you chat, your conversations appear here'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={convs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const isActive = item.id === activeConversationId;
              return (
                <View style={[styles.row, isActive && styles.rowActive]}>
                  <TouchableOpacity
                    style={styles.rowContent}
                    onPress={() => handleSelect(item.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowIconBg}>
                      <MessageSquare size={14} color={isActive ? '#6366F1' : '#64748b'} strokeWidth={2.2} />
                    </View>
                    <View style={styles.rowText}>
                      <Text
                        style={[styles.rowTitle, isActive && styles.rowTitleActive]}
                        numberOfLines={1}
                      >
                        {item.title ?? (lang === 'ja' ? '(無題)' : '(Untitled)')}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {item.message_count}{lang === 'ja' ? '件' : ''} · {formatRelative(item.last_message_at, lang)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id, item.title)}
                    style={styles.trashBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Trash2 size={16} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const rowShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  android: { elevation: 1 },
  default: {},
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 14,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#0F172A', letterSpacing: 0.2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    ...rowShadow,
  },
  newText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    ...rowShadow,
  },
  rowActive: {
    borderColor: '#C7D2FE',
    backgroundColor: '#F5F7FF',
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  rowIconBg: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  rowTitleActive: { color: '#4F46E5' },
  rowMeta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  trashBtn: { padding: 6, marginLeft: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#475569', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 6, lineHeight: 19 },
});
