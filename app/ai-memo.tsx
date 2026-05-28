// AI連携メモ（共有コンテキスト）
//
// ユーザーが自由記述するメモ。Claude / ChatGPT（MCP 経由）と端末内 AI（ToScheAI）の
// 両方が参照する「前提・指示の共有メモ」。
//   - ToScheAI: ai-chat のシステムプロンプトに <shared_context> として注入される。
//   - MCP: get_shared_context / update_shared_context ツールで読み書きされる。
// 例: 「MCP 側で決めた前提を ToScheAI にも伝えたい」「AI に常に守ってほしいルール」
// など。自分用のメモとしても使える。auto-memory（AIが自動で覚える記憶）とは別物で、
// こちらはユーザーが直接編集する。

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ArrowLeft, Sparkles, Check } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const MAX_LEN = 4000;

const PLACEHOLDER = `例）
・私は朝型なので、重い課題は午前中に割り振ってほしい
・「英語学習」は毎日30分を目安に
・仕事の締め切りは絶対厳守、プライベートは柔軟でOK
・専門用語より平易な言葉で説明してほしい

ここに書いた内容は、Claude / ChatGPT と ToScheAI の両方が参照します。`;

export default function AiMemoScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const lastSaved = useRef('');

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from('ai_shared_context')
        .select('content')
        .eq('user_id', user.id)
        .maybeSingle();
      const c = (data?.content as string) ?? '';
      setContent(c);
      lastSaved.current = c;
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user || saving) return;
    if (content === lastSaved.current) return;
    setSaving(true);
    const { error } = await supabase
      .from('ai_shared_context')
      .upsert(
        { user_id: user.id, content: content.slice(0, MAX_LEN), updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    setSaving(false);
    if (!error) {
      lastSaved.current = content;
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt((v) => (Date.now() - (v ?? 0) >= 1800 ? null : v)), 2000);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
          <ArrowLeft size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI 連携メモ</Text>
        <TouchableOpacity onPress={save} disabled={saving || content === lastSaved.current}>
          <Text
            style={[
              styles.saveBtn,
              (saving || content === lastSaved.current) && styles.saveBtnDisabled,
            ]}
          >
            {saving ? '保存中' : '保存'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}>
            <Sparkles size={18} color="#6366F1" />
            <Text style={styles.introText}>
              ここに書いた内容は、<Text style={styles.bold}>Claude / ChatGPT（MCP 連携）</Text>と
              <Text style={styles.bold}>ToScheAI</Text> の両方が共有して参照します。AI に前提・好み・
              守ってほしいルールを伝えるメモです（自分用メモとしても使えます）。
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator style={{ paddingVertical: 40 }} color="#6366F1" />
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={content}
                onChangeText={(v) => setContent(v.slice(0, MAX_LEN))}
                onBlur={save}
                placeholder={PLACEHOLDER}
                placeholderTextColor="#94a3b8"
                multiline
                textAlignVertical="top"
                maxLength={MAX_LEN}
              />
              <View style={styles.footerRow}>
                {savedAt ? (
                  <View style={styles.savedPill}>
                    <Check size={12} color="#16a34a" />
                    <Text style={styles.savedText}>保存しました</Text>
                  </View>
                ) : (
                  <View />
                )}
                <Text style={styles.counter}>{content.length} / {MAX_LEN}</Text>
              </View>

              <Text style={styles.note}>
                ※ AI はこのメモをもとに目標・課題の作成や提案を行います。機密情報やパスワードは書かないでください。
                スケジュールの自動分配は ToScheAI の機能です。
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  saveBtn: { fontSize: 15, fontWeight: '700', color: '#6366F1', padding: 4 },
  saveBtnDisabled: { color: '#cbd5e1' },
  scroll: { padding: 16 },
  intro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  introText: { flex: 1, fontSize: 12.5, color: '#3730a3', lineHeight: 19 },
  bold: { fontWeight: '700' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#0f172a',
    lineHeight: 21,
    minHeight: 280,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  savedPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  savedText: { fontSize: 12, color: '#16a34a', fontWeight: '600' },
  counter: { fontSize: 12, color: '#94a3b8' },
  note: { fontSize: 11, color: '#94a3b8', lineHeight: 16, marginTop: 14 },
});
