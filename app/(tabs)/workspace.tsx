import { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Modal,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Workspace, Todo, UserSettings, WorkspaceType } from '@/types/database';
import WorkspacePage from '@/components/WorkspacePage';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface PageData {
  workspace: Workspace | null;
  todos: Todo[];
  date: string;
}

export default function WorkspaceScreen() {
  const { user } = useAuth();
  const [workspaceDates, setWorkspaceDates] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [pagesData, setPagesData] = useState<Map<string, PageData>>(new Map());
  const [todosWorkspaceCount, setTodosWorkspaceCount] = useState(0);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const previousWorkspaceType = useRef<string | null>(null);
  const loadedDates = useRef<Set<string>>(new Set());
  const initialScrollDone = useRef(false);

  useEffect(() => {
    if (!user) return;
    loadSettings();
  }, [user]);

  useEffect(() => {
    if (settings && user) {
      loadWorkspaceDates();
    }
  }, [settings, user]);

  useEffect(() => {
    if (!settings || workspaceDates.length === 0) return;
    const currentType = settings.default_workspace_type;
    if (previousWorkspaceType.current === null) {
      previousWorkspaceType.current = currentType;
      return;
    }
    if (previousWorkspaceType.current !== currentType) {
      previousWorkspaceType.current = currentType;
      loadedDates.current.clear();
      setPagesData(new Map());
      loadVisiblePages(currentIndex);
    }
  }, [settings?.default_workspace_type]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') await loadSettings();
    });
    return () => subscription.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      loadSettings();
    }, [user])
  );

  useEffect(() => {
    if (workspaceDates.length > 0 && settings) {
      if (previousWorkspaceType.current === null) {
        previousWorkspaceType.current = settings.default_workspace_type;
      }
      loadVisiblePages(currentIndex);
    }
  }, [currentIndex, workspaceDates, settings]);

  useEffect(() => {
    if (workspaceDates.length > 0 && !initialScrollDone.current) {
      initialScrollDone.current = true;
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: currentIndex, animated: false });
      }, 100);
    }
  }, [workspaceDates]);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .limit(1)
        .maybeSingle() as { data: UserSettings | null; error: any };
      if (error) throw error;
      if (!data) {
        if (!user) return;
        const { data: newSettings, error: insertError } = await supabase
          .from('user_settings')
          .insert({ default_workspace_type: 'four_grid', user_id: user.id } as any)
          .select()
          .single() as { data: UserSettings | null; error: any };
        if (insertError) throw insertError;
        setSettings(newSettings);
      } else {
        setSettings(data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadWorkspaceDates = async (preserveCurrentDate: boolean = false) => {
    try {
      const currentType = settings?.default_workspace_type || 'four_grid';
      const currentDateString = preserveCurrentDate && workspaceDates[currentIndex]
        ? workspaceDates[currentIndex] : null;

      const { data: workspaces, error } = await supabase
        .from('workspaces')
        .select('id, date, type')
        .order('date', { ascending: false }) as { data: Array<{ id: string; date: string; type: string }> | null; error: any };
      if (error) throw error;

      const { data: workspacesWithTodos, error: todosError } = await supabase
        .from('todos')
        .select('workspace_id')
        .not('workspace_id', 'is', null) as { data: Array<{ workspace_id: string }> | null; error: any };
      if (todosError) throw todosError;

      const workspaceIdsWithTodos = new Set(workspacesWithTodos?.map(t => t.workspace_id) || []);
      const today = formatDate(new Date());

      const pastDatesWithTodos = (workspaces || [])
        .filter(w => workspaceIdsWithTodos.has(w.id) && w.type === currentType)
        .map(w => w.date);

      const futureDates = [];
      for (let i = 0; i <= 365; i++) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + i);
        futureDates.push(formatDate(futureDate));
      }

      const allDates = [...pastDatesWithTodos, ...futureDates];
      const sortedDates = Array.from(new Set(allDates)).sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
      );
      setWorkspaceDates(sortedDates);
      setTodosWorkspaceCount(pastDatesWithTodos.length);

      let newIndex = 0;
      if (currentDateString) {
        const preservedIndex = sortedDates.indexOf(currentDateString);
        newIndex = preservedIndex >= 0 ? preservedIndex : 0;
      } else {
        const todayIndex = sortedDates.indexOf(today);
        newIndex = todayIndex >= 0 ? todayIndex : 0;
      }
      setCurrentIndex(newIndex);
    } catch (error) {
      console.error('Error loading workspace dates:', error);
    }
  };

  const loadVisiblePages = async (centerIndex: number) => {
    if (!settings || workspaceDates.length === 0) return;
    const currentType = settings.default_workspace_type || 'four_grid';
    const rangePadding = 2;
    const startIdx = Math.max(0, centerIndex - rangePadding);
    const endIdx = Math.min(workspaceDates.length - 1, centerIndex + rangePadding);

    for (let i = startIdx; i <= endIdx; i++) {
      const dateStr = workspaceDates[i];
      if (!dateStr || loadedDates.current.has(dateStr)) continue;
      loadedDates.current.add(dateStr);
      loadPageData(dateStr, currentType);
    }
  };

  const loadPageData = async (dateStr: string, currentType: WorkspaceType) => {
    try {
      const today = formatDate(new Date());
      const isFutureDate = dateStr >= today;

      let ws: Workspace | null = null;
      const { data: existingWorkspace, error: fetchError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('date', dateStr)
        .maybeSingle() as { data: Workspace | null; error: any };
      if (fetchError) throw fetchError;

      if (existingWorkspace) {
        if (isFutureDate && existingWorkspace.type !== currentType) {
          const { data: updatedWorkspace } = await supabase
            .from('workspaces')
            .update({ type: currentType })
            .eq('date', dateStr)
            .select()
            .single() as { data: Workspace | null; error: any };
          ws = updatedWorkspace;
        } else {
          ws = existingWorkspace;
        }
      } else {
        if (!user) return;
        const date = new Date(dateStr);
        const { data: latestWs } = await supabase
          .from('workspaces')
          .select('area_titles')
          .eq('user_id', user.id)
          .eq('type', currentType)
          .not('area_titles', 'is', null)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle() as { data: { area_titles: Workspace['area_titles'] } | null; error: any };

        const inheritedTitles = {
          top_left: latestWs?.area_titles?.top_left || '\u5DE6\u4E0A\u30A8\u30EA\u30A2',
          top_right: latestWs?.area_titles?.top_right || '\u53F3\u4E0A\u30A8\u30EA\u30A2',
          bottom_left: latestWs?.area_titles?.bottom_left || '\u5DE6\u4E0B\u30A8\u30EA\u30A2',
          bottom_right: latestWs?.area_titles?.bottom_right || '\u53F3\u4E0B\u30A8\u30EA\u30A2',
        };

        const { data: newWorkspace, error: createError } = await supabase
          .from('workspaces')
          .insert({
            title: formatDateTitle(date),
            type: currentType,
            date: dateStr,
            user_id: user.id,
            area_titles: inheritedTitles,
          } as any)
          .select()
          .single() as { data: Workspace | null; error: any };

        if (createError) {
          if (createError.code === '23505') {
            const { data: existing } = await supabase
              .from('workspaces')
              .select('*')
              .eq('date', dateStr)
              .single() as { data: Workspace | null; error: any };
            ws = existing;
          } else {
            throw createError;
          }
        } else {
          ws = newWorkspace;
        }
      }

      let pageTodos: Todo[] = [];
      if (ws) {
        const { data: td } = await supabase
          .from('todos')
          .select('*')
          .eq('workspace_id', ws.id)
          .order('created_at', { ascending: true }) as { data: Todo[] | null; error: any };
        let filteredTodos = td || [];
        if (ws.type === 'four_grid') {
          filteredTodos = filteredTodos.filter(todo => todo.grid_area !== null);
        } else if (ws.type === 'individual') {
          filteredTodos = filteredTodos.filter(todo => todo.grid_area === null);
        }
        pageTodos = filteredTodos;
      }

      setPagesData(prev => {
        const next = new Map(prev);
        next.set(dateStr, { workspace: ws, todos: pageTodos, date: dateStr });
        return next;
      });
    } catch (error) {
      console.error('Error loading page data for', dateStr, error);
    }
  };

  const handleTodosChange = useCallback((workspaceId: string, newTodos: Todo[]) => {
    setPagesData(prev => {
      const next = new Map(prev);
      for (const [key, value] of next.entries()) {
        if (value.workspace?.id === workspaceId) {
          next.set(key, { ...value, todos: newTodos });
          break;
        }
      }
      return next;
    });
  }, []);

  const handleWorkspaceChange = useCallback((updatedWorkspace: Workspace) => {
    setPagesData(prev => {
      const next = new Map(prev);
      for (const [key, value] of next.entries()) {
        if (value.workspace?.id === updatedWorkspace.id) {
          next.set(key, { ...value, workspace: updatedWorkspace });
          break;
        }
      }
      return next;
    });
  }, []);

  const handleDataChanged = useCallback(() => {
    loadWorkspaceDates(true);
  }, [settings, workspaceDates, currentIndex]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const centerItem = viewableItems[Math.floor(viewableItems.length / 2)] || viewableItems[0];
      if (centerItem) {
        setCurrentIndex(centerItem.index);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

  const scrollToIndex = useCallback((index: number) => {
    setCurrentIndex(index);
    flatListRef.current?.scrollToIndex({ index, animated: true });
  }, []);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: SCREEN_WIDTH,
    offset: SCREEN_WIDTH * index,
    index,
  }), []);

  const renderItem = useCallback(({ item: dateStr, index }: { item: string; index: number }) => {
    const pageData = pagesData.get(dateStr);

    return (
      <View style={styles.pageWrapper}>
        <View style={styles.pageContent}>
          {pageData?.workspace && settings ? (
            <WorkspacePage
              workspace={pageData.workspace}
              todos={pageData.todos}
              settings={settings}
              onTodosChange={handleTodosChange}
              onWorkspaceChange={handleWorkspaceChange}
              onDataChanged={handleDataChanged}
              isCurrentPage={index === currentIndex}
            />
          ) : (
            <View style={styles.pageLoading}>
              <Text style={styles.pageLoadingText}>{'\u8AAD\u307F\u8FBC\u307F\u4E2D...'}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }, [pagesData, settings, currentIndex, handleTodosChange, handleWorkspaceChange, handleDataChanged]);

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateTitle = (date: Date): string => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = ['\u65E5', '\u6708', '\u706B', '\u6C34', '\u6728', '\u91D1', '\u571F'][date.getDay()];
    return `${year}\u5E74${month}\u6708${day}\u65E5 (${dayOfWeek})`;
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return { daysInMonth: lastDay.getDate(), startingDayOfWeek: firstDay.getDay() };
  };

  const getMonthName = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}\u5E74${month}\u6708`;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentMonth);
    if (direction === 'prev') newMonth.setMonth(newMonth.getMonth() - 1);
    else newMonth.setMonth(newMonth.getMonth() + 1);
    setCurrentMonth(newMonth);
  };

  const isDateInFuture = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  };

  const isDateToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const selectDate = (dateString: string) => {
    setSelectedDate(dateString);
    let targetIndex = workspaceDates.indexOf(dateString);
    if (targetIndex === -1) {
      const newDates = [...workspaceDates, dateString].sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
      );
      setWorkspaceDates(newDates);
      targetIndex = newDates.indexOf(dateString);
    }
    if (targetIndex !== -1) {
      scrollToIndex(targetIndex);
    }
    setIsDatePickerVisible(false);
  };

  const renderCalendarDay = (day: number, isCurrentMonth: boolean = true) => {
    if (!isCurrentMonth) {
      return <View key={`empty-${day}`} style={styles.calendarDay} />;
    }
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const dateString = formatDate(date);
    const isFuture = isDateInFuture(date);
    const isToday = isDateToday(date);
    const isSelected = selectedDate === dateString;

    return (
      <TouchableOpacity
        key={day}
        style={[
          styles.calendarDay,
          isToday && styles.todayCalendarDay,
          isSelected && styles.selectedCalendarDay,
          !isFuture && styles.pastCalendarDay,
        ]}
        onPress={() => isFuture && selectDate(dateString)}
        disabled={!isFuture}
      >
        <Text
          style={[
            styles.calendarDayText,
            isToday && styles.todayCalendarDayText,
            isSelected && styles.selectedCalendarDayText,
            !isFuture && styles.pastCalendarDayText,
          ]}
        >
          {day}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderCalendar = () => {
    const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentMonth);
    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(renderCalendarDay(i, false));
    }
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(renderCalendarDay(day));
    }
    return days;
  };

  const currentPageData = workspaceDates[currentIndex]
    ? pagesData.get(workspaceDates[currentIndex])
    : null;
  const currentTitle = currentPageData?.workspace?.title || '';

  if (!settings || workspaceDates.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{'\u8AAD\u307F\u8FBC\u307F\u4E2D...'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.dateContainer} onPress={() => setIsDatePickerVisible(true)}>
            <Calendar size={20} color="#000" />
            <Text style={styles.headerTitle}>{currentTitle}</Text>
          </TouchableOpacity>
          {workspaceDates[currentIndex] !== formatDate(new Date()) && (
            <TouchableOpacity
              style={styles.todayJumpBtn}
              onPress={() => {
                const todayStr = formatDate(new Date());
                const idx = workspaceDates.indexOf(todayStr);
                if (idx >= 0) scrollToIndex(idx);
              }}
            >
              <Text style={styles.todayJumpText}>{'\u4ECA\u65E5\u3078\u623B\u308B'}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.pageIndicator}>{todosWorkspaceCount} {'\u30DA\u30FC\u30B8'}</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={workspaceDates}
        renderItem={renderItem}
        keyExtractor={(item) => item}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialScrollIndex={currentIndex}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 100);
        }}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={false}
        style={styles.flatList}
      />

      <Modal
        visible={isDatePickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsDatePickerVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{'\u65E5\u4ED8\u3092\u9078\u629E'}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={() => setIsDatePickerVisible(false)}>
              <Text style={styles.closeButtonText}>{'\u9589\u3058\u308B'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.modalDescription}>
            <Text style={styles.descriptionText}>
              {'\u672A\u6765\u306E\u65E5\u4ED8\u3092\u9078\u629E\u3057\u3066\u3001\u305D\u306E\u65E5\u306EToDo\u3092\u4F5C\u6210\u3067\u304D\u307E\u3059'}
            </Text>
          </View>
          <View style={styles.calendarHeader}>
            <TouchableOpacity style={styles.monthNavButton} onPress={() => navigateMonth('prev')}>
              <ChevronLeft size={24} color="#007AFF" />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{getMonthName(currentMonth)}</Text>
            <TouchableOpacity style={styles.monthNavButton} onPress={() => navigateMonth('next')}>
              <ChevronRight size={24} color="#007AFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.weekdayHeader}>
            {['\u65E5', '\u6708', '\u706B', '\u6C34', '\u6728', '\u91D1', '\u571F'].map(day => (
              <Text key={day} style={styles.weekdayText}>{day}</Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {renderCalendar()}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5dc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  todayJumpBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#222',
  },
  todayJumpText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  pageIndicator: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  flatList: {
    flex: 1,
  },
  pageWrapper: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  pageContent: {
    flex: 1,
  },
  pageLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageLoadingText: {
    fontSize: 14,
    color: '#999',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  modalDescription: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  descriptionText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  monthNavButton: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  weekdayHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  calendarDayText: {
    fontSize: 16,
    color: '#000',
  },
  todayCalendarDay: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
  },
  todayCalendarDayText: {
    color: '#fff',
    fontWeight: '600',
  },
  selectedCalendarDay: {
    backgroundColor: '#e8f5e8',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#28a745',
  },
  selectedCalendarDayText: {
    color: '#28a745',
    fontWeight: '600',
  },
  pastCalendarDay: {
    opacity: 0.3,
  },
  pastCalendarDayText: {
    color: '#999',
  },
});
