import { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Dimensions,
  Animated,
  PanResponder,
  Modal,
  Platform,
  AppState,
  KeyboardAvoidingView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Calendar, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Bell, Trash2 } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Workspace, Todo, GridArea, UserSettings, WorkspaceType } from '@/types/database';
import { DragDropProvider } from '@/components/DragDropContext';
import GridAreaDropTarget from '@/components/GridAreaDropTarget';
import ReminderPicker from '@/components/ReminderPicker';
import { scheduleReminderNotification, cancelReminderNotification } from '@/lib/notifications';

const GRID_AREAS: GridArea[] = ['top_left', 'top_right', 'bottom_left', 'bottom_right'];

const GRID_AREA_LABELS: Record<GridArea, string> = {
  top_left: '左上',
  top_right: '右上',
  bottom_left: '左下',
  bottom_right: '右下',
};

const SWIPE_THRESHOLD = 50;
const SCREEN_WIDTH = Dimensions.get('window').width;

export default function WorkspaceScreen() {
  const { user } = useAuth();
  const [workspaceDates, setWorkspaceDates] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [gridTitles, setGridTitles] = useState<Record<GridArea, string>>({
    top_left: '左上エリア',
    top_right: '右上エリア',
    bottom_left: '左下エリア',
    bottom_right: '右下エリア',
  });
  const [newTodoContent, setNewTodoContent] = useState<Record<GridArea, string>>({
    top_left: '',
    top_right: '',
    bottom_left: '',
    bottom_right: '',
  });

  // 日付選択モーダルの状態
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [todosWorkspaceCount, setTodosWorkspaceCount] = useState(0);
  
  // カレンダー用の状態
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  
  // エリア名編集用の状態
  const [editingArea, setEditingArea] = useState<GridArea | null>(null);
  const [editingAreaName, setEditingAreaName] = useState('');
  
  // タスク追加用の状態
  const [isAddingPostit, setIsAddingPostit] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  
  // タスク編集用の状態
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  
  const [reminderTodo, setReminderTodo] = useState<Todo | null>(null);
  const [longPressedTodo, setLongPressedTodo] = useState<string | null>(null);
  const [postitMenuTodo, setPostitMenuTodo] = useState<Todo | null>(null);
  const [postitMenuPosition, setPostitMenuPosition] = useState({ x: 0, y: 0 });
  // アニメーション用の値
  const translateX = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);
  const previousWorkspaceType = useRef<string | null>(null);

  const goToNextPage = () => {
    if (currentIndex > 0 && !isAnimating.current) {
      isAnimating.current = true;
      Animated.timing(translateX, {
        toValue: -SCREEN_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex(currentIndex - 1);
        translateX.setValue(SCREEN_WIDTH);
        Animated.timing(translateX, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          isAnimating.current = false;
        });
      });
    }
  };

  const goToPreviousPage = () => {
    if (currentIndex < workspaceDates.length - 1 && !isAnimating.current) {
      // 未来のページが足りない場合は動的に追加
      if (currentIndex === workspaceDates.length - 1) {
        addMoreFutureDates();
      }
      
      isAnimating.current = true;
      Animated.timing(translateX, {
        toValue: SCREEN_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex(currentIndex + 1);
        translateX.setValue(-SCREEN_WIDTH);
        Animated.timing(translateX, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          isAnimating.current = false;
        });
      });
    }
  };

  const addMoreFutureDates = () => {
    const lastDate = workspaceDates[workspaceDates.length - 1];
    const lastDateObj = new Date(lastDate);
    const newFutureDates: string[] = [];
    
    // 現在の最後の日付からさらに30日先まで追加
    for (let i = 1; i <= 30; i++) {
      const newDate = new Date(lastDateObj);
      newDate.setDate(newDate.getDate() + i);
      newFutureDates.push(formatDate(newDate));
    }
    
    setWorkspaceDates(prev => [...prev, ...newFutureDates]);
  };

  const openDatePicker = () => {
    setIsDatePickerVisible(true);
  };

  const selectDate = (dateString: string) => {
    setSelectedDate(dateString);
    
    // 選択した日付がワークスペースリストに存在するかチェック
    let targetIndex = workspaceDates.indexOf(dateString);
    
    // 存在しない場合は、その日付のワークスペースを作成して追加
    if (targetIndex === -1) {
      // 新しい日付をワークスペースリストに追加
      const newDates = [...workspaceDates, dateString].sort(
        (a, b) => new Date(b).getTime() - new Date(a).getTime()
      );
      setWorkspaceDates(newDates);
      targetIndex = newDates.indexOf(dateString);
    }
    
    if (targetIndex !== -1) {
      setCurrentIndex(targetIndex);
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
    
    // 前月の日付（空白）
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(renderCalendarDay(i, false));
    }
    
    // 当月の日付
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(renderCalendarDay(day));
    }
    
    return days;
  };

  // スワイプ用のPanResponder
  const swipePanResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return Math.abs(gestureState.dx) > 10;
    },
    onPanResponderRelease: (evt, gestureState) => {
      if (isAnimating.current) return;

      if (gestureState.dx > SWIPE_THRESHOLD) {
        goToPreviousPage();
      } else if (gestureState.dx < -SWIPE_THRESHOLD) {
        goToNextPage();
      }
    },
  });

  useEffect(() => {
    if (!user) return;
    const initializeApp = async () => {
      try {
        await loadSettings();
      } catch (error) {
        console.error('App initialization error:', error);
      }
    };

    initializeApp();
  }, [user]);

  useEffect(() => {
    if (settings && user) {
      loadWorkspaceDates();
    }
  }, [settings, user]);

  useEffect(() => {
    if (!settings || workspaceDates.length === 0 || !workspaceDates[currentIndex]) {
      return;
    }

    const currentType = settings.default_workspace_type;

    if (previousWorkspaceType.current === null) {
      previousWorkspaceType.current = currentType;
      return;
    }

    if (previousWorkspaceType.current !== currentType) {
      previousWorkspaceType.current = currentType;
      loadWorkspaceByDate(workspaceDates[currentIndex], true, currentType);
    }
  }, [settings?.default_workspace_type]);

  // 設定変更の検知用
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      // アプリがフォアグラウンドに戻ったときに設定を再読み込み
      if (nextAppState === 'active') {
        await loadSettings();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // 画面がフォーカスされたときに設定を再読み込みし、ワークスペースタイプを確認
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      const checkAndUpdateWorkspace = async () => {
        try {
          await loadSettings();
        } catch (error) {
          console.error('Focus settings reload error:', error);
        }
      };

      checkAndUpdateWorkspace();
    }, [user])
  );

  useEffect(() => {
    if (workspaceDates.length > 0 && workspaceDates[currentIndex] && settings) {
      if (previousWorkspaceType.current === null) {
        previousWorkspaceType.current = settings.default_workspace_type;
      }
      loadWorkspaceByDate(workspaceDates[currentIndex]);
    }
  }, [currentIndex, workspaceDates, settings]);

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

  const loadWorkspaceDates = async () => {
    try {
      const currentType = settings?.default_workspace_type || 'four_grid';

      const { data: workspaces, error } = await supabase
        .from('workspaces')
        .select('id, date, type')
        .order('date', { ascending: false }) as { data: Array<{ id: string; date: string; type: string }> | null; error: any };

      if (error) throw error;

      const { data: workspacesWithTodos, error: todosError } = await supabase
        .from('todos')
        .select('workspace_id')
        .not('workspace_id', 'is', null) as { data: Array<{ workspace_id: string }> | null; error: any };

      if (todosError) {
        console.error('Error fetching todos:', todosError);
        throw todosError;
      }

      const workspaceIdsWithTodos = new Set(
        workspacesWithTodos?.map((t) => t.workspace_id) || []
      );

      const today = formatDate(new Date());
      
      // 過去の日付（ToDoが作成された日のみ）- 現在の設定タイプに一致するもののみ
      const pastDatesWithTodos = (workspaces || [])
        .filter((w) => workspaceIdsWithTodos.has(w.id) && w.type === currentType)
        .map((w) => w.date);
      
      // 未来の日付を生成（今日から1年先まで）
      const futureDates = [];
      for (let i = 0; i <= 365; i++) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + i);
        futureDates.push(formatDate(futureDate));
      }

      // すべての日付を結合（過去 + 未来）
      const allDates = [...pastDatesWithTodos, ...futureDates];
      
      // 重複を削除してソート
      const sortedDates = Array.from(new Set(allDates)).sort(
        (a, b) => new Date(b).getTime() - new Date(a).getTime()
      );

      setWorkspaceDates(sortedDates);
      
      // ToDo作成済みワークスペース数を設定
      setTodosWorkspaceCount(pastDatesWithTodos.length);
      
      // 日付選択用のリストを設定（未来の日付のみ、今日から1年先まで）
      const futureDatesForPicker = [];
      for (let i = 0; i <= 365; i++) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + i);
        futureDatesForPicker.push(formatDate(futureDate));
      }
      setAvailableDates(futureDatesForPicker);

      const todayIndex = sortedDates.indexOf(today);
      setCurrentIndex(todayIndex >= 0 ? todayIndex : 0);
    } catch (error) {
      console.error('Error loading workspace dates:', error);
    }
  };

  const loadWorkspaceByDate = async (dateString: string, forceUpdateType: boolean = false, overrideType?: WorkspaceType) => {
    try {
      const currentType = overrideType || settings?.default_workspace_type || 'four_grid';

      const today = formatDate(new Date());
      const isFutureDate = dateString > today;
      
      // まず日付でワークスペースを検索（UNIQUE制約により1日1ワークスペースのみ）
      const { data: existingWorkspace, error: fetchError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('date', dateString)
        .maybeSingle() as { data: Workspace | null; error: any };

      if (fetchError) throw fetchError;

      if (existingWorkspace) {
        if ((isFutureDate || forceUpdateType) && existingWorkspace.type !== currentType) {
          // 設定変更時にタイプを強制更新
          const { data: updatedWorkspace, error: updateError } = await supabase
            .from('workspaces')
            .update({ type: currentType })
            .eq('date', dateString)
            .select()
            .single() as { data: Workspace | null; error: any };

          if (updateError) throw updateError;
          setWorkspace(updatedWorkspace);
          // エリア名を設定
          if (updatedWorkspace) {
            setGridTitles({
              top_left: updatedWorkspace.area_titles?.top_left || '左上エリア',
              top_right: updatedWorkspace.area_titles?.top_right || '右上エリア',
              bottom_left: updatedWorkspace.area_titles?.bottom_left || '左下エリア',
              bottom_right: updatedWorkspace.area_titles?.bottom_right || '右下エリア',
            });
          }
          setTodos([]);
        } else {
          setWorkspace(existingWorkspace);
          // エリア名を設定
          setGridTitles({
            top_left: existingWorkspace.area_titles?.top_left || '左上エリア',
            top_right: existingWorkspace.area_titles?.top_right || '右上エリア',
            bottom_left: existingWorkspace.area_titles?.bottom_left || '左下エリア',
            bottom_right: existingWorkspace.area_titles?.bottom_right || '右下エリア',
          });
          await loadTodos(existingWorkspace.id, existingWorkspace.type);
        }
      } else {
        if (!user) return;
        const date = new Date(dateString);

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
          top_left: latestWs?.area_titles?.top_left || '左上エリア',
          top_right: latestWs?.area_titles?.top_right || '右上エリア',
          bottom_left: latestWs?.area_titles?.bottom_left || '左下エリア',
          bottom_right: latestWs?.area_titles?.bottom_right || '右下エリア',
        };

        const { data: newWorkspace, error: createError } = await supabase
          .from('workspaces')
          .insert({
            title: formatDateTitle(date),
            type: currentType,
            date: dateString,
            user_id: user.id,
            area_titles: inheritedTitles,
          } as any)
          .select()
          .single() as { data: Workspace | null; error: any };

        if (createError) {
          // UNIQUE制約違反の場合、既存のワークスペースを取得
          if (createError.code === '23505') {
            const { data: updatedWorkspace, error: updateError } = await supabase
              .from('workspaces')
              .select('*')
              .eq('date', dateString)
              .single() as { data: Workspace | null; error: any };

            if (updateError) throw updateError;
            setWorkspace(updatedWorkspace);
            // エリア名を設定
            if (updatedWorkspace) {
              setGridTitles({
                top_left: updatedWorkspace.area_titles?.top_left || '左上エリア',
                top_right: updatedWorkspace.area_titles?.top_right || '右上エリア',
                bottom_left: updatedWorkspace.area_titles?.bottom_left || '左下エリア',
                bottom_right: updatedWorkspace.area_titles?.bottom_right || '右下エリア',
              });
            }
            if (updatedWorkspace) {
              await loadTodos(updatedWorkspace.id, updatedWorkspace.type);
            }
          } else {
            throw createError;
          }
        } else {
          setWorkspace(newWorkspace);
          // エリア名を設定
          if (newWorkspace) {
            setGridTitles({
              top_left: newWorkspace.area_titles?.top_left || '左上エリア',
              top_right: newWorkspace.area_titles?.top_right || '右上エリア',
              bottom_left: newWorkspace.area_titles?.bottom_left || '左下エリア',
              bottom_right: newWorkspace.area_titles?.bottom_right || '右下エリア',
            });
          }
          setTodos([]);
        }
      }
    } catch (error) {
      console.error('Error loading workspace:', error);
    }
  };

  const loadTodos = async (workspaceId: string, workspaceType?: string) => {
    try {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true }) as { data: Todo[] | null; error: any };

      if (error) throw error;

      let filteredTodos = data || [];

      if (workspaceType === 'four_grid') {
        filteredTodos = filteredTodos.filter(todo => todo.grid_area !== null);
      } else if (workspaceType === 'individual') {
        filteredTodos = filteredTodos.filter(todo => todo.grid_area === null);
      }

      setTodos(filteredTodos);
    } catch (error) {
      console.error('Error loading todos:', error);
    }
  };

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
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
    return `${year}年${month}月${day}日 (${dayOfWeek})`;
  };

  // カレンダー用のヘルパー関数
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    return { daysInMonth, startingDayOfWeek };
  };

  const getMonthName = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}年${month}月`;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentMonth);
    if (direction === 'prev') {
      newMonth.setMonth(newMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1);
    }
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

  // エリア名編集用の関数
  const startEditingAreaName = (area: GridArea) => {
    setEditingArea(area);
    setEditingAreaName(gridTitles[area]);
  };

  const saveAreaName = async () => {
    if (editingArea && editingAreaName.trim() && workspace) {
      const newAreaName = editingAreaName.trim();
      
      // ローカル状態を更新
      setGridTitles(prev => ({
        ...prev,
        [editingArea]: newAreaName
      }));
      
      // データベースに保存
      try {
        // 現在のエリア名を取得して更新
        const currentAreaTitles = workspace.area_titles || {
          top_left: '左上エリア',
          top_right: '右上エリア',
          bottom_left: '左下エリア',
          bottom_right: '右下エリア',
        };
        
        const updatedAreaTitles = {
          ...currentAreaTitles,
          [editingArea]: newAreaName,
        };
        
        const { data: updateData, error } = await supabase
          .from('workspaces')
          .update({ area_titles: updatedAreaTitles })
          .eq('id', workspace.id)
          .select();

        if (error) {
          console.error('Error saving area titles:', error);
        } else if (updateData && updateData[0]) {
          setWorkspace({
            ...workspace,
            area_titles: updateData[0].area_titles
          });
        }
      } catch (error) {
        console.error('Error saving area name:', error);
      }
    }
    setEditingArea(null);
    setEditingAreaName('');
  };

  const cancelEditingAreaName = () => {
    setEditingArea(null);
    setEditingAreaName('');
  };

  // タスク追加用の関数
  const cancelAddingPostit = () => {
    setIsAddingPostit(false);
    setNewTaskText('');
  };

  // タスク編集用の関数
  const startEditingTodo = (todo: Todo) => {
    setEditingTodo(todo);
    setEditingTodoText(todo.content);
  };

  const saveEditingTodo = async () => {
    if (!editingTodo || !editingTodoText.trim()) return;

    try {
      const { error } = await supabase
        .from('todos')
        .update({ content: editingTodoText.trim() })
        .eq('id', editingTodo.id);

      if (error) throw error;

      setTodos(todos.map(t => 
        t.id === editingTodo.id 
          ? { ...t, content: editingTodoText.trim() }
          : t
      ));

      setEditingTodo(null);
      setEditingTodoText('');
    } catch (error) {
      console.error('Error updating todo:', error);
      Alert.alert('エラー', 'タスクの更新に失敗しました');
    }
  };

  const cancelEditingTodo = () => {
    setEditingTodo(null);
    setEditingTodoText('');
  };

  // ポストイット個別モード用の追加機能
  const startAddingPostit = () => {
    setIsAddingPostit(true);
    setNewTaskText('');
  };

  const handleAddPostit = async () => {
    if (!workspace || !newTaskText.trim() || !user) return;

    try {
      const { data: newTodo, error } = await supabase
        .from('todos')
        .insert({
          workspace_id: workspace.id,
          content: newTaskText.trim(),
          is_completed: false,
          grid_area: null,
          position_x: Math.random() * 200 + 50,
          position_y: Math.random() * 200 + 50,
          user_id: user.id,
        } as any)
        .select()
        .single() as { data: Todo | null; error: any };

      if (error) throw error;

      if (newTodo) {
        setTodos((prev) => [...prev, newTodo]);
      }
      setIsAddingPostit(false);
      setNewTaskText('');
    } catch (error) {
      console.error('Error adding postit:', error);
      Alert.alert('エラー', 'ポストイットの追加に失敗しました');
    }
  };

  const handleDragEnd = async (todoId: string, sourceArea: GridArea, targetArea: GridArea, absoluteY: number) => {
    try {
      if (sourceArea === targetArea) return;

      const { error } = await supabase
        .from('todos')
        .update({ grid_area: targetArea })
        .eq('id', todoId);

      if (error) throw error;

      setTodos(prevTodos =>
        prevTodos.map(t =>
          t.id === todoId ? { ...t, grid_area: targetArea } : t
        )
      );

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error moving todo:', error);
      Alert.alert('エラー', 'タスクの移動に失敗しました');
    }
  };

  // 個別モード用の並び替え関数
  const movePostit = async (todo: Todo, direction: 'up' | 'down') => {
    try {
      const postitTodos = todos
        .filter(t => t.grid_area === null)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const idx = postitTodos.findIndex((t) => t.id === todo.id);

      if (direction === 'up' && idx === 0) return;
      if (direction === 'down' && idx === postitTodos.length - 1) return;

      const newIndex = direction === 'up' ? idx - 1 : idx + 1;
      const targetTodo = postitTodos[newIndex];

      const tempCreatedAt = todo.created_at;
      const { error: error1 } = await supabase
        .from('todos')
        .update({ created_at: targetTodo.created_at })
        .eq('id', todo.id);

      if (error1) throw error1;

      const { error: error2 } = await supabase
        .from('todos')
        .update({ created_at: tempCreatedAt })
        .eq('id', targetTodo.id);

      if (error2) throw error2;

      setTodos(prevTodos => {
        return prevTodos.map(t => {
          if (t.id === todo.id) return { ...t, created_at: targetTodo.created_at };
          if (t.id === targetTodo.id) return { ...t, created_at: tempCreatedAt };
          return t;
        });
      });

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error moving postit:', error);
      Alert.alert('エラー', 'ポストイットの並び替えに失敗しました');
    }
  };

  const handlePostitLongPress = (todoId: string) => {
    setLongPressedTodo(todoId);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const handleQuickAdd = async (gridArea: GridArea, content: string) => {
    await addTodo(gridArea, content);
  };

  const openReminderPicker = (todo: Todo) => {
    setReminderTodo(todo);
  };

  const clearReminder = async (todo: Todo) => {
    try {
      if (todo.notification_id) {
        await cancelReminderNotification(todo.notification_id);
      }
      const { error } = await supabase
        .from('todos')
        .update({ reminder_at: null, notification_id: null })
        .eq('id', todo.id);
      if (!error) {
        setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, reminder_at: null, notification_id: null } : t));
      }
    } catch (error) {
      console.error('Error clearing reminder:', error);
    }
  };

  const handleSetReminder = async (reminderAt: string | null) => {
    if (!reminderTodo) return;
    try {
      if (reminderTodo.notification_id) {
        await cancelReminderNotification(reminderTodo.notification_id);
      }

      let notificationId: string | null = null;

      if (reminderAt) {
        notificationId = await scheduleReminderNotification(
          reminderTodo.id,
          reminderTodo.content,
          new Date(reminderAt)
        );
      }

      const { error } = await supabase
        .from('todos')
        .update({ reminder_at: reminderAt, notification_id: notificationId })
        .eq('id', reminderTodo.id);

      if (error) throw error;

      setTodos(prev =>
        prev.map(t =>
          t.id === reminderTodo.id
            ? { ...t, reminder_at: reminderAt, notification_id: notificationId }
            : t
        )
      );
    } catch (error) {
      console.error('Error setting reminder:', error);
    }
    setReminderTodo(null);
  };

  const addTodo = async (gridArea: GridArea, content?: string) => {
    if (!workspace) return;

    const taskContent = content || newTodoContent[gridArea].trim();
    if (!taskContent) return;

    try {
      if (!user) return;
      const { data, error } = await supabase
        .from('todos')
        .insert({
          workspace_id: workspace.id,
          content: taskContent,
          grid_area: gridArea,
          user_id: user.id,
        } as any)
        .select()
        .single() as { data: Todo | null; error: any };

      if (error) throw error;
      if (!data) throw new Error('No data returned');

      setTodos([...todos, data]);
      setNewTodoContent({ ...newTodoContent, [gridArea]: '' });

      await loadWorkspaceDates();
    } catch (error) {
      console.error('Error adding todo:', error);
      Alert.alert('エラー', 'タスクの追加に失敗しました');
    }
  };

  const toggleTodo = async (todo: Todo) => {
    try {
      const { error } = await supabase
        .from('todos')
        .update({
          is_completed: !todo.is_completed,
          completed_at: !todo.is_completed ? new Date().toISOString() : null,
        })
        .eq('id', todo.id);

      if (error) throw error;

      setTodos(
        todos.map((t) =>
          t.id === todo.id
            ? {
                ...t,
                is_completed: !t.is_completed,
                completed_at: !t.is_completed ? new Date().toISOString() : null,
              }
            : t
        )
      );
    } catch (error) {
      console.error('Error toggling todo:', error);
    }
  };

  const deleteTodo = async (todoId: string) => {
    try {
      const todoToDelete = todos.find(t => t.id === todoId);
      if (todoToDelete?.notification_id) {
        await cancelReminderNotification(todoToDelete.notification_id);
      }

      const { error } = await supabase.from('todos').delete().eq('id', todoId);

      if (error) throw error;

      const newTodos = todos.filter((t) => t.id !== todoId);
      setTodos(newTodos);

      if (newTodos.length === 0) {
        await loadWorkspaceDates();
      }
    } catch (error) {
      console.error('Error deleting todo:', error);
      Alert.alert('エラー', 'タスクの削除に失敗しました');
    }
  };

  const getTodosForArea = (area: GridArea) => {
    return todos.filter((t) => t.grid_area === area).sort((a, b) => {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  };

  const getProgressForArea = (area: GridArea) => {
    const areaTodos = getTodosForArea(area);
    if (areaTodos.length === 0) return 0;
    const completed = areaTodos.filter((t) => t.is_completed).length;
    return Math.round((completed / areaTodos.length) * 100);
  };

  const renderGridArea = (area: GridArea) => {
    const areaTodos = getTodosForArea(area);
    const progress = getProgressForArea(area);

    return (
      <GridAreaDropTarget
        area={area}
        gridTitles={gridTitles}
        editingArea={editingArea}
        editingAreaName={editingAreaName}
        setEditingAreaName={setEditingAreaName}
        saveAreaName={saveAreaName}
        cancelEditingAreaName={cancelEditingAreaName}
        startEditingAreaName={startEditingAreaName}
        progress={progress}
        areaTodos={areaTodos}
        editingTodo={editingTodo}
        editingTodoText={editingTodoText}
        setEditingTodoText={setEditingTodoText}
        saveEditingTodo={saveEditingTodo}
        cancelEditingTodo={cancelEditingTodo}
        startEditingTodo={startEditingTodo}
        toggleTodo={toggleTodo}
        deleteTodo={deleteTodo}
        handleDragEnd={handleDragEnd}
        onQuickAdd={handleQuickAdd}
        onReminderPress={openReminderPicker}
        onClearReminder={clearReminder}
      />
    );
  };

  // 浮遊するタスクの表示（削除）

  if (!workspace) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>読み込み中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.dateContainer} onPress={openDatePicker}>
            <Calendar size={20} color="#000" />
            <Text style={styles.headerTitle}>{workspace.title}</Text>
          </TouchableOpacity>
          {workspaceDates[currentIndex] !== formatDate(new Date()) && (
            <TouchableOpacity
              style={styles.todayJumpBtn}
              onPress={() => {
                const todayStr = formatDate(new Date());
                const idx = workspaceDates.indexOf(todayStr);
                if (idx >= 0) setCurrentIndex(idx);
              }}
            >
              <Text style={styles.todayJumpText}>今日へ戻る</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.pageIndicator}>
          {todosWorkspaceCount} ページ
        </Text>
      </View>

      <Animated.View 
        style={[styles.content, { transform: [{ translateX }] }]}
        {...swipePanResponder.panHandlers}
      >
        {workspace.type === 'four_grid' ? (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
          >
            <DragDropProvider>
              <View style={styles.grid}>
                <View style={styles.gridRow}>
                  {renderGridArea('top_left')}
                  {renderGridArea('top_right')}
                </View>
                <View style={styles.gridRow}>
                  {renderGridArea('bottom_left')}
                  {renderGridArea('bottom_right')}
                </View>
              </View>
            </DragDropProvider>
          </KeyboardAvoidingView>
        ) : workspace.type === 'individual' ? (
          <View style={styles.individualContainer}>
            {/* ポストイット表示エリア */}
            <ScrollView
              style={styles.postitsArea}
              contentContainerStyle={styles.postitsContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {todos.length === 0 && !isAddingPostit ? (
                <View style={styles.emptyPostitsContainer}>
                  <Text style={styles.emptyPostitsText}>
                    右下の＋ボタンでポストイットを追加
                  </Text>
                </View>
              ) : (
                <>
                  {(() => {
                    const sortedPostits = todos
                      .filter(t => t.grid_area === null)
                      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                    return sortedPostits.map((todo, index) => (
                    <View key={todo.id}>
                      {editingTodo?.id === todo.id ? (
                        // 編集モード
                        <View style={styles.postit}>
                          <View style={styles.postitEditing}>
                            <TextInput
                              style={styles.postitEditInput}
                              value={editingTodoText}
                              onChangeText={setEditingTodoText}
                              multiline
                              autoFocus
                              maxLength={100}
                            />
                            <View style={styles.postitEditButtons}>
                              <TouchableOpacity
                                style={styles.postitEditSaveButton}
                                onPress={saveEditingTodo}
                              >
                                <Text style={styles.postitEditSaveText}>✓</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.postitEditCancelButton}
                                onPress={cancelEditingTodo}
                              >
                                <Text style={styles.postitEditCancelText}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.postit}>
                          <View style={styles.postitRow}>
                            <TouchableOpacity
                              style={styles.postitCheckbox}
                              onPress={() => toggleTodo(todo)}
                            >
                              {todo.is_completed && <View style={styles.postitCheckboxFilled} />}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.postitTextContainer}
                              onPress={() => startEditingTodo(todo)}
                              onLongPress={(e) => {
                                handlePostitLongPress(todo.id);
                                setPostitMenuTodo(todo);
                                setPostitMenuPosition({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
                                if (Platform.OS !== 'web') {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                }
                              }}
                              delayLongPress={400}
                            >
                              <Text
                                style={[
                                  styles.postitText,
                                  todo.is_completed && styles.postitTextCompleted,
                                ]}
                              >
                                {todo.content}
                              </Text>
                            </TouchableOpacity>

                            {todo.reminder_at && (
                              <Bell size={10} color="#e67e22" style={{ marginLeft: 4 }} />
                            )}
                          </View>
                          {todo.reminder_at && (
                            <View style={styles.postitReminderBadge}>
                              <Bell size={9} color="#e67e22" />
                              <Text style={styles.postitReminderBadgeText}>
                                {(() => {
                                  const d = new Date(todo.reminder_at);
                                  const h = d.getHours().toString().padStart(2, '0');
                                  const m = d.getMinutes().toString().padStart(2, '0');
                                  const now = new Date();
                                  if (d.toDateString() === now.toDateString()) return `今日 ${h}:${m}`;
                                  const tmr = new Date(now);
                                  tmr.setDate(tmr.getDate() + 1);
                                  if (d.toDateString() === tmr.toDateString()) return `明日 ${h}:${m}`;
                                  return `${d.getMonth() + 1}/${d.getDate()} ${h}:${m}`;
                                })()}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  ))}
                  )()}
                  
                  {/* ポストイット風の入力UI */}
                  {isAddingPostit && (
                    <View style={styles.postitInputCard}>
                      <TextInput
                        style={styles.postitInputCardText}
                        value={newTaskText}
                        onChangeText={setNewTaskText}
                        placeholder="ポストイットを入力..."
                        placeholderTextColor="#bdc3c7"
                        multiline
                        autoFocus
                        maxLength={100}
                      />
                      <View style={styles.postitInputCardButtons}>
                        <TouchableOpacity
                          style={styles.postitInputCardCancelButton}
                          onPress={cancelAddingPostit}
                        >
                          <Text style={styles.postitInputCardCancelText}>✕</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.postitInputCardSaveButton,
                            !newTaskText.trim() && styles.postitInputCardSaveButtonDisabled
                          ]}
                          onPress={handleAddPostit}
                          disabled={!newTaskText.trim()}
                        >
                          <Text style={styles.postitInputCardSaveText}>✓</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            {/* 右下の追加ボタン */}
            {!isAddingPostit && (
              <TouchableOpacity
                style={styles.addPostitButton}
                onPress={() => startAddingPostit()}
              >
                <Plus size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.individualContainer}>
            <Text style={styles.individualPlaceholder}>
              ノートモード（開発中）
            </Text>
          </View>
        )}
      </Animated.View>

      <ReminderPicker
        visible={reminderTodo !== null}
        currentReminder={reminderTodo?.reminder_at ?? null}
        onSelect={handleSetReminder}
        onClose={() => setReminderTodo(null)}
      />

      <Modal
        visible={postitMenuTodo !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setPostitMenuTodo(null); setLongPressedTodo(null); }}
      >
        <TouchableOpacity
          style={styles.postitMenuOverlay}
          activeOpacity={1}
          onPress={() => { setPostitMenuTodo(null); setLongPressedTodo(null); }}
        >
          {postitMenuTodo && (
            <View style={[styles.postitMenu, { top: postitMenuPosition.y, left: postitMenuPosition.x }]}>
              <TouchableOpacity
                style={styles.postitMenuItem}
                onPress={() => {
                  const t = postitMenuTodo;
                  setPostitMenuTodo(null);
                  setLongPressedTodo(null);
                  openReminderPicker(t);
                }}
              >
                <Bell size={15} color="#e67e22" />
                <Text style={styles.postitMenuItemText}>
                  {postitMenuTodo.reminder_at ? 'リマインダーを変更' : 'リマインダーを設定'}
                </Text>
              </TouchableOpacity>
              {postitMenuTodo.reminder_at && (
                <TouchableOpacity
                  style={styles.postitMenuItem}
                  onPress={async () => {
                    const t = postitMenuTodo;
                    setPostitMenuTodo(null);
                    setLongPressedTodo(null);
                    if (t.notification_id) {
                      await cancelReminderNotification(t.notification_id);
                    }
                    const { error } = await supabase
                      .from('todos')
                      .update({ reminder_at: null, notification_id: null })
                      .eq('id', t.id);
                    if (!error) {
                      setTodos(prev => prev.map(td => td.id === t.id ? { ...td, reminder_at: null, notification_id: null } : td));
                    }
                  }}
                >
                  <Bell size={15} color="#999" />
                  <Text style={[styles.postitMenuItemText, { color: '#999' }]}>リマインダーを削除</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.postitMenuItem}
                onPress={() => {
                  const sortedPostits = todos
                    .filter(t => t.grid_area === null)
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                  const idx = sortedPostits.findIndex(t => t.id === postitMenuTodo!.id);
                  const t = postitMenuTodo;
                  setPostitMenuTodo(null);
                  setLongPressedTodo(null);
                  if (idx > 0) movePostit(t, 'up');
                }}
              >
                <ChevronUp size={15} color="#007AFF" />
                <Text style={[styles.postitMenuItemText, { color: '#007AFF' }]}>上に移動</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.postitMenuItem}
                onPress={() => {
                  const sortedPostits = todos
                    .filter(t => t.grid_area === null)
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                  const idx = sortedPostits.findIndex(t => t.id === postitMenuTodo!.id);
                  const t = postitMenuTodo;
                  setPostitMenuTodo(null);
                  setLongPressedTodo(null);
                  if (idx < sortedPostits.length - 1) movePostit(t, 'down');
                }}
              >
                <ChevronDown size={15} color="#007AFF" />
                <Text style={[styles.postitMenuItemText, { color: '#007AFF' }]}>下に移動</Text>
              </TouchableOpacity>
              <View style={styles.postitMenuDivider} />
              <TouchableOpacity
                style={styles.postitMenuItem}
                onPress={() => {
                  const id = postitMenuTodo.id;
                  setPostitMenuTodo(null);
                  setLongPressedTodo(null);
                  deleteTodo(id);
                }}
              >
                <Trash2 size={15} color="#e74c3c" />
                <Text style={[styles.postitMenuItemText, { color: '#e74c3c' }]}>タスクを削除</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </Modal>

      {/* 日付選択モーダル */}
      <Modal
        visible={isDatePickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsDatePickerVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>ToDoを作成する日付を選択</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setIsDatePickerVisible(false)}
            >
              <Text style={styles.closeButtonText}>閉じる</Text>
            </TouchableOpacity>
        </View>
          <View style={styles.modalDescription}>
            <Text style={styles.descriptionText}>
              未来の日付を選択して、その日のToDoを作成できます
            </Text>
          </View>
          
          {/* カレンダーヘッダー */}
          <View style={styles.calendarHeader}>
            <TouchableOpacity
              style={styles.monthNavButton}
              onPress={() => navigateMonth('prev')}
            >
              <ChevronLeft size={24} color="#007AFF" />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{getMonthName(currentMonth)}</Text>
            <TouchableOpacity
              style={styles.monthNavButton}
              onPress={() => navigateMonth('next')}
            >
              <ChevronRight size={24} color="#007AFF" />
            </TouchableOpacity>
          </View>
          
          {/* 曜日ヘッダー */}
          <View style={styles.weekdayHeader}>
            {['日', '月', '火', '水', '木', '金', '土'].map((day) => (
              <Text key={day} style={styles.weekdayText}>
                {day}
              </Text>
            ))}
          </View>
          
          {/* カレンダーグリッド */}
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
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  },
  content: {
    flex: 1,
  },
  grid: {
    flex: 1,
    padding: 4,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    marginBottom: 4,
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
  dateItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateItemContent: {
    flex: 1,
  },
  todayDateItem: {
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    marginVertical: 4,
  },
  dateItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  todayDateItemText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  dayOfWeekText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  todayDayOfWeekText: {
    color: '#007AFF',
  },
  futureBadge: {
    backgroundColor: '#e8f5e8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  futureBadgeText: {
    fontSize: 12,
    color: '#28a745',
    fontWeight: '500',
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
  individualContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    position: 'relative',
  },
  individualPlaceholder: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  postitsArea: {
    flex: 1,
  },
  emptyPostitsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyPostitsText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  postitsContent: {
    padding: 16,
  },
  postit: {
    backgroundColor: '#fffacd',
    width: '100%',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffd700',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 12,
  },
  postitRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  postitCheckbox: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: '#666',
    borderRadius: 3,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postitCheckboxFilled: {
    width: 10,
    height: 10,
    backgroundColor: '#2ecc71',
    borderRadius: 2,
  },
  postitText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  postitTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  postitTextContainer: {
    flex: 1,
  },
  postitOrderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  postitOrderButton: {
    padding: 4,
    marginHorizontal: 2,
  },
  postitOrderButtonDisabled: {
    opacity: 0.3,
  },
  postitReminderButton: {
    padding: 4,
    marginRight: 4,
  },
  postitReminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 24,
    marginTop: 4,
  },
  postitReminderBadgeText: {
    fontSize: 11,
    color: '#e67e22',
  },
  postitDeleteButton: {
    padding: 4,
  },
  addPostitButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3498db',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  postitInputCard: {
    backgroundColor: '#fffacd',
    width: '100%',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffd700',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 12,
  },
  postitInputCardText: {
    fontSize: 14,
    color: '#333',
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#d4af37',
    marginBottom: 8,
  },
  postitInputCardButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  postitInputCardCancelButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  postitInputCardCancelText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  postitInputCardSaveButton: {
    backgroundColor: '#27ae60',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  postitInputCardSaveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  postitInputCardSaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  postitEditing: {
    flex: 1,
  },
  postitEditInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: '#333',
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#d4af37',
    marginBottom: 8,
  },
  postitEditButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  postitEditSaveButton: {
    backgroundColor: '#27ae60',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  postitEditSaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  postitEditCancelButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  postitEditCancelText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelPostitReorderButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  cancelPostitReorderButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  postitMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  postitMenu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  postitMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  postitMenuItemText: {
    fontSize: 14,
    color: '#2c3e50',
    fontWeight: '500',
  },
  postitMenuDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 12,
    marginVertical: 2,
  },
});
