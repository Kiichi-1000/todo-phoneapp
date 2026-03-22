import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  ListChecks,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { RoutineTemplateItem, RoutineSlot } from '@/types/database';
import { formatDate, formatDateDisplay } from '@/lib/scheduleUtils';
import ScheduleCalendarModal from '@/components/ScheduleCalendarModal';

const SWIPE_THRESHOLD = 50;
const SCREEN_WIDTH = Dimensions.get('window').width;

const SLOTS: RoutineSlot[] = ['morning', 'daytime', 'evening'];
const SLOT_LABELS: Record<RoutineSlot, string> = {
  morning: '朝',
  daytime: '日中',
  evening: '夜',
};

function generateDates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 365; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(formatDate(d));
  }
  for (let i = 1; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}

function getTodayIndex(dates: string[]): number {
  const today = formatDate(new Date());
  const idx = dates.indexOf(today);
  return idx >= 0 ? idx : 365;
}

function itemDisplayLabel(item: RoutineTemplateItem): string {
  const s = item.short_label?.trim();
  return s || item.title;
}

function isRoutineTableMissingError(error: any): boolean {
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  return code === '42P01' || code === 'PGRST205' || message.includes('routine_');
}

export default function RoutineScreen() {
  const { user, loading: authLoading } = useAuth();
  const [allDates] = useState<string[]>(() => generateDates());
  const [currentIndex, setCurrentIndex] = useState(() => getTodayIndex(generateDates()));
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [items, setItems] = useState<RoutineTemplateItem[]>([]);
  const [completedItemIds, setCompletedItemIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [routineTablesMissing, setRoutineTablesMissing] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [sectionOpen, setSectionOpen] = useState<Record<RoutineSlot, boolean>>({
    morning: true,
    daytime: true,
    evening: true,
  });

  const translateX = useSharedValue(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const currentDate = allDates[currentIndex];
  const isToday = currentDate === formatDate(new Date());

  const goToNextDate = useCallback(() => {
    if (currentIndex >= allDates.length - 1 || isAnimating) return;
    setIsAnimating(true);
    translateX.value = withTiming(-SCREEN_WIDTH, { duration: 200 }, () => {
      runOnJS(setCurrentIndex)(currentIndex + 1);
      translateX.value = SCREEN_WIDTH;
      translateX.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(setIsAnimating)(false);
      });
    });
  }, [currentIndex, allDates.length, translateX, isAnimating]);

  const goToPrevDate = useCallback(() => {
    if (currentIndex <= 0 || isAnimating) return;
    setIsAnimating(true);
    translateX.value = withTiming(SCREEN_WIDTH, { duration: 200 }, () => {
      runOnJS(setCurrentIndex)(currentIndex - 1);
      translateX.value = -SCREEN_WIDTH;
      translateX.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(setIsAnimating)(false);
      });
    });
  }, [currentIndex, translateX, isAnimating]);

  const panGesture = Gesture.Pan()
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD) {
        runOnJS(goToPrevDate)();
      } else if (event.translationX < -SWIPE_THRESHOLD) {
        runOnJS(goToNextDate)();
      }
    })
    .enabled(!isAnimating);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const touchTemplateUpdated = useCallback(async (tid: string) => {
    await (supabase.from('routine_templates') as any)
      .update({ updated_at: new Date().toISOString() })
      .eq('id', tid);
  }, []);

  const ensureTemplate = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    const { data, error } = (await supabase
      .from('routine_templates')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()) as { data: { id: string } | null; error: Error | null };
    if (error) {
      if (isRoutineTableMissingError(error)) {
        setRoutineTablesMissing(true);
        return null;
      }
      console.error('routine_templates fetch:', error);
      return null;
    }
    setRoutineTablesMissing(false);
    if (data?.id) return data.id;
    const { data: inserted, error: insErr } = (await supabase
      .from('routine_templates')
      .insert({ user_id: user.id } as any)
      .select('id')
      .single()) as { data: { id: string } | null; error: Error | null };
    if (insErr) {
      if (isRoutineTableMissingError(insErr)) {
        setRoutineTablesMissing(true);
        return null;
      }
      console.error('routine_templates insert:', insErr);
      return null;
    }
    setRoutineTablesMissing(false);
    return inserted?.id ?? null;
  }, [user]);

  const loadRoutine = useCallback(async () => {
    if (!user || !currentDate) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const tid = await ensureTemplate();
      setTemplateId(tid);
      if (!tid) {
        setItems([]);
        setCompletedItemIds(new Set());
        return;
      }

      const { data: itemRows, error: itemsError } = (await supabase
        .from('routine_template_items')
        .select('*')
        .eq('template_id', tid)
        .order('slot', { ascending: true })
        .order('sort_order', { ascending: true })) as {
        data: RoutineTemplateItem[] | null;
        error: Error | null;
      };

      if (itemsError) throw itemsError;
      const list = itemRows || [];
      setItems(list);

      const activeIds = list.filter((i) => i.is_active).map((i) => i.id);
      if (activeIds.length === 0) {
        setCompletedItemIds(new Set());
        return;
      }

      const { data: compRows, error: compError } = (await supabase
        .from('routine_completions')
        .select('item_id')
        .eq('user_id', user.id)
        .eq('date', currentDate)
        .in('item_id', activeIds)) as {
        data: { item_id: string }[] | null;
        error: Error | null;
      };

      if (compError) throw compError;
      setCompletedItemIds(new Set((compRows || []).map((r) => r.item_id)));
    } catch (e: any) {
      console.error('loadRoutine:', e);
      if (isRoutineTableMissingError(e)) {
        setRoutineTablesMissing(true);
        Alert.alert(
          'データベース',
          'ルーティン用テーブルがまだありません。Supabase に最新マイグレーションを適用してください。'
        );
      }
      setItems([]);
      setCompletedItemIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [user, currentDate, ensureTemplate]);

  useEffect(() => {
    if (user) loadRoutine();
  }, [user, currentDate, loadRoutine]);

  const activeItemsBySlot = useMemo(() => {
    const map: Record<RoutineSlot, RoutineTemplateItem[]> = {
      morning: [],
      daytime: [],
      evening: [],
    };
    for (const it of items) {
      if (!it.is_active) continue;
      map[it.slot].push(it);
    }
    return map;
  }, [items]);

  const hasAnyActive = useMemo(
    () => SLOTS.some((s) => activeItemsBySlot[s].length > 0),
    [activeItemsBySlot]
  );

  const toggleCompletion = async (itemId: string) => {
    if (!user || !currentDate) return;
    const done = completedItemIds.has(itemId);
    try {
      if (done) {
        const { error } = await supabase
          .from('routine_completions')
          .delete()
          .eq('user_id', user.id)
          .eq('item_id', itemId)
          .eq('date', currentDate);
        if (error) throw error;
        setCompletedItemIds((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      } else {
        const { error } = await supabase.from('routine_completions').insert({
          user_id: user.id,
          item_id: itemId,
          date: currentDate,
          completed_at: new Date().toISOString(),
        } as any);
        if (error) throw error;
        setCompletedItemIds((prev) => new Set(prev).add(itemId));
      }
    } catch (e) {
      console.error('toggleCompletion:', e);
      Alert.alert('エラー', 'チェックの更新に失敗しました');
      loadRoutine();
    }
  };

  const jumpToDate = (dateStr: string) => {
    const idx = allDates.indexOf(dateStr);
    if (idx >= 0) setCurrentIndex(idx);
    setCalendarVisible(false);
  };

  const jumpToToday = () => {
    const todayStr = formatDate(new Date());
    const idx = allDates.indexOf(todayStr);
    if (idx >= 0) setCurrentIndex(idx);
  };

  const openEditor = () => setEditVisible(true);

  const closeEditor = () => {
    setEditVisible(false);
    loadRoutine();
  };

  const itemsInSlot = (slot: RoutineSlot) =>
    items.filter((i) => i.slot === slot).sort((a, b) => a.sort_order - b.sort_order);

  const addItem = async (slot: RoutineSlot) => {
    if (!user || !templateId) return;
    const slotItems = itemsInSlot(slot);
    const maxOrder = slotItems.length ? Math.max(...slotItems.map((i) => i.sort_order)) : -1;
    const { error } = await supabase.from('routine_template_items').insert({
      template_id: templateId,
      slot,
      sort_order: maxOrder + 1,
      title: '新しい項目',
      is_active: true,
    } as any);
    if (error) {
      Alert.alert('エラー', '項目の追加に失敗しました');
      return;
    }
    await touchTemplateUpdated(templateId);
    await loadRoutine();
  };

  const deleteItem = (item: RoutineTemplateItem) => {
    Alert.alert('削除', '「' + item.title + '」を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          if (!templateId) return;
          const { error } = await supabase.from('routine_template_items').delete().eq('id', item.id);
          if (error) {
            Alert.alert('エラー', '削除に失敗しました');
            return;
          }
          await touchTemplateUpdated(templateId);
          await loadRoutine();
        },
      },
    ]);
  };

  const moveItem = async (item: RoutineTemplateItem, dir: -1 | 1) => {
    if (!templateId) return;
    const slotItems = itemsInSlot(item.slot);
    const idx = slotItems.findIndex((i) => i.id === item.id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= slotItems.length) return;
    const other = slotItems[j];
    const a = item.sort_order;
    const b = other.sort_order;
    const { error: e1 } = await (supabase.from('routine_template_items') as any)
      .update({ sort_order: b })
      .eq('id', item.id);
    if (e1) {
      Alert.alert('エラー', '並び替えに失敗しました');
      return;
    }
    const { error: e2 } = await (supabase.from('routine_template_items') as any)
      .update({ sort_order: a })
      .eq('id', other.id);
    if (e2) {
      await (supabase.from('routine_template_items') as any).update({ sort_order: a }).eq('id', item.id);
      Alert.alert('エラー', '並び替えに失敗しました');
      return;
    }
    await touchTemplateUpdated(templateId);
    await loadRoutine();
  };

  const saveItemFields = async (
    itemId: string,
    patch: { title?: string; short_label?: string | null; is_active?: boolean }
  ) => {
    if (!templateId) return;
    const { error } = await (supabase.from('routine_template_items') as any).update(patch).eq('id', itemId);
    if (error) {
      Alert.alert('エラー', '保存に失敗しました');
      loadRoutine();
      return;
    }
    await touchTemplateUpdated(templateId);
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, ...patch, updated_at: new Date().toISOString() } : i))
    );
  };

  if (authLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#222" />
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.hintText}>ログインするとルーティンを利用できます。</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>ルーティン</Text>
          <TouchableOpacity onPress={openEditor} style={styles.editHeaderBtn} accessibilityLabel="テンプレートを編集">
            <Pencil size={22} color="#222" />
          </TouchableOpacity>
        </View>
        <View style={styles.dateNav}>
          <TouchableOpacity onPress={goToPrevDate} style={styles.navBtn}>
            <ChevronLeft size={22} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCalendarVisible(true)} style={styles.dateDisplay}>
            <Text style={styles.dateText}>{formatDateDisplay(currentDate)}</Text>
            {isToday && <Text style={styles.todayBadge}>TODAY</Text>}
            <Calendar size={16} color="#888" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToNextDate} style={styles.navBtn}>
            <ChevronRight size={22} color="#333" />
          </TouchableOpacity>
          {!isToday && (
            <TouchableOpacity onPress={jumpToToday} style={styles.todayBtn}>
              <Text style={styles.todayBtnText}>今日</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.content, animatedStyle]}>
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#222" />
            </View>
          ) : !hasAnyActive ? (
            <View style={styles.emptyWrap}>
              <ListChecks size={48} color="#ccc" />
              <Text style={styles.emptyTitle}>
                {routineTablesMissing ? 'ルーティン機能を準備中です' : 'ルーティンがありません'}
              </Text>
              <Text style={styles.emptySub}>
                {routineTablesMissing
                  ? 'Supabase にルーティン用の最新マイグレーションを適用してください。'
                  : '右上の鉛筆から、朝・日中・夜の習慣を追加できます。'}
              </Text>
              {!routineTablesMissing && (
                <TouchableOpacity style={styles.emptyCta} onPress={openEditor}>
                  <Text style={styles.emptyCtaText}>テンプレートを編集</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {SLOTS.map((slot) => {
                const slotItems = activeItemsBySlot[slot];
                if (slotItems.length === 0) return null;
                const open = sectionOpen[slot];
                return (
                  <View key={slot} style={styles.section}>
                    <TouchableOpacity
                      style={styles.sectionHeader}
                      onPress={() => setSectionOpen((s) => ({ ...s, [slot]: !s[slot] }))}
                    >
                      <Text style={styles.sectionTitle}>{SLOT_LABELS[slot]}</Text>
                      {open ? <ChevronUp size={20} color="#666" /> : <ChevronDown size={20} color="#666" />}
                    </TouchableOpacity>
                    {open &&
                      slotItems.map((item) => {
                        const checked = completedItemIds.has(item.id);
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={styles.row}
                            onPress={() => toggleCompletion(item.id)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                              {checked && <Text style={styles.checkMark}>✓</Text>}
                            </View>
                            <Text
                              style={[styles.rowLabel, checked && styles.rowLabelDone]}
                              numberOfLines={2}
                            >
                              {itemDisplayLabel(item)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>
      </GestureDetector>

      <ScheduleCalendarModal
        visible={calendarVisible}
        currentDate={currentDate}
        onSelectDate={jumpToDate}
        onClose={() => setCalendarVisible(false)}
      />

      <Modal visible={editVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeEditor}>
        <SafeAreaView style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>テンプレート編集</Text>
            <TouchableOpacity onPress={closeEditor} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>完了</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            {SLOTS.map((slot) => (
              <View key={slot} style={styles.editSection}>
                <View style={styles.editSectionHead}>
                  <Text style={styles.editSectionTitle}>{SLOT_LABELS[slot]}</Text>
                  <TouchableOpacity style={styles.addSmallBtn} onPress={() => addItem(slot)}>
                    <Plus size={18} color="#fff" />
                    <Text style={styles.addSmallBtnText}>追加</Text>
                  </TouchableOpacity>
                </View>
                {itemsInSlot(slot).map((item, idx, arr) => (
                  <View
                    key={`${item.id}-${item.updated_at}`}
                    style={[styles.editRow, !item.is_active && styles.editRowInactive]}
                  >
                    <View style={styles.editRowMain}>
                      <TextInput
                        style={styles.editInput}
                        defaultValue={item.title}
                        placeholder="タイトル"
                        onEndEditing={(e) => {
                          const t = e.nativeEvent.text.trim();
                          if (t && t !== item.title) saveItemFields(item.id, { title: t });
                        }}
                      />
                      <TextInput
                        style={styles.editInputSmall}
                        defaultValue={item.short_label || ''}
                        placeholder="短い表示名（任意）"
                        onEndEditing={(e) => {
                          const t = e.nativeEvent.text.trim();
                          const next = t.length ? t : null;
                          if (next !== (item.short_label || null)) {
                            saveItemFields(item.id, { short_label: next });
                          }
                        }}
                      />
                      <View style={styles.activeRow}>
                        <Text style={styles.activeLabel}>一覧に表示</Text>
                        <Switch
                          value={item.is_active}
                          onValueChange={(v) => saveItemFields(item.id, { is_active: v })}
                        />
                      </View>
                    </View>
                    <View style={styles.editRowActions}>
                      <TouchableOpacity
                        onPress={() => moveItem(item, -1)}
                        disabled={idx === 0}
                        style={[styles.iconBtn, idx === 0 && styles.iconBtnDisabled]}
                      >
                        <ChevronUp size={20} color={idx === 0 ? '#ccc' : '#333'} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => moveItem(item, 1)}
                        disabled={idx === arr.length - 1}
                        style={[styles.iconBtn, idx === arr.length - 1 && styles.iconBtnDisabled]}
                      >
                        <ChevronDown size={20} color={idx === arr.length - 1 ? '#ccc' : '#333'} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteItem(item)} style={styles.iconBtn}>
                        <Trash2 size={18} color="#E8654A" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {itemsInSlot(slot).length === 0 && (
                  <Text style={styles.slotEmpty}>項目がありません。「追加」から登録できます。</Text>
                )}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#000',
  },
  editHeaderBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  navBtn: {
    padding: 6,
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  dateText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  todayBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#E8654A',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 8,
    overflow: 'hidden',
  },
  todayBtn: {
    marginLeft: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#222',
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintText: {
    fontSize: 15,
    color: '#666',
    paddingHorizontal: 24,
    textAlign: 'center',
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptySub: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyCta: {
    marginTop: 20,
    backgroundColor: '#222',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyCtaText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
    }),
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ccc',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: '#222',
    borderColor: '#222',
  },
  checkMark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: '#222',
  },
  rowLabelDone: {
    color: '#888',
    textDecorationLine: 'line-through',
  },
  modalRoot: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  modalClose: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  modalScroll: {
    flex: 1,
    padding: 16,
  },
  editSection: {
    marginBottom: 24,
  },
  editSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  editSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  addSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#222',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addSmallBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  editRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  editRowInactive: {
    opacity: 0.65,
  },
  editRowMain: {
    flex: 1,
    marginRight: 8,
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    marginBottom: 8,
    backgroundColor: '#fafafa',
  },
  editInputSmall: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    fontSize: 13,
    marginBottom: 8,
    backgroundColor: '#fafafa',
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeLabel: {
    fontSize: 13,
    color: '#666',
  },
  editRowActions: {
    justifyContent: 'center',
    gap: 4,
  },
  iconBtn: {
    padding: 6,
  },
  iconBtnDisabled: {
    opacity: 0.4,
  },
  slotEmpty: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 8,
  },
});
