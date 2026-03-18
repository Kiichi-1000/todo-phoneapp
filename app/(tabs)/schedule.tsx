import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, List, ChartPie as PieChart, Calendar } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Schedule, UserSettings, Todo } from '@/types/database';
import { formatDate, formatDateDisplay, SCHEDULE_COLORS } from '@/lib/scheduleUtils';
import ScheduleListView from '@/components/ScheduleListView';
import ScheduleCircleView from '@/components/ScheduleCircleView';
import ScheduleItemEditor from '@/components/ScheduleItemEditor';
import ScheduleCalendarModal from '@/components/ScheduleCalendarModal';

type ViewMode = 'list' | 'circle';

const SWIPE_THRESHOLD = 50;
const SCREEN_WIDTH = Dimensions.get('window').width;

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

export default function ScheduleScreen() {
  const { user } = useAuth();
  const [allDates] = useState<string[]>(() => generateDates());
  const [currentIndex, setCurrentIndex] = useState(() => getTodayIndex(generateDates()));
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Partial<Schedule> | null>(null);
  const [isNewSchedule, setIsNewSchedule] = useState(true);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const translateX = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);

  const currentDate = allDates[currentIndex];
  const isToday = currentDate === formatDate(new Date());

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SWIPE_THRESHOLD) {
          goToPrevDate();
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          goToNextDate();
        }
      },
    })
  ).current;

  const goToNextDate = useCallback(() => {
    if (currentIndex >= allDates.length - 1 || isAnimating.current) return;
    isAnimating.current = true;
    Animated.timing(translateX, {
      toValue: -SCREEN_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setCurrentIndex(prev => prev + 1);
      translateX.setValue(SCREEN_WIDTH);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        isAnimating.current = false;
      });
    });
  }, [currentIndex, allDates.length, translateX]);

  const goToPrevDate = useCallback(() => {
    if (currentIndex <= 0 || isAnimating.current) return;
    isAnimating.current = true;
    Animated.timing(translateX, {
      toValue: SCREEN_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setCurrentIndex(prev => prev - 1);
      translateX.setValue(-SCREEN_WIDTH);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        isAnimating.current = false;
      });
    });
  }, [currentIndex, translateX]);

  const loadSchedules = useCallback(async () => {
    if (!user || !currentDate) return;
    try {
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', currentDate)
        .order('start_minutes', { ascending: true }) as { data: Schedule[] | null; error: any };

      if (error) throw error;
      setSchedules(data || []);
    } catch (e) {
      console.error('Error loading schedules:', e);
    }
  }, [user, currentDate]);

  const loadSettings = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .limit(1)
        .maybeSingle() as { data: UserSettings | null; error: any };
      if (!error && data) {
        setSettings(data);
      }
    } catch (e) {
      console.error('Error loading settings:', e);
    }
  }, [user]);

  const syncTodoReminders = useCallback(async () => {
    if (!user || !currentDate || !settings?.todo_schedule_sync) return;
    try {
      const dayStart = `${currentDate}T00:00:00`;
      const dayEnd = `${currentDate}T23:59:59`;

      const { data: todos, error } = await supabase
        .from('todos')
        .select('id, content, reminder_at')
        .gte('reminder_at', dayStart)
        .lte('reminder_at', dayEnd) as { data: Pick<Todo, 'id' | 'content' | 'reminder_at'>[] | null; error: any };

      if (error || !todos || todos.length === 0) return;

      const { data: existingSynced } = await supabase
        .from('schedules')
        .select('source_todo_id')
        .eq('user_id', user.id)
        .eq('date', currentDate)
        .eq('is_from_todo', true) as { data: { source_todo_id: string }[] | null; error: any };

      const syncedIds = new Set((existingSynced || []).map(s => s.source_todo_id));

      for (const todo of todos) {
        if (syncedIds.has(todo.id)) continue;
        const reminderDate = new Date(todo.reminder_at!);
        const startMin = reminderDate.getHours() * 60 + reminderDate.getMinutes();
        const endMin = Math.min(startMin + 30, 1440);

        await supabase.from('schedules').insert({
          user_id: user.id,
          date: currentDate,
          start_minutes: startMin,
          end_minutes: endMin,
          title: todo.content,
          color: '#E8654A',
          is_from_todo: true,
          source_todo_id: todo.id,
        } as any);
      }

      await loadSchedules();
    } catch (e) {
      console.error('Error syncing todos:', e);
    }
  }, [user, currentDate, settings, loadSchedules]);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings])
  );

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  useEffect(() => {
    if (settings) {
      syncTodoReminders();
    }
  }, [settings, currentDate, syncTodoReminders]);

  const handleSlotPress = (startMinutes: number) => {
    const colorIdx = schedules.length % SCHEDULE_COLORS.length;
    setEditingSchedule({
      start_minutes: startMinutes,
      end_minutes: Math.min(startMinutes + 60, 1440),
      title: '',
      color: SCHEDULE_COLORS[colorIdx],
    });
    setIsNewSchedule(true);
    setEditorVisible(true);
  };

  const handleSchedulePress = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setIsNewSchedule(false);
    setEditorVisible(true);
  };

  const handleSave = async (data: { title: string; start_minutes: number; end_minutes: number; color: string }) => {
    if (!user) return;
    try {
      if (isNewSchedule) {
        const { error } = await supabase.from('schedules').insert({
          user_id: user.id,
          date: currentDate,
          start_minutes: data.start_minutes,
          end_minutes: data.end_minutes,
          title: data.title,
          color: data.color,
          is_from_todo: false,
          source_todo_id: null,
        } as any);
        if (error) throw error;
      } else if (editingSchedule?.id) {
        const { error } = await supabase
          .from('schedules')
          .update({
            start_minutes: data.start_minutes,
            end_minutes: data.end_minutes,
            title: data.title,
            color: data.color,
          } as any)
          .eq('id', editingSchedule.id);
        if (error) throw error;
      }
      setEditorVisible(false);
      await loadSchedules();
    } catch (e) {
      console.error('Error saving schedule:', e);
      Alert.alert('エラー', '予定の保存に失敗しました');
    }
  };

  const handleDelete = async () => {
    if (!editingSchedule?.id) return;
    try {
      const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('id', editingSchedule.id);
      if (error) throw error;
      setEditorVisible(false);
      await loadSchedules();
    } catch (e) {
      console.error('Error deleting schedule:', e);
      Alert.alert('エラー', '予定の削除に失敗しました');
    }
  };

  const jumpToDate = (dateStr: string) => {
    const idx = allDates.indexOf(dateStr);
    if (idx >= 0) {
      setCurrentIndex(idx);
    }
    setCalendarVisible(false);
  };

  const jumpToToday = () => {
    const todayStr = formatDate(new Date());
    const idx = allDates.indexOf(todayStr);
    if (idx >= 0) setCurrentIndex(idx);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>スケジュール</Text>
          <View style={styles.modeSwitcher}>
            <TouchableOpacity
              style={[styles.modeBtn, viewMode === 'list' && styles.modeBtnActive]}
              onPress={() => setViewMode('list')}
            >
              <List size={18} color={viewMode === 'list' ? '#fff' : '#666'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, viewMode === 'circle' && styles.modeBtnActive]}
              onPress={() => setViewMode('circle')}
            >
              <PieChart size={18} color={viewMode === 'circle' ? '#fff' : '#666'} />
            </TouchableOpacity>
          </View>
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

      <Animated.View
        style={[styles.content, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {viewMode === 'list' ? (
          <ScheduleListView
            schedules={schedules}
            onSlotPress={handleSlotPress}
            onSchedulePress={handleSchedulePress}
          />
        ) : (
          <ScheduleCircleView
            schedules={schedules}
            onEmptyPress={handleSlotPress}
            onSchedulePress={handleSchedulePress}
          />
        )}
      </Animated.View>

      <ScheduleItemEditor
        visible={editorVisible}
        schedule={editingSchedule}
        onSave={handleSave}
        onDelete={isNewSchedule ? undefined : handleDelete}
        onClose={() => setEditorVisible(false)}
        isNew={isNewSchedule}
      />

      <ScheduleCalendarModal
        visible={calendarVisible}
        currentDate={currentDate}
        onSelectDate={jumpToDate}
        onClose={() => setCalendarVisible(false)}
      />
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
  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 3,
  },
  modeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  modeBtnActive: {
    backgroundColor: '#222',
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
});
