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
  FlatList,
  Platform,
  AppState,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Trash2, Calendar, ChevronLeft, ChevronRight, Menu, ChevronUp, ChevronDown } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { Workspace, Todo, GridArea, UserSettings } from '@/types/database';

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
  const [addingToArea, setAddingToArea] = useState<GridArea | null>(null);
  const [isAddingPostit, setIsAddingPostit] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  
  // タスク編集用の状態
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  
  // 並び替えモード用の状態
  const [reorderModeActive, setReorderModeActive] = useState(false);
  const [longPressedTodo, setLongPressedTodo] = useState<string | null>(null);

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
    const newFutureDates = [];
    
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

  const renderDateItem = ({ item }: { item: string }) => {
    const date = new Date(item);
    const isToday = item === formatDate(new Date());
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
    const isFuture = new Date(item) > new Date();
    
    return (
      <TouchableOpacity
        style={[styles.dateItem, isToday && styles.todayDateItem]}
        onPress={() => selectDate(item)}
      >
        <View style={styles.dateItemContent}>
          <Text style={[styles.dateItemText, isToday && styles.todayDateItemText]}>
            {formatDateTitle(date)}
          </Text>
          <Text style={[styles.dayOfWeekText, isToday && styles.todayDayOfWeekText]}>
            {dayOfWeek}
          </Text>
        </View>
        {isFuture && !isToday && (
          <View style={styles.futureBadge}>
            <Text style={styles.futureBadgeText}>未来</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // スワイプ用のPanResponder
  const swipePanResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return Math.abs(gestureState.dx) > 10;
    },
    onPanResponderGrant: () => {
      if (!isAnimating.current) {
        translateX.setOffset(translateX._value);
        translateX.setValue(0);
      }
    },
    onPanResponderMove: (evt, gestureState) => {
      if (!isAnimating.current) {
        translateX.setValue(gestureState.dx);
      }
    },
    onPanResponderRelease: (evt, gestureState) => {
      if (isAnimating.current) return;
      
      translateX.flattenOffset();
      
      if (gestureState.dx > SWIPE_THRESHOLD) {
        goToPreviousPage();
      } else if (gestureState.dx < -SWIPE_THRESHOLD) {
        goToNextPage();
      } else {
        // スワイプが不十分な場合は元の位置に戻す
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    },
    });

  useEffect(() => {
    const testConnection = async () => {
      try {
        console.log('Testing Supabase connection...');
        const { data, error } = await supabase
          .from('user_settings')
          .select('count')
          .limit(1);

        console.log('Connection test result:', { data, error });

        if (error) {
          console.error('Connection test failed:', error);
          Alert.alert(
            '接続エラー',
            `Supabaseへの接続に失敗しました。\nエラー: ${error.message}\nコード: ${error.code || 'N/A'}`
          );
        } else {
          console.log('Connection test successful!');
        }
      } catch (err) {
        console.error('Connection test exception:', err);
        Alert.alert('接続エラー', `予期しないエラーが発生しました: ${String(err)}`);
      }
    };

    const initializeApp = async () => {
      try {
        await testConnection();
        await loadSettings();
      } catch (error) {
        console.error('App initialization error:', error);
        Alert.alert('初期化エラー', 'アプリの初期化に失敗しました');
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    if (settings) {
      loadWorkspaceDates();
    }
  }, [settings?.default_workspace_type]);

  // 設定変更時に現在のワークスペースを再読み込み（タイプを強制更新）
  useEffect(() => {
    if (!settings || workspaceDates.length === 0 || !workspaceDates[currentIndex]) {
      return;
    }
    
    const currentType = settings.default_workspace_type;
    
    // 前の設定タイプを初期化
    if (previousWorkspaceType.current === null) {
      previousWorkspaceType.current = currentType;
      return;
    }
    
    // 前の設定タイプと異なる場合のみ強制更新
    if (previousWorkspaceType.current !== currentType) {
      console.log('Workspace type changed from', previousWorkspaceType.current, 'to', currentType);
      console.log('Current date:', workspaceDates[currentIndex]);
      
      // 前の設定タイプを更新（遅延なし）
      previousWorkspaceType.current = currentType;
      
      // ワークスペースを強制更新（明示的にタイプを渡す）
      loadWorkspaceByDate(workspaceDates[currentIndex], true, currentType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const checkAndUpdateWorkspace = async () => {
        // 設定を再読み込み
        const { data: newSettings, error } = await supabase
          .from('user_settings')
          .select('*')
          .limit(1)
          .maybeSingle() as { data: UserSettings | null; error: any };

        if (error || !newSettings) return;

        const currentType = newSettings.default_workspace_type;
        
        // 設定タイプが変更されている場合
        if (previousWorkspaceType.current !== null && previousWorkspaceType.current !== currentType) {
          console.log('Setting changed on focus, updating workspace type from', previousWorkspaceType.current, 'to', currentType);
          
          // 設定を更新（これによりsettingsが変わり、他のuseEffectが実行される）
          setSettings(newSettings);
          // previousWorkspaceType.currentはuseEffect内で更新される
        } else if (previousWorkspaceType.current === null) {
          previousWorkspaceType.current = currentType;
          setSettings(newSettings);
        } else {
          // 設定タイプが変更されていない場合も設定を更新
          setSettings(newSettings);
        }
      };
      
      checkAndUpdateWorkspace();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  useEffect(() => {
    if (workspaceDates.length > 0 && workspaceDates[currentIndex] && previousWorkspaceType.current !== null) {
      // 設定タイプが初期化済みの場合のみ通常の読み込み
      loadWorkspaceByDate(workspaceDates[currentIndex]);
    }
  }, [currentIndex, workspaceDates]);

  const loadSettings = async () => {
    try {
      console.log('Loading settings...');
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .limit(1)
        .maybeSingle() as { data: UserSettings | null; error: any };

      if (error) {
        console.error('Error fetching settings:', error);
        Alert.alert('エラー', `設定の読み込みに失敗しました: ${error.message}`);
        throw error;
      }

      if (!data) {
        console.log('No settings found, creating default...');
        const { data: newSettings, error: insertError } = await supabase
          .from('user_settings')
          .insert({ default_workspace_type: 'four_grid' } as any)
          .select()
          .single() as { data: UserSettings | null; error: any };

        if (insertError) {
          console.error('Error creating settings:', insertError);
          Alert.alert('エラー', `設定の作成に失敗しました: ${insertError.message}`);
          throw insertError;
        }
        console.log('Settings created:', newSettings);
        setSettings(newSettings);
      } else {
        console.log('Settings loaded:', data);
        setSettings(data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      // デフォルト設定を設定してアプリがクラッシュしないようにする
      setSettings({
        id: 'default',
        default_workspace_type: 'four_grid',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as UserSettings);
    }
  };

  const loadWorkspaceDates = async () => {
    try {
      console.log('Loading workspace dates...');
      const currentType = settings?.default_workspace_type || 'four_grid';
      console.log('Current workspace type:', currentType);
      
      // タイプでフィルタしない - 全てのワークスペースを取得
      const { data: workspaces, error } = await supabase
        .from('workspaces')
        .select('id, date, type')
        .order('date', { ascending: false }) as { data: Array<{ id: string; date: string; type: string }> | null; error: any };

      if (error) {
        console.error('Error fetching workspaces:', error);
        Alert.alert('エラー', `ワークスペースの読み込みに失敗しました: ${error.message}`);
        throw error;
      }

      console.log('Workspaces loaded:', workspaces);

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
      
      console.log('Past dates with todos:', pastDatesWithTodos.length);

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

  const loadWorkspaceByDate = async (dateString: string, forceUpdateType: boolean = false, overrideType?: string) => {
    try {
      const currentType = overrideType || settings?.default_workspace_type || 'four_grid';
      console.log('loadWorkspaceByDate called for date:', dateString, 'forceUpdateType:', forceUpdateType, 'overrideType:', overrideType);
      
      // 日付が未来かどうかを判定
      const today = formatDate(new Date());
      const isFutureDate = dateString > today;
      console.log('Is future date:', isFutureDate);
      
      // まず日付でワークスペースを検索（UNIQUE制約により1日1ワークスペースのみ）
      const { data: existingWorkspace, error: fetchError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('date', dateString)
        .maybeSingle() as { data: Workspace | null; error: any };

      if (fetchError) throw fetchError;

      if (existingWorkspace) {
        console.log('Existing workspace found:', existingWorkspace.id, 'type:', existingWorkspace.type);
        // 既存のワークスペースがある場合
        // 未来の日付または強制更新の場合、現在の設定タイプに更新
        if ((isFutureDate || forceUpdateType) && existingWorkspace.type !== currentType) {
          console.log('Updating workspace type from', existingWorkspace.type, 'to', currentType, '(future:', isFutureDate, 'force:', forceUpdateType, ')');
          // 設定変更時にタイプを強制更新
          const { data: updatedWorkspace, error: updateError } = await supabase
            .from('workspaces')
            .update({ type: currentType } as any)
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
          // タイプが変わった場合は、タスクをリセット（タスクはタイプ固有なので）
          setTodos([]);
        } else {
          console.log('Loading todos for existing workspace');
          // そのまま表示
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
        // 既存のワークスペースがない場合のみ、現在の設定タイプで新規作成
        const date = new Date(dateString);
        const { data: newWorkspace, error: createError } = await supabase
          .from('workspaces')
          .insert({
            title: formatDateTitle(date),
            type: currentType,
            date: dateString,
            area_titles: {
              top_left: '左上エリア',
              top_right: '右上エリア',
              bottom_left: '左下エリア',
              bottom_right: '右下エリア',
            },
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
            await loadTodos(updatedWorkspace.id, updatedWorkspace.type);
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
      console.log('Loading todos for workspace:', workspaceId, 'type:', workspaceType);
      
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true }) as { data: Todo[] | null; error: any };

      if (error) throw error;
      
      console.log('Raw todos loaded:', data?.length || 0);
      
      // ワークスペースのタイプに応じてタスクをフィルタリング
      let filteredTodos = data || [];
      
      if (workspaceType === 'four_grid') {
        // 4分割モード：grid_areaが設定されているタスクのみ表示
        filteredTodos = filteredTodos.filter(todo => todo.grid_area !== null);
        console.log('After filtering for four_grid:', filteredTodos.length);
      } else if (workspaceType === 'individual') {
        // 個別モード：grid_areaがnullのタスクのみ表示
        filteredTodos = filteredTodos.filter(todo => todo.grid_area === null);
        console.log('After filtering for individual:', filteredTodos.length);
      } else {
        console.log('No filtering applied, workspaceType:', workspaceType);
      }
      
      console.log(`Final loaded ${filteredTodos.length} todos for workspace type: ${workspaceType}`);
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
        
        console.log('Saving area titles:', {
          workspaceId: workspace.id,
          editingArea,
          newAreaName,
          updatedAreaTitles
        });
        
        // Try Method 1: Direct update
        let { data: updateData, error } = await supabase
          .from('workspaces')
          .update({ area_titles: updatedAreaTitles } as any)
          .eq('id', workspace.id)
          .select();
        
        console.log('Direct update result:', { data: updateData, error });
        
        // Try Method 2: RPC function fallback
        if (error) {
          console.log('Direct update failed, trying RPC function...', error);
          const { data: rpcData, error: rpcError } = await supabase
            .rpc('update_workspace_area_titles', {
              workspace_id: workspace.id,
              new_area_titles: updatedAreaTitles
            });
          
          console.log('RPC function result:', { data: rpcData, error: rpcError });
          
          if (rpcError) {
            console.error('All save methods failed:', {
              directUpdateError: error,
              rpcError: rpcError
            });
            // Keep local changes silently
          } else {
            console.log('✅ Saved successfully via RPC function:', rpcData);
            // Update workspace object with saved data
            setWorkspace({
              ...workspace,
              area_titles: rpcData
            });
          }
        } else {
          console.log('✅ Saved successfully via direct update:', updateData);
          // Update workspace object with saved data
          if (updateData && updateData[0]) {
            setWorkspace({
              ...workspace,
              area_titles: updateData[0].area_titles
            });
          }
        }
      } catch (error) {
        // Silently handle errors - local changes are already preserved
        console.log('Error caught but handled silently:', error);
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
  const startAddingTask = (area: GridArea) => {
    setAddingToArea(area);
    setNewTaskText('');
  };

  const saveNewTask = async () => {
    if (addingToArea && newTaskText.trim()) {
      await addTodo(addingToArea, newTaskText.trim());
    }
    setAddingToArea(null);
    setNewTaskText('');
  };

  const cancelAddingTask = () => {
    setAddingToArea(null);
    setNewTaskText('');
  };

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
        .update({ content: editingTodoText.trim() } as any)
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
    if (!workspace || !newTaskText.trim()) return;

    try {
      const { data: newTodo, error } = await supabase
        .from('todos')
        .insert({
          workspace_id: workspace.id,
          content: newTaskText.trim(),
          is_completed: false,
          grid_area: null,
          position_x: Math.random() * 200 + 50, // ランダムな位置
          position_y: Math.random() * 200 + 50,
        } as any)
        .select()
        .single() as { data: Todo | null; error: any };

      if (error) throw error;

      setTodos((prev) => [...prev, newTodo]);
      setIsAddingPostit(false);
      setNewTaskText('');
    } catch (error) {
      console.error('Error adding postit:', error);
      Alert.alert('エラー', 'ポストイットの追加に失敗しました');
    }
  };

  // シンプルな並び替え機能（上矢印・下矢印ボタン）
  const moveTodo = async (todo: Todo, direction: 'up' | 'down', area: GridArea) => {
    try {
      const areaTodos = getTodosForArea(area);
      const currentIndex = areaTodos.findIndex((t) => t.id === todo.id);
      
      if (direction === 'up' && currentIndex === 0) return;
      if (direction === 'down' && currentIndex === areaTodos.length - 1) return;
      
      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      const targetTodo = areaTodos[newIndex];
      
      // created_atをスワップ
      const tempCreatedAt = todo.created_at;
      const { error: error1 } = await supabase
        .from('todos')
        .update({ created_at: targetTodo.created_at } as any)
        .eq('id', todo.id);
      
      if (error1) throw error1;
      
      const { error: error2 } = await supabase
        .from('todos')
        .update({ created_at: tempCreatedAt } as any)
        .eq('id', targetTodo.id);
      
      if (error2) throw error2;
      
      // ローカル状態を更新
      setTodos(prevTodos => {
        return prevTodos.map(t => {
          if (t.id === todo.id) return { ...t, created_at: targetTodo.created_at };
          if (t.id === targetTodo.id) return { ...t, created_at: tempCreatedAt };
          return t;
        });
      });
      
      // ハプティックフィードバック
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error moving todo:', error);
      Alert.alert('エラー', 'タスクの並び替えに失敗しました');
    }
  };

  // 個別モード用の並び替え関数
  const movePostit = async (todo: Todo, direction: 'up' | 'down') => {
    try {
      const postitTodos = todos
        .filter(t => t.grid_area === null)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const currentIndex = postitTodos.findIndex((t) => t.id === todo.id);
      
      if (direction === 'up' && currentIndex === 0) return;
      if (direction === 'down' && currentIndex === postitTodos.length - 1) return;
      
      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      const targetTodo = postitTodos[newIndex];
      
      // created_atをスワップ
      const tempCreatedAt = todo.created_at;
      const { error: error1 } = await supabase
        .from('todos')
        .update({ created_at: targetTodo.created_at } as any)
        .eq('id', todo.id);
      
      if (error1) throw error1;
      
      const { error: error2 } = await supabase
        .from('todos')
        .update({ created_at: tempCreatedAt } as any)
        .eq('id', targetTodo.id);
      
      if (error2) throw error2;
      
      // ローカル状態を更新
      setTodos(prevTodos => {
        return prevTodos.map(t => {
          if (t.id === todo.id) return { ...t, created_at: targetTodo.created_at };
          if (t.id === targetTodo.id) return { ...t, created_at: tempCreatedAt };
          return t;
        });
      });
      
      // ハプティックフィードバック
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error moving postit:', error);
      Alert.alert('エラー', 'ポストイットの並び替えに失敗しました');
    }
  };

  // 長押しハンドラー（4分割モード用）
  const handleTodoLongPress = (todoId: string) => {
    setLongPressedTodo(todoId);
    setReorderModeActive(true);
    
    // ハプティックフィードバック
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  // 長押しハンドラー（個別モード用）
  const handlePostitLongPress = (todoId: string) => {
    setLongPressedTodo(todoId);
    setReorderModeActive(true);
    
    // ハプティックフィードバック
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  // 並び替えモード終了
  const exitReorderMode = () => {
    setReorderModeActive(false);
    setLongPressedTodo(null);
  };

  const addTodo = async (gridArea: GridArea, content?: string) => {
    if (!workspace) return;

    const taskContent = content || newTodoContent[gridArea].trim();
    if (!taskContent) return;

    try {
      const { data, error } = await supabase
        .from('todos')
        .insert({
          workspace_id: workspace.id,
          content: taskContent,
          grid_area: gridArea,
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
        } as any)
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
      <View 
        style={[
          styles.gridArea,
        ]}
      >
        <View style={styles.areaHeader}>
          {editingArea === area ? (
            <View style={styles.areaNameEditContainer}>
              <TextInput
                style={styles.areaNameInput}
                value={editingAreaName}
                onChangeText={setEditingAreaName}
                onSubmitEditing={saveAreaName}
                onBlur={saveAreaName}
                autoFocus
                maxLength={20}
                placeholder="エリア名を入力"
                placeholderTextColor="#999"
              />
              <TouchableOpacity
                style={styles.saveAreaNameButton}
                onPress={saveAreaName}
              >
                <Text style={styles.saveAreaNameButtonText}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelAreaNameButton}
                onPress={cancelEditingAreaName}
              >
                <Text style={styles.cancelAreaNameButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.areaTitleContainer}
              onPress={() => startEditingAreaName(area)}
            >
          <Text style={styles.areaTitle}>{gridTitles[area]}</Text>
              <Text style={styles.editHint}>タップして編集</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.areaProgress}>{progress}%</Text>
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        {/* 移動モード中のヒント表示 */}
        {/* ドラッグヒント（削除） */}

        <ScrollView style={styles.todoList}>
          {areaTodos.map((todo, index) => (
            <View key={todo.id}>
              {/* ドロップゾーン（削除） */}
              
              {/* タスクアイテム */}
              {editingTodo?.id === todo.id ? (
                // 編集モード
                <View style={styles.todoItemEditing}>
                  <TextInput
                    style={styles.todoEditInput}
                    value={editingTodoText}
                    onChangeText={setEditingTodoText}
                    multiline
                    autoFocus
                    maxLength={100}
                  />
                  <View style={styles.todoEditButtons}>
                    <TouchableOpacity
                      style={styles.todoEditSaveButton}
                      onPress={saveEditingTodo}
                    >
                      <Text style={styles.todoEditSaveText}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.todoEditCancelButton}
                      onPress={cancelEditingTodo}
                    >
                      <Text style={styles.todoEditCancelText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.todoItem}>
                  <View style={styles.todoItemContent}>
                    <TouchableOpacity
                      style={styles.checkbox}
                      onPress={() => toggleTodo(todo)}
                    >
                      {todo.is_completed && <View style={styles.checkboxFilled} />}
                    </TouchableOpacity>
                      
                    <TouchableOpacity
                      style={styles.todoTextContainer}
                      onPress={() => !reorderModeActive && startEditingTodo(todo)}
                      onLongPress={() => handleTodoLongPress(todo.id)}
                      delayLongPress={500}
                    >
                      <Text
                        style={[
                          styles.todoText,
                          todo.is_completed && styles.todoTextCompleted,
                        ]}
                      >
                        {todo.content}
                      </Text>
                    </TouchableOpacity>

                    {reorderModeActive && longPressedTodo === todo.id && (
                      <View style={styles.orderButtons}>
                        <TouchableOpacity
                          onPress={() => {
                            moveTodo(todo, 'up', area);
                            exitReorderMode();
                          }}
                          disabled={index === 0}
                          style={[styles.orderButton, index === 0 && styles.orderButtonDisabled]}>
                          <ChevronUp size={14} color={index === 0 ? '#ccc' : '#007AFF'} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            moveTodo(todo, 'down', area);
                            exitReorderMode();
                          }}
                          disabled={index === areaTodos.length - 1}
                          style={[styles.orderButton, index === areaTodos.length - 1 && styles.orderButtonDisabled]}>
                          <ChevronDown size={14} color={index === areaTodos.length - 1 ? '#ccc' : '#007AFF'} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={exitReorderMode}
                          style={styles.cancelReorderButton}>
                          <Text style={styles.cancelReorderButtonText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <TouchableOpacity
                      onPress={() => deleteTodo(todo.id)}
                      style={styles.deleteButton}
                    >
                      <Trash2 size={14} color="#e74c3c" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}
          
          {/* ポストイット風の入力UI */}
          {addingToArea === area && (
            <View style={styles.postitInputContainer}>
              <TextInput
                style={styles.postitInput}
                value={newTaskText}
                onChangeText={setNewTaskText}
                placeholder="タスクを入力..."
                placeholderTextColor="#bdc3c7"
                multiline
                autoFocus
                maxLength={100}
              />
              <View style={styles.postitInputButtons}>
                <TouchableOpacity
                  style={styles.postitCancelButton}
                  onPress={cancelAddingTask}
                >
                  <Text style={styles.postitCancelButtonText}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.postitSaveButton,
                    !newTaskText.trim() && styles.postitSaveButtonDisabled
                  ]}
                  onPress={saveNewTask}
                  disabled={!newTaskText.trim()}
                >
                  <Text style={styles.postitSaveButtonText}>追加</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          
          {/* タスク追加エリア - タスクがない場合のみ表示 */}
          {areaTodos.length === 0 && addingToArea !== area && (
          <TouchableOpacity
              style={styles.addTaskArea}
              onPress={() => startAddingTask(area)}
            >
              <Text style={styles.addTaskHint}>
                タップで追加
              </Text>
          </TouchableOpacity>
          )}
          
          {/* タスクがある場合の控えめな追加エリア */}
          {areaTodos.length > 0 && addingToArea !== area && (
            <TouchableOpacity
              style={styles.addTaskAreaSubtle}
              onPress={() => startAddingTask(area)}
            >
              <Text style={styles.addTaskHintSubtle}>
                +
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
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
        <TouchableOpacity style={styles.dateContainer} onPress={openDatePicker}>
          <Calendar size={20} color="#000" />
          <Text style={styles.headerTitle}>{workspace.title}</Text>
        </TouchableOpacity>
        <Text style={styles.pageIndicator}>
          {todosWorkspaceCount} ページ
        </Text>
      </View>

      <Animated.View 
        style={[styles.content, { transform: [{ translateX }] }]}
        {...swipePanResponder.panHandlers}
      >
        {workspace.type === 'four_grid' ? (
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
        ) : workspace.type === 'individual' ? (
          <View style={styles.individualContainer}>
            {/* ポストイット表示エリア */}
            <ScrollView style={styles.postitsArea} contentContainerStyle={styles.postitsContent}>
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
                          <TouchableOpacity
                            style={styles.postitCheckbox}
                            onPress={() => toggleTodo(todo)}
                          >
                            {todo.is_completed && <View style={styles.postitCheckboxFilled} />}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.postitTextContainer}
                            onPress={() => !reorderModeActive && startEditingTodo(todo)}
                            onLongPress={() => handlePostitLongPress(todo.id)}
                            delayLongPress={500}
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
                          
                          {reorderModeActive && longPressedTodo === todo.id && (
                            <View style={styles.postitOrderButtons}>
                              <TouchableOpacity
                                onPress={() => {
                                  movePostit(todo, 'up');
                                  exitReorderMode();
                                }}
                                disabled={index === 0}
                                style={[styles.postitOrderButton, index === 0 && styles.postitOrderButtonDisabled]}>
                                <ChevronUp size={12} color={index === 0 ? '#ccc' : '#007AFF'} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => {
                                  movePostit(todo, 'down');
                                  exitReorderMode();
                                }}
                                disabled={index === sortedPostits.length - 1}
                                style={[styles.postitOrderButton, index === sortedPostits.length - 1 && styles.postitOrderButtonDisabled]}>
                                <ChevronDown size={12} color={index === sortedPostits.length - 1 ? '#ccc' : '#007AFF'} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={exitReorderMode}
                                style={styles.cancelPostitReorderButton}>
                                <Text style={styles.cancelPostitReorderButtonText}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                          
                          <TouchableOpacity
                            onPress={() => deleteTodo(todo.id)}
                            style={styles.postitDeleteButton}
                          >
                            <Trash2 size={12} color="#e74c3c" />
                          </TouchableOpacity>
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
    backgroundColor: '#f5f5dc', // ベージュ色のノート風背景
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
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    padding: 8,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    marginBottom: 8,
  },
  gridArea: {
    flex: 1,
    backgroundColor: '#fffacd', // ポストイットの薄い黄色
    borderRadius: 2,
    marginHorizontal: 4,
    padding: 16,
    // ポストイットの影効果
    shadowColor: '#000',
    shadowOffset: {
      width: 2,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    // ポストイットの微妙な傾き効果
    transform: [{ rotate: '0.5deg' }],
    borderWidth: 0.5,
    borderColor: '#f0e68c',
  },
  areaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  areaTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#2c3e50',
    fontStyle: 'italic',
    textDecorationLine: 'underline',
    textDecorationStyle: 'wavy',
    textDecorationColor: '#e74c3c',
  },
  areaTitleContainer: {
    flex: 1,
  },
  editHint: {
    fontSize: 10,
    color: '#7f8c8d',
    fontStyle: 'italic',
    marginTop: 2,
  },
  areaNameEditContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  areaNameInput: {
    flex: 1,
    fontSize: 14,
    color: '#2c3e50',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#d4af37',
    marginRight: 4,
  },
  saveAreaNameButton: {
    backgroundColor: '#27ae60',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 4,
  },
  saveAreaNameButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cancelAreaNameButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cancelAreaNameButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  areaProgress: {
    fontSize: 12,
    color: '#666',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#f5f5dc',
    borderRadius: 2,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d4af37',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ff6b6b',
    borderRadius: 1,
  },
  todoList: {
    flex: 1,
    marginBottom: 8,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#ff6b6b',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderColor: '#2c3e50',
    borderRadius: 2,
    marginRight: 8,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  checkboxFilled: {
    width: 10,
    height: 10,
    backgroundColor: '#27ae60',
    borderRadius: 1,
  },
  todoText: {
    flex: 1,
    fontSize: 13,
    color: '#2c3e50',
    lineHeight: 18,
    fontFamily: 'System',
  },
  todoTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#7f8c8d',
    opacity: 0.7,
  },
  orderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  orderButton: {
    padding: 4,
    marginHorizontal: 2,
  },
  orderButtonDisabled: {
    opacity: 0.3,
  },
  cancelReorderButton: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 4,
  },
  cancelReorderButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteButton: {
    padding: 6,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderRadius: 12,
    marginTop: 1,
  },
  addTodoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 2,
    borderTopColor: '#d4af37',
    borderTopStyle: 'dashed',
    paddingTop: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
    marginTop: 8,
  },
  addTodoInput: {
    flex: 1,
    fontSize: 13,
    color: '#2c3e50',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d4af37',
    fontStyle: 'italic',
    minHeight: 36,
  },
  addButton: {
    padding: 8,
    backgroundColor: '#27ae60',
    borderRadius: 16,
    marginLeft: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 1,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  // モーダル用のスタイル
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
  dateList: {
    flex: 1,
    padding: 16,
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
  // カレンダー用のスタイル
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
  // タスク追加エリア用のスタイル
  addTaskArea: {
    padding: 8,
    marginTop: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
  },
  addTaskHint: {
    fontSize: 11,
    color: '#bdc3c7',
    fontStyle: 'italic',
    textAlign: 'center',
    opacity: 0.7,
  },
  addTaskAreaSubtle: {
    padding: 4,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 20,
    opacity: 0.5,
  },
  addTaskHintSubtle: {
    fontSize: 16,
    color: '#bdc3c7',
    fontWeight: '300',
    textAlign: 'center',
    opacity: 0.6,
  },
  // タスク追加モーダル用のスタイル
  taskModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  taskModalContainer: {
    backgroundColor: '#fffacd',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  taskModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 8,
  },
  taskModalSubtitle: {
    fontSize: 14,
    color: '#7f8c8d',
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  taskModalInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#2c3e50',
    borderWidth: 1,
    borderColor: '#d4af37',
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  taskModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  taskModalCancelButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flex: 1,
    marginRight: 8,
  },
  taskModalCancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  taskModalSaveButton: {
    backgroundColor: '#27ae60',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flex: 1,
    marginLeft: 8,
  },
  taskModalSaveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  // ドラッグ&ドロップ用のスタイル
  dropZone: {
    height: 6,
    backgroundColor: 'transparent',
    marginVertical: 1,
    borderRadius: 3,
  },
  dropZoneVisible: {
    backgroundColor: 'rgba(52, 152, 219, 0.3)',
    borderWidth: 1,
    borderColor: '#3498db',
    borderStyle: 'dashed',
  },
  dropZoneActive: {
    backgroundColor: '#3498db',
    borderRadius: 3,
  },
  draggingTask: {
    opacity: 0.8,
    transform: [{ scale: 1.1 }],
    backgroundColor: 'rgba(52, 152, 219, 0.3)',
    borderWidth: 2,
    borderColor: '#3498db',
    borderStyle: 'solid',
    shadowColor: '#3498db',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  gridAreaDropTarget: {
    borderWidth: 2,
    borderColor: '#3498db',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
  },
  gridAreaDropZone: {
    borderWidth: 2,
    borderColor: '#3498db',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(52, 152, 219, 0.05)',
  },
  todoItemPlaceholder: {
    height: 40,
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    marginBottom: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3498db',
    borderStyle: 'dashed',
  },
  todoItemDropTarget: {
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    borderWidth: 2,
    borderColor: '#3498db',
    borderStyle: 'dashed',
  },
  dropHintText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  floatingTodo: {
    backgroundColor: '#fffacd',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
    borderWidth: 2,
    borderColor: '#3498db',
    transform: [{ scale: 1.1 }],
  },
  floatingTodoContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  floatingTask: {
    backgroundColor: '#fffacd',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
    borderWidth: 2,
    borderColor: '#3498db',
    transform: [{ scale: 1.1 }],
  },
  floatingTaskContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  floatingCheckbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#3498db',
    borderRadius: 4,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  floatingTaskText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  floatingDeleteButton: {
    padding: 4,
    backgroundColor: '#ffebee',
    borderRadius: 4,
    marginLeft: 8,
  },
  dragHintContainer: {
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    padding: 6,
    marginVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3498db',
    borderStyle: 'dashed',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dragHintText: {
    fontSize: 10,
    color: '#3498db',
    fontWeight: '600',
    flex: 1,
  },
  cancelButton: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 6,
    minWidth: 24,
    alignItems: 'center',
  },
  todoItemTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3498db',
  },
  // 新しい並び替えスタイル
  todoItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todoTextContainer: {
    flex: 1,
  },
  todoItemDragging: {
    opacity: 0.5,
    backgroundColor: '#f8f9fa',
  },
  todoItemDropTarget: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  // dragHandle, dropIndicatorスタイル（削除）
  reorderModeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#007bff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 4,
  },
  reorderModeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  individualContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5', // ホワイトボード風の背景
    position: 'relative',
  },
  individualPlaceholder: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  individualHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
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
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
  postitModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  postitModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  postitModalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  postitModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  postitModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  postitModalContent: {
    flex: 1,
  },
  postitModalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postitModalCloseText: {
    fontSize: 18,
    color: '#666',
  },
  postitModalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    backgroundColor: '#fafafa',
  },
  postitModalAddButton: {
    backgroundColor: '#3498db',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  postitModalAddButtonDisabled: {
    backgroundColor: '#ccc',
  },
  postitModalAddText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // ポストイット風の入力UI用のスタイル
  postitInputContainer: {
    backgroundColor: '#fffacd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ffd700',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  postitInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: '#2c3e50',
    minHeight: 60,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#d4af37',
    marginBottom: 8,
  },
  postitInputButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  postitCancelButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  postitCancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  postitSaveButton: {
    backgroundColor: '#27ae60',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  postitSaveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  postitSaveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // 個別モード用のポストイット入力カード
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
  // タスク編集用のスタイル（4分割モード）
  todoItemEditing: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#3498db',
  },
  todoEditInput: {
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: '#2c3e50',
    minHeight: 60,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 8,
  },
  todoEditButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  todoEditSaveButton: {
    backgroundColor: '#27ae60',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  todoEditSaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  todoEditCancelButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  todoEditCancelText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // タスク編集用のスタイル（個別モード）
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
  postitTextContainer: {
    flex: 1,
  },
  // 個別モード用の並び替えスタイル
  postitDragging: {
    opacity: 0.5,
    backgroundColor: '#f8f9fa',
  },
  postitDropTarget: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  postitReorderModeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#007bff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  postitReorderModeText: {
    color: '#fff',
    fontSize: 12,
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
});
