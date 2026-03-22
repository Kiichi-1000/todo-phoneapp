import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  KeyboardAvoidingView,
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
  Settings,
  ChevronUp,
  ChevronDown,
  Check,
  CircleCheck as CheckCircle,
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

const SLOT_COLORS: Record<RoutineSlot, { bg: string; accent: string; light: string }> = {
  morning: { bg: '#FFF8F0', accent: '#E8954A', light: '#FDEBD0' },
  daytime: { bg: '#F0F8FF', accent: '#3B82F6', light: '#DBEAFE' },
  evening: { bg: '#F5F0FF', accent: '#7C5CFC', light: '#EDE9FE' },
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
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [templateEditingId, setTemplateEditingId] = useState<string | null>(null);
  const [templateEditText, setTemplateEditText] = useState('');

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

  const allItemsBySlot = useMemo(() => {
    const map: Record<RoutineSlot, RoutineTemplateItem[]> = {
      morning: [],
      daytime: [],
      evening: [],
    };
    for (const it of items) {
      map[it.slot].push(it);
    }
    return map;
  }, [items]);

  const slotProgress = useMemo(() => {
    const progress: Record<RoutineSlot, { done: number; total: number }> = {
      morning: { done: 0, total: 0 },
      daytime: { done: 0, total: 0 },
      evening: { done: 0, total: 0 },
    };
    for (const slot of SLOTS) {
      const slotItems = activeItemsBySlot[slot];
      progress[slot].total = slotItems.length;
      progress[slot].done = slotItems.filter((i) => completedItemIds.has(i.id)).length;
    }
    return progress;
  }, [activeItemsBySlot, completedItemIds]);

  const totalProgress = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const slot of SLOTS) {
      done += slotProgress[slot].done;
      total += slotProgress[slot].total;
    }
    return { done, total };
  }, [slotProgress]);

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
    setAddModalVisible(true);
  };

  const closeAddModal = () => {
    setAddModalVisible(false);
    setNewItemTitle('');
  };

  const saveNewTodayTask = async () => {
    const title = newItemTitle.trim();
    if (!title || !templateId) return;

    try {
      const slotItems = items.filter((i) => i.slot === currentSlot);
      const maxOrder = slotItems.length ? Math.max(...slotItems.map((i) => i.sort_order)) : -1;
      const { data: newItem, error } = (await supabase
        .from('routine_template_items')
        .insert({
          template_id: templateId,
          slot: currentSlot,
          sort_order: maxOrder + 1,
          title,
          is_active: false,
        } as any)
        .select('*')
        .single()) as { data: RoutineTemplateItem | null; error: Error | null };
      if (error) throw error;

      if (newItem) {
        const { error: compError } = await supabase.from('routine_completions').insert({
          user_id: user!.id,
          item_id: newItem.id,
          date: currentDate,
          completed_at: new Date().toISOString(),
        } as any);
        if (compError) console.error('completion insert:', compError);
      }

      await touchTemplateUpdated(templateId);
      await loadRoutine();
      closeAddModal();
    } catch (e) {
      console.error('saveNewTodayTask:', e);
      Alert.alert('エラー', '保存に失敗しました');
    }
  };

  const openTemplateModal = () => {
    setTemplateEditingId(null);
    setTemplateEditText('');
    setTemplateModalVisible(true);
  };

  const closeTemplateModal = () => {
    setTemplateModalVisible(false);
    setTemplateEditingId(null);
    setTemplateEditText('');
    loadRoutine();
  };

  const addItemToTemplate = async (slot: RoutineSlot) => {
    if (!templateId) return;
    const slotItems = items.filter((i) => i.slot === slot);
    const maxOrder = slotItems.length ? Math.max(...slotItems.map((i) => i.sort_order)) : -1;
    const { data: newItem, error } = (await supabase
      .from('routine_template_items')
      .insert({
        template_id: templateId,
        slot,
        sort_order: maxOrder + 1,
        title: '',
        is_active: true,
      } as any)
      .select('*')
      .single()) as { data: RoutineTemplateItem | null; error: Error | null };
    if (error) {
      Alert.alert('エラー', '項目の追加に失敗しました');
      return;
    }
    await touchTemplateUpdated(templateId);
    await loadRoutine();
    if (newItem) {
      setTemplateEditingId(newItem.id);
      setTemplateEditText('');
    }
  };

  const saveTemplateItemTitle = async (itemId: string, title: string) => {
    if (!templateId) return;
    const trimmed = title.trim();
    if (!trimmed) {
      await supabase.from('routine_template_items').delete().eq('id', itemId);
      await touchTemplateUpdated(templateId);
      await loadRoutine();
      setTemplateEditingId(null);
      setTemplateEditText('');
      return;
    }
    const { error } = await (supabase.from('routine_template_items') as any)
      .update({ title: trimmed })
      .eq('id', itemId);
    if (error) {
      Alert.alert('エラー', '保存に失敗しました');
      loadRoutine();
      return;
    }
    await touchTemplateUpdated(templateId);
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, title: trimmed } : i))
    );
    setTemplateEditingId(null);
    setTemplateEditText('');
  };

  const deleteTemplateItem = async (item: RoutineTemplateItem) => {
    if (!templateId) return;
    Alert.alert('削除', `「${item.title || '無題'}」を削除しますか？`, [
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
            console.error('deleteTemplateItem:', e);
            Alert.alert('エラー', '削除に失敗しました');
          }
        },
      },
    ]);
  };

  const moveTemplateItem = async (item: RoutineTemplateItem, dir: -1 | 1) => {
    if (!templateId) return;
    const slotItems = items.filter((i) => i.slot === item.slot).sort((a, b) => a.sort_order - b.sort_order);
    const idx = slotItems.findIndex((i) => i.id === item.id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= slotItems.length) return;
    const other = slotItems[j];
    const a = item.sort_order;
    const b = other.sort_order;
    const { error: e1 } = await (supabase.from('routine_template_items') as any)
      .update({ sort_order: b })
      .eq('id', item.id);
    if (e1) return;
    const { error: e2 } = await (supabase.from('routine_template_items') as any)
      .update({ sort_order: a })
      .eq('id', other.id);
    if (e2) {
      await (supabase.from('routine_template_items') as any).update({ sort_order: a }).eq('id', item.id);
      return;
    }
    await touchTemplateUpdated(templateId);
    await loadRoutine();
  };

  const toggleTemplateActive = async (item: RoutineTemplateItem) => {
    if (!templateId) return;
    const { error } = await (supabase.from('routine_template_items') as any)
      .update({ is_active: !item.is_active })
      .eq('id', item.id);
    if (error) {
      Alert.alert('エラー', '更新に失敗しました');
      return;
    }
    await touchTemplateUpdated(templateId);
    await loadRoutine();
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
  const slotColor = SLOT_COLORS[currentSlot];
  const prog = slotProgress[currentSlot];
  const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
  const totalPct = totalProgress.total > 0 ? Math.round((totalProgress.done / totalProgress.total) * 100) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>ルーティン</Text>
          <TouchableOpacity onPress={openTemplateModal} style={styles.templateBtn} activeOpacity={0.7}>
            <Settings size={20} color="#555" />
          </TouchableOpacity>
        </View>

        <View style={styles.dateNav}>
          <TouchableOpacity onPress={goToPrevDate} style={styles.navBtn}>
            <ChevronLeft size={22} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCalendarVisible(true)} style={styles.dateDisplay}>
            <Text style={styles.dateText}>{formatDateDisplay(currentDate)}</Text>
            {isToday && <Text style={styles.todayBadge}>TODAY</Text>}
            <Calendar size={14} color="#888" style={{ marginLeft: 6 }} />
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

        {totalProgress.total > 0 && (
          <View style={styles.progressRow}>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${totalPct}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {totalProgress.done}/{totalProgress.total}
            </Text>
          </View>
        )}

        <View style={styles.tabBar}>
          {SLOTS.map((slot) => {
            const Icon = SLOT_ICONS[slot];
            const isActive = slot === currentSlot;
            const color = SLOT_COLORS[slot];
            const sp = slotProgress[slot];
            return (
              <TouchableOpacity
                key={slot}
                style={[styles.tab, isActive && { borderBottomColor: color.accent }]}
                onPress={() => setCurrentSlot(slot)}
              >
                <Icon size={18} color={isActive ? color.accent : '#aaa'} />
                <Text style={[styles.tabText, isActive && { color: color.accent, fontWeight: '700' }]}>
                  {SLOT_LABELS[slot]}
                </Text>
                {sp.total > 0 && (
                  <Text style={[styles.tabCount, isActive && { color: color.accent }]}>
                    {sp.done}/{sp.total}
                  </Text>
                )}
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
              <Text style={styles.emptyTitle}>ルーティン機能を準備中</Text>
              <Text style={styles.emptySub}>
                データベースの準備が必要です。管理者にお問い合わせください。
              </Text>
            </View>
          ) : currentSlotItems.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconWrap, { backgroundColor: slotColor.light }]}>
                {(() => {
                  const Icon = SLOT_ICONS[currentSlot];
                  return <Icon size={32} color={slotColor.accent} />;
                })()}
              </View>
              <Text style={styles.emptyTitle}>{SLOT_LABELS[currentSlot]}の習慣がありません</Text>
              <Text style={styles.emptySub}>
                右上の設定アイコンからテンプレートを作成すると{'\n'}毎日の習慣として表示されます
              </Text>
              <TouchableOpacity style={styles.emptyActionBtn} onPress={openTemplateModal}>
                <Settings size={16} color="#fff" />
                <Text style={styles.emptyActionText}>テンプレートを作成</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {currentSlotItems.map((item) => {
                const checked = completedItemIds.has(item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.card, checked && styles.cardDone]}
                    onPress={() => toggleCompletion(item.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, checked && { backgroundColor: slotColor.accent, borderColor: slotColor.accent }]}>
                      {checked && <Check size={14} color="#fff" strokeWidth={3} />}
                    </View>
                    <Text
                      style={[styles.cardText, checked && styles.cardTextDone]}
                      numberOfLines={2}
                    >
                      {item.short_label?.trim() || item.title}
                    </Text>
                    {checked && (
                      <CheckCircle size={18} color={slotColor.accent} style={{ marginLeft: 8 }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>
      </GestureDetector>

      {!routineTablesMissing && (
        <TouchableOpacity style={styles.fab} onPress={openAddModal} activeOpacity={0.8}>
          <Plus size={26} color="#fff" />
        </TouchableOpacity>
      )}

      <ScheduleCalendarModal
        visible={calendarVisible}
        currentDate={currentDate}
        onSelectDate={jumpToDate}
        onClose={() => setCalendarVisible(false)}
      />

      <Modal visible={addModalVisible} animationType="fade" transparent onRequestClose={closeAddModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.addModalContent}>
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>今日だけのタスクを追加</Text>
              <TouchableOpacity onPress={closeAddModal} style={styles.closeBtn}>
                <X size={22} color="#999" />
              </TouchableOpacity>
            </View>
            <Text style={styles.addModalSub}>
              {SLOT_LABELS[currentSlot]}のスロットに追加されます。テンプレートには含まれません。
            </Text>
            <TextInput
              style={styles.addInput}
              placeholder="タスクの内容..."
              placeholderTextColor="#bbb"
              value={newItemTitle}
              onChangeText={setNewItemTitle}
              autoFocus
              maxLength={100}
              returnKeyType="done"
              onSubmitEditing={saveNewTodayTask}
            />
            <View style={styles.addModalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeAddModal}>
                <Text style={styles.cancelBtnText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, !newItemTitle.trim() && styles.saveBtnDisabled]}
                onPress={saveNewTodayTask}
                disabled={!newItemTitle.trim()}
              >
                <Text style={styles.saveBtnText}>追加</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={templateModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeTemplateModal}
      >
        <SafeAreaView style={styles.tmRoot}>
          <View style={styles.tmHeader}>
            <Text style={styles.tmTitle}>テンプレート編集</Text>
            <TouchableOpacity onPress={closeTemplateModal} style={styles.tmDoneBtn}>
              <Text style={styles.tmDoneText}>完了</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.tmDesc}>
            ここで登録した習慣が毎日のチェックリストとして表示されます。
          </Text>
          <ScrollView style={styles.tmScroll} keyboardShouldPersistTaps="handled">
            {SLOTS.map((slot) => {
              const color = SLOT_COLORS[slot];
              const Icon = SLOT_ICONS[slot];
              const slotItems = allItemsBySlot[slot].sort((a, b) => a.sort_order - b.sort_order);
              return (
                <View key={slot} style={styles.tmSection}>
                  <View style={[styles.tmSectionHead, { backgroundColor: color.light }]}>
                    <View style={styles.tmSectionTitleRow}>
                      <Icon size={18} color={color.accent} />
                      <Text style={[styles.tmSectionTitle, { color: color.accent }]}>
                        {SLOT_LABELS[slot]}
                      </Text>
                      <Text style={styles.tmSectionCount}>{slotItems.filter((i) => i.is_active).length}件</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.tmAddBtn, { backgroundColor: color.accent }]}
                      onPress={() => addItemToTemplate(slot)}
                    >
                      <Plus size={16} color="#fff" />
                      <Text style={styles.tmAddBtnText}>追加</Text>
                    </TouchableOpacity>
                  </View>
                  {slotItems.map((item, idx) => {
                    const isEditing = templateEditingId === item.id;
                    return (
                      <View
                        key={item.id}
                        style={[styles.tmRow, !item.is_active && styles.tmRowInactive]}
                      >
                        <TouchableOpacity
                          style={[styles.tmActiveToggle, item.is_active && { backgroundColor: color.accent, borderColor: color.accent }]}
                          onPress={() => toggleTemplateActive(item)}
                        >
                          {item.is_active && <Check size={12} color="#fff" strokeWidth={3} />}
                        </TouchableOpacity>
                        <View style={styles.tmRowContent}>
                          {isEditing ? (
                            <TextInput
                              style={styles.tmEditInput}
                              value={templateEditText}
                              onChangeText={setTemplateEditText}
                              placeholder="習慣名を入力..."
                              placeholderTextColor="#bbb"
                              autoFocus
                              maxLength={100}
                              returnKeyType="done"
                              onSubmitEditing={() => saveTemplateItemTitle(item.id, templateEditText)}
                              onBlur={() => saveTemplateItemTitle(item.id, templateEditText)}
                            />
                          ) : (
                            <TouchableOpacity
                              onPress={() => {
                                setTemplateEditingId(item.id);
                                setTemplateEditText(item.title);
                              }}
                              style={styles.tmTitleTouch}
                            >
                              <Text style={[styles.tmItemTitle, !item.is_active && styles.tmItemTitleInactive]}>
                                {item.title || '(タップして名前を入力)'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <View style={styles.tmRowActions}>
                          <TouchableOpacity
                            onPress={() => moveTemplateItem(item, -1)}
                            disabled={idx === 0}
                            style={styles.tmIconBtn}
                          >
                            <ChevronUp size={18} color={idx === 0 ? '#ddd' : '#888'} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => moveTemplateItem(item, 1)}
                            disabled={idx === slotItems.length - 1}
                            style={styles.tmIconBtn}
                          >
                            <ChevronDown size={18} color={idx === slotItems.length - 1 ? '#ddd' : '#888'} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => deleteTemplateItem(item)} style={styles.tmIconBtn}>
                            <Trash2 size={16} color="#E8654A" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                  {slotItems.length === 0 && (
                    <View style={styles.tmEmptySlot}>
                      <Text style={styles.tmEmptyText}>習慣がまだありません</Text>
                    </View>
                  )}
                </View>
              );
            })}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f6f6',
  },
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eaeaea',
    paddingHorizontal: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111',
    letterSpacing: -0.5,
  },
  templateBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 8,
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
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
  },
  todayBadge: {
    fontSize: 9,
    fontWeight: '800',
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
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 8,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#eee',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#222',
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    minWidth: 32,
    textAlign: 'right',
  },
  tabBar: {
    flexDirection: 'row',
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#aaa',
  },
  tabCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#bbb',
    marginLeft: 2,
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
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#222',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyActionText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  cardDone: {
    backgroundColor: '#fafafa',
    borderColor: '#f0f0f0',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#d0d0d0',
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    fontSize: 15,
    color: '#222',
    lineHeight: 22,
  },
  cardTextDone: {
    color: '#aaa',
    textDecorationLine: 'line-through',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  addModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    padding: 24,
  },
  addModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  addModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  addModalSub: {
    fontSize: 12,
    color: '#999',
    marginBottom: 16,
    lineHeight: 18,
  },
  closeBtn: {
    padding: 4,
  },
  addInput: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    backgroundColor: '#fafafa',
    marginBottom: 16,
    color: '#222',
  },
  addModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#222',
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#d0d0d0',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  tmRoot: {
    flex: 1,
    backgroundColor: '#f6f6f6',
  },
  tmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eaeaea',
  },
  tmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  tmDoneBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  tmDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  tmDesc: {
    fontSize: 12,
    color: '#999',
    paddingHorizontal: 20,
    paddingVertical: 10,
    lineHeight: 18,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eaeaea',
  },
  tmScroll: {
    flex: 1,
    padding: 16,
  },
  tmSection: {
    marginBottom: 20,
  },
  tmSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 8,
  },
  tmSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tmSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  tmSectionCount: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
    marginLeft: 4,
  },
  tmAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  tmAddBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  tmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  tmRowInactive: {
    opacity: 0.5,
  },
  tmActiveToggle: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d0d0d0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  tmRowContent: {
    flex: 1,
    marginRight: 6,
  },
  tmEditInput: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    fontSize: 14,
    backgroundColor: '#fafafa',
    color: '#222',
  },
  tmTitleTouch: {
    paddingVertical: 4,
  },
  tmItemTitle: {
    fontSize: 14,
    color: '#222',
    lineHeight: 20,
  },
  tmItemTitleInactive: {
    color: '#999',
  },
  tmRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tmIconBtn: {
    padding: 5,
  },
  tmEmptySlot: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  tmEmptyText: {
    fontSize: 13,
    color: '#bbb',
  },
});
