import { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  AppState,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, ChevronLeft, ChevronRight, Target, ListChecks } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Workspace, Todo, UserSettings, WorkspaceType } from '@/types/database';
import WorkspacePage from '@/components/WorkspacePage';
import GoalView from '@/components/goals/GoalView';
import { parseDateString } from '@/lib/scheduleUtils';
import { useLanguage } from '@/contexts/LanguageContext';
import { checkPaidAccess } from '@/lib/aiAccess';

type ViewMode = 'todo' | 'goals';

interface PageData {
  workspace: Workspace | null;
  todos: Todo[];
  date: string;
}

export default function WorkspaceScreen() {
  const { user, authReady } = useAuth();
  const { t, lang } = useLanguage();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [workspaceDates, setWorkspaceDates] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Top-of-workspace tab: switch between goal view and the date-swipe ToDo
  // grid. Defaults to 'todo' so existing behavior is preserved.
  const [viewMode, setViewMode] = useState<ViewMode>('todo');

  // 目標機能 (goals タブ) は「有料機能」だが「AI 機能」ではない。
  // 仕様:
  //   - サブスク (basic / standard / pro いずれか) があれば Goals 閲覧/編集 OK
  //   - Goal Coach (= AI による分解・コーチング) のみ AI Standard / Pro が必要
  //     (Goal Coach への gate は GoalView.tsx 内のボタンと goal-coach.tsx 画面側で実施)
  // UX 要件:
  //   1. タップ時に先に Goals 画面に切り替えてから、paywall モーダルを上に被せる
  //      (= 「何が使えるのか」がチラッと見えるので「課金してまで使いたい」となりやすい)
  //   2. paywall を購入せずに閉じた場合、useFocusEffect 側で検知して todo タブに戻す
  //      (= 「課金しないと作業できない」状態にする)
  //   3. 課金前にバックグラウンドで操作させない (= ロック中はタップ無効)
  const [goalsLocked, setGoalsLocked] = useState(false); // = 「Goals 表示中だが未加入」
  const handleSwitchToGoals = useCallback(async () => {
    if (!user) return;
    if (viewMode === 'goals') return;
    // 先に表示。これで Goals 画面がチラッと見える
    setViewMode('goals');
    // 「サブスク何でも持っているか」をチェック (Basic でも Goals 自体は使える)。
    // 未契約なら paywall を即時出す。
    const access = await checkPaidAccess(user.id);
    if (!access.allowed) {
      setGoalsLocked(true);
      router.push('/paywall');
    } else {
      setGoalsLocked(false);
    }
  }, [user, viewMode, router]);

  // ワークスペース画面が再フォーカス (= paywall モーダルが閉じた直後など) するたびに
  // access を再確認。Goals 表示中なのに未加入のままなら todo タブに自動で戻す。
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      if (viewMode !== 'goals') return;
      let cancelled = false;
      (async () => {
        const access = await checkPaidAccess(user.id);
        if (cancelled) return;
        if (!access.allowed) {
          // 未加入のまま戻ってきた → todo タブへ戻す + ロック解除 (= goalsLocked リセット)
          setViewMode('todo');
          setGoalsLocked(false);
        } else {
          // 課金完了 → ロック解除して Goals そのまま使わせる
          setGoalsLocked(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [user, viewMode]),
  );
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

  // ログイン直後、React 側の `user` がセットされても Supabase クライアントが
  // access_token を HTTP ヘッダに付け切る前に fetch が走ると、user_settings /
  // workspaces クエリが RLS で空を返し、ワークスペースが空のまま固まる
  // (アプリ再起動の cold start では getSession() 済みで直る、という症状)。
  // AuthContext の `authReady` がトークン伝播済みを保証するので、それを待って
  // から最初の取得を行う。authReady が true に変わった瞬間に再実行される。
  useEffect(() => {
    if (!user || !authReady) return;
    loadSettings();
  }, [user?.id, authReady]);

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

  const settingsRef = useRef(settings);
  const workspaceDatesRef = useRef(workspaceDates);
  const currentIndexRef = useRef(currentIndex);
  const loadPageDataRef = useRef<(dateStr: string, type: WorkspaceType) => Promise<void>>(async () => {});
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { workspaceDatesRef.current = workspaceDates; }, [workspaceDates]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      loadSettings();
      const s = settingsRef.current;
      const dates = workspaceDatesRef.current;
      if (!s || dates.length === 0) return;
      loadedDates.current.clear();
      const currentType = s.default_workspace_type || 'four_grid';
      const rangePadding = 2;
      const idx = currentIndexRef.current;
      const startIdx = Math.max(0, idx - rangePadding);
      const endIdx = Math.min(dates.length - 1, idx + rangePadding);
      for (let i = startIdx; i <= endIdx; i++) {
        const dateStr = dates[i];
        if (!dateStr) continue;
        loadedDates.current.add(dateStr);
        loadPageDataRef.current(dateStr, currentType);
      }
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
      // Auth トークンが未伝播のうちに RLS 依存クエリを投げると空が返るため、
      // access_token を確認してから取得する。
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
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
          .upsert({ default_workspace_type: 'four_grid', user_id: user.id }, { onConflict: 'user_id' })
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

  // Default `true`: preserve the user's current page when re-running on focus
  // or app-resume. On the very first call, `workspaceDates` is still empty so
  // the preserve branch sees `currentDateString = null` and falls back to today
  // — initial-mount behavior is unchanged.
  const loadWorkspaceDates = async (preserveCurrentDate: boolean = true) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const currentType = settings?.default_workspace_type || 'four_grid';
      const currentDateString = preserveCurrentDate && workspaceDates[currentIndex]
        ? workspaceDates[currentIndex] : null;

      if (!user) return;

      const { data: workspaces, error } = await supabase
        .from('workspaces')
        .select('id, date, type')
        .eq('user_id', user.id)
        .order('date', { ascending: false }) as { data: Array<{ id: string; date: string; type: string }> | null; error: any };
      if (error) throw error;

      const { data: workspacesWithTodos, error: todosError } = await supabase
        .from('todos')
        .select('workspace_id')
        .eq('user_id', user.id)
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
      const sortedDates = Array.from(new Set(allDates)).sort();
      setWorkspaceDates(sortedDates);
      setTodosWorkspaceCount(pastDatesWithTodos.length);

      // Resolve the new currentIndex.
      //  - preserve mode + date is still in the list → keep the user's page
      //  - preserve mode + date dropped (rare; e.g. type-switch) → fall back to today
      //  - no preserve (initial mount) → today
      let newIndex = 0;
      const todayIndex = sortedDates.indexOf(today);
      if (currentDateString) {
        const preservedIndex = sortedDates.indexOf(currentDateString);
        newIndex = preservedIndex >= 0
          ? preservedIndex
          : (todayIndex >= 0 ? todayIndex : 0);
      } else {
        newIndex = todayIndex >= 0 ? todayIndex : 0;
      }

      // Only update if it actually changes — avoids triggering loadVisiblePages
      // and other downstream effects on every focus refresh.
      if (newIndex !== currentIndexRef.current) {
        setCurrentIndex(newIndex);
      }
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

      if (!user) return;

      let ws: Workspace | null = null;
      const { data: existingWorkspace, error: fetchError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', dateStr)
        .maybeSingle() as { data: Workspace | null; error: any };
      if (fetchError) throw fetchError;

      if (existingWorkspace) {
        if (isFutureDate && existingWorkspace.type !== currentType) {
          const { data: updatedWorkspace, error: updateError } = await supabase
            .from('workspaces')
            .update({ type: currentType })
            .eq('id', existingWorkspace.id)
            .select()
            .single() as { data: Workspace | null; error: any };
          if (updateError) {
            console.error('Workspace UPDATE failed:', updateError);
            ws = existingWorkspace;
          } else {
            ws = updatedWorkspace ?? existingWorkspace;
          }
        } else {
          ws = existingWorkspace;
        }
      } else {
        if (!user) return;
        const date = parseDateString(dateStr);
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
          top_left: latestWs?.area_titles?.top_left || t('workspace.areaTopLeft'),
          top_right: latestWs?.area_titles?.top_right || t('workspace.areaTopRight'),
          bottom_left: latestWs?.area_titles?.bottom_left || t('workspace.areaBottomLeft'),
          bottom_right: latestWs?.area_titles?.bottom_right || t('workspace.areaBottomRight'),
        };

        const { data: newWorkspace, error: createError } = await supabase
          .from('workspaces')
          .insert({
            title: formatDateTitle(date),
            type: currentType,
            date: dateStr,
            user_id: user.id,
            area_titles: inheritedTitles,
          })
          .select()
          .single() as { data: Workspace | null; error: any };

        if (createError) {
          if (createError.code === '23505') {
            const { data: existing } = await supabase
              .from('workspaces')
              .select('*')
              .eq('user_id', user.id)
              .eq('date', dateStr)
              .maybeSingle() as { data: Workspace | null; error: any };
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
          .order('order', { ascending: true }) as { data: Todo[] | null; error: any };
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

  useEffect(() => {
    loadPageDataRef.current = loadPageData;
  }, [user, t]);

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
          // Exact match — full update for the page that triggered the change
          next.set(key, { ...value, workspace: updatedWorkspace });
        } else if (
          value.workspace &&
          value.workspace.type === 'four_grid' &&
          updatedWorkspace.type === 'four_grid'
        ) {
          // Propagate area_titles to every other cached four_grid page so
          // the rename is reflected immediately without a refetch.
          next.set(key, {
            ...value,
            workspace: {
              ...value.workspace,
              area_titles: updatedWorkspace.area_titles,
            },
          });
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
    length: screenWidth,
    offset: screenWidth * index,
    index,
  }), [screenWidth]);

  const renderItem = useCallback(({ item: dateStr, index }: { item: string; index: number }) => {
    const pageData = pagesData.get(dateStr);

    return (
      <View style={[styles.pageWrapper, { width: screenWidth }]}>
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
              <Text style={styles.pageLoadingText}>{t('common.loading')}</Text>
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
    const daysJa = ['日', '月', '火', '水', '木', '金', '土'];
    const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayOfWeek = (lang === 'en' ? daysEn : daysJa)[date.getDay()];
    return t('dateFormat.yearMonthDayDow', { year, month, day, dow: dayOfWeek });
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
    return t('dateFormat.yearMonth', { year, month });
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
      const newDates = [...workspaceDates, dateString].sort();
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
  const currentDateStr = workspaceDates[currentIndex];
  const currentTitle = currentDateStr
    ? formatDateTitle(parseDateString(currentDateStr))
    : (currentPageData?.workspace?.title || '');

  if (!settings || workspaceDates.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top tab switcher: ToDo (left, primary) ↔ goals (right, secondary). */}
      <View style={styles.topTabs}>
        <TouchableOpacity
          style={[styles.topTabBtn, viewMode === 'todo' && styles.topTabBtnActive]}
          onPress={() => setViewMode('todo')}
          activeOpacity={0.75}
        >
          <ListChecks
            size={14}
            color={viewMode === 'todo' ? '#0F172A' : '#94A3B8'}
            strokeWidth={2.4}
          />
          <Text
            style={[
              styles.topTabText,
              viewMode === 'todo' && styles.topTabTextActive,
            ]}
          >
            {t('workspace.topTabTodo')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.topTabBtn, viewMode === 'goals' && styles.topTabBtnActive]}
          onPress={handleSwitchToGoals}
          activeOpacity={0.75}
        >
          <Target
            size={14}
            color={viewMode === 'goals' ? '#0F172A' : '#94A3B8'}
            strokeWidth={2.4}
          />
          <Text
            style={[
              styles.topTabText,
              viewMode === 'goals' && styles.topTabTextActive,
            ]}
          >
            {t('workspace.topTabGoals')}
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'goals' ? (
        // 課金前 (goalsLocked=true) はタッチを完全に遮断するラッパで囲う。
        // pointerEvents='none' で GoalView 内の全ボタン・入力が無効になる。
        // 視覚的にも 0.5 で薄くして「使えない」感を出す。
        <View
          style={{ flex: 1, opacity: goalsLocked ? 0.5 : 1 }}
          pointerEvents={goalsLocked ? 'none' : 'auto'}
        >
          <GoalView />
        </View>
      ) : (
        <>
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
                  <Text style={styles.todayJumpText}>{t('workspace.backToToday')}</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.pageIndicator}>{t('workspace.pageCount', { count: todosWorkspaceCount })}</Text>
          </View>

          <KeyboardAvoidingView
            style={styles.flatList}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
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
          </KeyboardAvoidingView>
        </>
      )}

      <Modal
        visible={isDatePickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsDatePickerVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('workspace.selectDate')}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={() => setIsDatePickerVisible(false)}>
              <Text style={styles.closeButtonText}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.modalDescription}>
            <Text style={styles.descriptionText}>
              {t('workspace.selectFutureDateHint')}
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
            {(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const).map(day => (
              <Text key={day} style={styles.weekdayText}>{t(`weekdays.${day}`)}</Text>
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
  topTabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 11,
    padding: 3,
    gap: 2,
  },
  topTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: 'transparent',
  },
  topTabBtnActive: {
    backgroundColor: '#fff',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
        }
      : { elevation: 1 }),
  },
  topTabText: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  topTabTextActive: { color: '#0F172A' },
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
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    maxWidth: 50,
    maxHeight: 50,
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
