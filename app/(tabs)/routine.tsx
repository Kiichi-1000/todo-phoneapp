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
  Plus,
  Trash2,
  X,
  Sunrise,
  Sun,
  Moon,
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

const SLOT_ICONS: Record<RoutineSlot, any> = {
  morning: Sunrise,
  daytime: Sun,
  evening: Moon,
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
  const [currentSlot, setCurrentSlot] = useState<RoutineSlot>('morning');
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [editingItem, setEditingItem] = useState<RoutineTemplateItem | null>(null);

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

  const openAddModal = () => {
    setNewItemTitle('');
    setEditingItem(null);
    setAddModalVisible(true);
  };

  const openEditModal = (item: RoutineTemplateItem) => {
    setNewItemTitle(item.title);
    setEditingItem(item);
    setAddModalVisible(true);
  };

  const closeAddModal = () => {
    setAddModalVisible(false);
    setNewItemTitle('');
    setEditingItem(null);
  };

  const saveItem = async () => {
    const title = newItemTitle.trim();
    if (!title || !templateId) return;

    try {
      if (editingItem) {
        const { error } = await (supabase.from('routine_template_items') as any)
          .update({ title })
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const slotItems = items.filter((i) => i.slot === currentSlot);
        const maxOrder = slotItems.length ? Math.max(...slotItems.map((i) => i.sort_order)) : -1;
        const { error } = await supabase.from('routine_template_items').insert({
          template_id: templateId,
          slot: currentSlot,
          sort_order: maxOrder + 1,
          title,
          is_active: true,
        } as any);
        if (error) throw error;
      }
      await touchTemplateUpdated(templateId);
      await loadRoutine();
      closeAddModal();
    } catch (e) {
      console.error('saveItem:', e);
      Alert.alert('エラー', '保存に失敗しました');
    }
  };

  const deleteItem = async (item: RoutineTemplateItem) => {
    if (!templateId) return;
    Alert.alert('削除', '「' + item.title + '」を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('routine_template_items').delete().eq('id', item.id);
            if (error) throw error;
            await touchTemplateUpdated(templateId);
            await loadRoutine();
          } catch (e) {
            console.error('deleteItem:', e);
            Alert.alert('エラー', '削除に失敗しました');
          }
        },
      },
    ]);
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

  const currentSlotItems = activeItemsBySlot[currentSlot];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>ルーティン</Text>
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

        <View style={styles.tabBar}>
          {SLOTS.map((slot) => {
            const Icon = SLOT_ICONS[slot];
            const isActive = slot === currentSlot;
            return (
              <TouchableOpacity
                key={slot}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setCurrentSlot(slot)}
              >
                <Icon size={20} color={isActive ? '#222' : '#999'} />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{SLOT_LABELS[slot]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.content, animatedStyle]}>
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#222" />
            </View>
          ) : routineTablesMissing ? (
            <View style={styles.emptyWrap}>
              <ListChecks size={48} color="#ccc" />
              <Text style={styles.emptyTitle}>ルーティン機能を準備中です</Text>
              <Text style={styles.emptySub}>
                Supabase にルーティン用の最新マイグレーションを適用してください。
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {currentSlotItems.length === 0 ? (
                <View style={styles.emptySlot}>
                  <Text style={styles.emptySlotText}>
                    {SLOT_LABELS[currentSlot]}の習慣を追加してみましょう
                  </Text>
                </View>
              ) : (
                currentSlotItems.map((item) => {
                  const checked = completedItemIds.has(item.id);
                  return (
                    <View key={item.id} style={styles.card}>
                      <TouchableOpacity
                        style={styles.cardMain}
                        onPress={() => toggleCompletion(item.id)}
                        onLongPress={() => openEditModal(item)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                          {checked && <Text style={styles.checkMark}>✓</Text>}
                        </View>
                        <Text style={[styles.cardText, checked && styles.cardTextDone]} numberOfLines={3}>
                          {itemDisplayLabel(item)}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item)}>
                        <Trash2 size={16} color="#E8654A" />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}
        </Animated.View>
      </GestureDetector>

      {!routineTablesMissing && (
        <TouchableOpacity style={styles.fab} onPress={openAddModal}>
          <Plus size={28} color="#fff" />
        </TouchableOpacity>
      )}

      <ScheduleCalendarModal
        visible={calendarVisible}
        currentDate={currentDate}
        onSelectDate={jumpToDate}
        onClose={() => setCalendarVisible(false)}
      />

      <Modal
        visible={addModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeAddModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.addModalContent}>
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>
                {editingItem ? '習慣を編集' : '習慣を追加'}
              </Text>
              <TouchableOpacity onPress={closeAddModal} style={styles.closeBtn}>
                <X size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.addInput}
              placeholder="習慣の内容を入力..."
              value={newItemTitle}
              onChangeText={setNewItemTitle}
              autoFocus
              multiline
              maxLength={100}
            />
            <View style={styles.addModalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeAddModal}>
                <Text style={styles.cancelBtnText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, !newItemTitle.trim() && styles.saveBtnDisabled]}
                onPress={saveItem}
                disabled={!newItemTitle.trim()}
              >
                <Text style={styles.saveBtnText}>{editingItem ? '保存' : '追加'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    paddingBottom: 0,
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
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingBottom: 12,
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
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#222',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
  },
  tabTextActive: {
    color: '#222',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
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
  emptySlot: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptySlotText: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
  cardText: {
    flex: 1,
    fontSize: 16,
    color: '#222',
    lineHeight: 22,
  },
  cardTextDone: {
    color: '#888',
    textDecorationLine: 'line-through',
  },
  deleteBtn: {
    padding: 8,
    marginLeft: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  addModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    padding: 20,
  },
  addModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  closeBtn: {
    padding: 4,
  },
  addInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: '#fafafa',
    marginBottom: 20,
  },
  addModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#222',
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#ccc',
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
