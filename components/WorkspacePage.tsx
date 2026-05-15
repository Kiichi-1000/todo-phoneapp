import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import Svg, { Defs, Pattern, Rect, Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Plus, Bell, Check } from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { checkWorkspaceCreationAccess, FREE_WORKSPACE_LIMIT } from '@/lib/aiAccess';
import { Workspace, Todo, GridArea, UserSettings, DEFAULT_FOUR_GRID_TODO_BORDER_COLORS } from '@/types/database';
import GridAreaDropTarget from '@/components/GridAreaDropTarget';
import ReminderPicker from '@/components/ReminderPicker';
import PostitMenu from '@/components/PostitMenu';
import TodoSchedulePicker from '@/components/TodoSchedulePicker';
import { getThemeForSkin, useFourGridSkin } from '@/lib/fourGridSkin';
import { scheduleTaskNotification, scheduleReminderNotification, cancelReminderNotification } from '@/lib/notifications';
import { upsertScheduleFromTodoSchedule, deleteScheduleFromTodo } from '@/lib/todoScheduleSync';

interface WorkspacePageProps {
  workspace: Workspace;
  todos: Todo[];
  settings: UserSettings;
  onTodosChange: (workspaceId: string, todos: Todo[]) => void;
  onWorkspaceChange: (workspace: Workspace) => void;
  onDataChanged: () => void;
  isCurrentPage?: boolean;
}

export default function WorkspacePage({
  workspace,
  todos,
  settings,
  onTodosChange,
  onWorkspaceChange,
  onDataChanged,
  isCurrentPage,
}: WorkspacePageProps) {
  const { user } = useAuth();
  const { t: tr } = useLanguage();
  const router = useRouter();
  const { skin: fourGridSkin } = useFourGridSkin();
  const fourGridTheme = getThemeForSkin(fourGridSkin);
  const [gridTitles, setGridTitles] = useState<Record<GridArea, string>>({
    top_left: workspace.area_titles?.top_left || tr('workspace.areaTopLeft'),
    top_right: workspace.area_titles?.top_right || tr('workspace.areaTopRight'),
    bottom_left: workspace.area_titles?.bottom_left || tr('workspace.areaBottomLeft'),
    bottom_right: workspace.area_titles?.bottom_right || tr('workspace.areaBottomRight'),
  });
  const [newTodoContent, setNewTodoContent] = useState<Record<GridArea, string>>({
    top_left: '',
    top_right: '',
    bottom_left: '',
    bottom_right: '',
  });
  const [editingArea, setEditingArea] = useState<GridArea | null>(null);
  const [editingAreaName, setEditingAreaName] = useState('');
  const [newTaskText, setNewTaskText] = useState('');
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  const [reminderTodo, setReminderTodo] = useState<Todo | null>(null);
  const [schedulingTodo, setSchedulingTodo] = useState<Todo | null>(null);
  const [longPressedTodo, setLongPressedTodo] = useState<string | null>(null);
  const [postitMenuTodo, setPostitMenuTodo] = useState<Todo | null>(null);
  const [postitMenuPosition, setPostitMenuPosition] = useState({ x: 0, y: 0 });
  const [isReorderMode, setIsReorderMode] = useState(false);

  const enterReorderMode = useCallback(() => {
    if (workspace.type !== 'four_grid') return;
    setIsReorderMode(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }, [workspace.type]);

  const exitReorderMode = useCallback(() => {
    setIsReorderMode(false);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const persistAreaOrder = useCallback(async (area: GridArea, reorderedAreaTodos: Todo[]) => {
    const updates = reorderedAreaTodos.map((t, i) => ({ id: t.id, order: i }));
    const idToOrder = new Map(updates.map(u => [u.id, u.order]));
    const updatedTodos = todos.map(t =>
      idToOrder.has(t.id) ? { ...t, order: idToOrder.get(t.id) as number } : t
    );
    onTodosChange(workspace.id, updatedTodos);

    const results = await Promise.all(
      updates.map(u =>
        supabase.from('todos').update({ order: u.order }).eq('id', u.id)
      )
    );
    const failed = results.filter(r => r.error);
    if (failed.length > 0) {
      console.error('persistAreaOrder: Supabase error(s)', failed.map(f => f.error));
    }
  }, [todos, workspace.id, onTodosChange]);

  const moveTodoToArea = useCallback(async (todo: Todo, targetArea: GridArea) => {
    if (todo.grid_area === targetArea) return;
    const sourceArea = todo.grid_area;

    const targetAreaTodos = todos
      .filter(t => t.grid_area === targetArea)
      .sort((a, b) => a.order - b.order);
    const sourceAreaTodos = sourceArea
      ? todos
          .filter(t => t.grid_area === sourceArea && t.id !== todo.id)
          .sort((a, b) => a.order - b.order)
      : [];

    const newTargetList = [...targetAreaTodos, { ...todo, grid_area: targetArea }];

    const targetUpdates = newTargetList.map((t, i) => ({
      id: t.id,
      order: i,
      grid_area: targetArea as GridArea,
    }));
    const sourceUpdates = sourceAreaTodos.map((t, i) => ({
      id: t.id,
      order: i,
      grid_area: sourceArea as GridArea | null,
    }));
    const allUpdates = [...targetUpdates, ...sourceUpdates];
    const updateMap = new Map(allUpdates.map(u => [u.id, u]));

    const updatedTodos = todos.map(t => {
      const u = updateMap.get(t.id);
      if (!u) return t;
      return { ...t, order: u.order, grid_area: u.grid_area };
    });
    onTodosChange(workspace.id, updatedTodos);

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    try {
      await Promise.all(
        targetUpdates.map(u =>
          supabase.from('todos')
            .update({ order: u.order, grid_area: u.grid_area })
            .eq('id', u.id)
        )
      );
      await Promise.all(
        sourceUpdates.map(u =>
          supabase.from('todos').update({ order: u.order }).eq('id', u.id)
        )
      );
    } catch (error) {
      console.error('Error moving todo across areas:', error);
    }
  }, [todos, workspace.id, onTodosChange]);

  const startEditingAreaName = (area: GridArea) => {
    setEditingArea(area);
    setEditingAreaName(gridTitles[area]);
  };

  const saveAreaName = async () => {
    if (editingArea && editingAreaName.trim()) {
      const newAreaName = editingAreaName.trim();
      setGridTitles(prev => ({ ...prev, [editingArea]: newAreaName }));
      try {
        const currentAreaTitles = workspace.area_titles || {
          top_left: tr('workspace.areaTopLeft'),
          top_right: tr('workspace.areaTopRight'),
          bottom_left: tr('workspace.areaBottomLeft'),
          bottom_right: tr('workspace.areaBottomRight'),
        };
        const updatedAreaTitles = { ...currentAreaTitles, [editingArea]: newAreaName };

        // Sync grid names from the current workspace's date FORWARD so past
        // workspaces keep their historical names. Future-dated workspaces
        // (already created or to be created) pick up the new name.
        // Fall back to single-row update if user / type are unavailable.
        const baseUpdate = supabase
          .from('workspaces')
          .update({ area_titles: updatedAreaTitles });
        const query =
          user && workspace.type === 'four_grid'
            ? baseUpdate
                .eq('user_id', user.id)
                .eq('type', 'four_grid')
                .gte('date', workspace.date)
            : baseUpdate.eq('id', workspace.id);

        const { data: updateData, error } = await query.select();
        if (!error && updateData && updateData.length > 0) {
          const matchingRow =
            updateData.find((w: any) => w.id === workspace.id) || updateData[0];
          onWorkspaceChange({ ...workspace, area_titles: matchingRow.area_titles });
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

  const startEditingTodo = (todo: Todo) => {
    setIsReorderMode(false);
    setEditingTodo(todo);
    setEditingTodoText(todo.content);
  };

  const saveEditingTodo = async () => {
    if (!editingTodo || !editingTodoText.trim()) return;
    const newContent = editingTodoText.trim();
    try {
      const { error } = await supabase
        .from('todos')
        .update({ content: newContent })
        .eq('id', editingTodo.id);
      if (error) throw error;
      if (
        user &&
        editingTodo.schedule_start_minutes != null &&
        editingTodo.schedule_end_minutes != null
      ) {
        await upsertScheduleFromTodoSchedule(
          user.id,
          editingTodo.id,
          newContent,
          workspace.date,
          editingTodo.schedule_start_minutes,
          editingTodo.schedule_end_minutes,
          editingTodo.schedule_color,
        );
      }
      const updated = todos.map(t =>
        t.id === editingTodo.id ? { ...t, content: newContent } : t
      );
      onTodosChange(workspace.id, updated);
      setEditingTodo(null);
      setEditingTodoText('');
    } catch (error) {
      console.error('Error updating todo:', error);
    }
  };

  const cancelEditingTodo = () => {
    setEditingTodo(null);
    setEditingTodoText('');
  };

  // ──────────────────────────────────────────────
  // 100 ページ無料枠ゲート (タスク追加直前の保険)
  //
  // 「タスクが1つでもあるワークスペース数 ≥ 100 かつ未契約 かつ このワークスペース
  //   は今 0 タスク (= このタスクが追加されると 101 件目の "使ったワークスペース"
  //   になる)」のときだけ Alert を出して paywall に誘導する。
  //
  // タスクがすでにある (= todos.length > 0) ワークスペースへの追加はカウント済みなので
  // ゲートしない。チェックは Supabase に問い合わせるため小さなネットワーク往復が走る
  // が、todos.length === 0 のときのみなのでオーバーヘッドは限定的。
  // ──────────────────────────────────────────────
  const ensureWithinFreeLimitForFirstTask = async (): Promise<boolean> => {
    if (!user) return false;
    if (todos.length > 0) return true; // 既にタスクがある = カウント済み → スキップ
    try {
      const access = await checkWorkspaceCreationAccess(user.id);
      if (!access.allowed) {
        Alert.alert(
          tr('workspace.limitReachedTitle') || 'ワークスペースの上限に達しました',
          tr('workspace.limitReachedMessage') ||
            `タスクを追加できるページは無料枠で ${FREE_WORKSPACE_LIMIT} 日分までです。プランに加入すると無制限に追加できます。`,
          [
            { text: tr('common.cancel') || 'キャンセル', style: 'cancel' },
            {
              text: tr('workspace.viewPlans') || 'プランを見る',
              onPress: () => router.push('/paywall?context=workspace'),
            },
          ],
        );
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[WorkspacePage] limit check threw, allowing add as fallback', e);
      return true;
    }
  };

  const addTodo = async (gridArea: GridArea, content?: string) => {
    if (!user) return;
    const taskContent = content || newTodoContent[gridArea].trim();
    if (!taskContent) return;
    // 無料枠 100 ページのゲート。todos.length === 0 のときだけ実行 (= このタスクで
    // 「使ったワークスペース」が +1 増えるケース)。
    const ok = await ensureWithinFreeLimitForFirstTask();
    if (!ok) return;
    try {
      const areaTodos = todos.filter(t => t.grid_area === gridArea);
      const maxOrder = areaTodos.length > 0 ? Math.max(...areaTodos.map(t => t.order)) : -1;
      const { data, error } = await supabase
        .from('todos')
        .insert({
          workspace_id: workspace.id,
          content: taskContent,
          grid_area: gridArea,
          user_id: user.id,
          order: maxOrder + 1,
        })
        .select()
        .single() as { data: Todo | null; error: any };
      if (error) throw error;
      if (data) {
        onTodosChange(workspace.id, [...todos, data]);
        setNewTodoContent({ ...newTodoContent, [gridArea]: '' });
        onDataChanged();
      }
    } catch (error) {
      console.error('Error adding todo:', error);
    }
  };

  const handleAddPostit = async () => {
    if (!user || !newTaskText.trim()) return;
    // 無料枠 100 ページのゲート。todos.length === 0 のときのみ。
    const ok = await ensureWithinFreeLimitForFirstTask();
    if (!ok) return;
    try {
      const postitTodos = todos.filter(t => t.grid_area === null);
      const maxOrder = postitTodos.length > 0 ? Math.max(...postitTodos.map(t => t.order)) : -1;
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
          order: maxOrder + 1,
        })
        .select()
        .single() as { data: Todo | null; error: any };
      if (error) throw error;
      if (newTodo) {
        onTodosChange(workspace.id, [...todos, newTodo]);
        onDataChanged();
      }
      setNewTaskText('');
    } catch (error) {
      console.error('Error adding postit:', error);
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
      const updated = todos.map(t =>
        t.id === todo.id
          ? { ...t, is_completed: !t.is_completed, completed_at: !t.is_completed ? new Date().toISOString() : null }
          : t
      );
      onTodosChange(workspace.id, updated);
    } catch (error) {
      console.error('Error toggling todo:', error);
    }
  };

  const deleteTodo = async (todoId: string) => {
    setIsReorderMode(false);
    try {
      const todoToDelete = todos.find(t => t.id === todoId);
      if (todoToDelete?.notification_id) {
        await cancelReminderNotification(todoToDelete.notification_id);
      }
      if (user && todoToDelete) {
        await deleteScheduleFromTodo(user.id, todoToDelete.id);
      }
      const { error } = await supabase.from('todos').delete().eq('id', todoId);
      if (error) throw error;
      const newTodos = todos.filter(t => t.id !== todoId);
      onTodosChange(workspace.id, newTodos);
      if (newTodos.length === 0) onDataChanged();
    } catch (error) {
      console.error('Error deleting todo:', error);
    }
  };

  const openReminderPicker = (todo: Todo) => {
    setIsReorderMode(false);
    setReminderTodo(todo);
  };

  const openSchedulePicker = (todo: Todo) => {
    setIsReorderMode(false);
    setSchedulingTodo(todo);
  };

  const handleSaveTodoSchedule = async (startMin: number, endMin: number, notifyBefore: number | null, color: string) => {
    if (!schedulingTodo) return;
    if (schedulingTodo.notification_id) {
      await cancelReminderNotification(schedulingTodo.notification_id);
    }
    let newNotificationId: string | null = null;
    if (notifyBefore !== null) {
      const [year, month, day] = workspace.date.split('-').map(Number);
      const notifyMinutes = startMin - notifyBefore;
      if (notifyMinutes >= 0) {
        const notifyAt = new Date(year, month - 1, day, Math.floor(notifyMinutes / 60), notifyMinutes % 60, 0);
        if (notifyAt > new Date()) {
          newNotificationId = await scheduleTaskNotification(
            schedulingTodo.id,
            schedulingTodo.content,
            notifyAt
          );
        }
      }
    }
    const patch = {
      schedule_start_minutes: startMin,
      schedule_end_minutes: endMin,
      schedule_notify_before: notifyBefore,
      schedule_color: color,
      notification_id: newNotificationId,
    };
    try {
      const { error } = await supabase.from('todos').update(patch).eq('id', schedulingTodo.id);
      if (!error) {
        if (user) {
          await upsertScheduleFromTodoSchedule(
            user.id,
            schedulingTodo.id,
            schedulingTodo.content,
            workspace.date,
            startMin,
            endMin,
            color,
          );
        }
        const updated = todos.map(t => t.id === schedulingTodo.id ? { ...t, ...patch } : t);
        onTodosChange(workspace.id, updated);
      }
    } catch (e) {
      console.error('Error saving todo schedule:', e);
    }
    setSchedulingTodo(null);
  };

  const handleRemoveTodoSchedule = async () => {
    if (!schedulingTodo) return;
    if (schedulingTodo.notification_id) {
      await cancelReminderNotification(schedulingTodo.notification_id);
    }
    const patch = {
      schedule_start_minutes: null,
      schedule_end_minutes: null,
      schedule_notify_before: null,
      schedule_color: null,
      notification_id: null,
    };
    try {
      const { error } = await supabase.from('todos').update(patch).eq('id', schedulingTodo.id);
      if (!error) {
        if (user) {
          await deleteScheduleFromTodo(user.id, schedulingTodo.id);
        }
        const updated = todos.map(t => t.id === schedulingTodo.id ? { ...t, ...patch } : t);
        onTodosChange(workspace.id, updated);
      }
    } catch (e) {
      console.error('Error removing todo schedule:', e);
    }
    setSchedulingTodo(null);
  };

  const clearReminder = async (todo: Todo) => {
    setIsReorderMode(false);
    try {
      if (todo.notification_id) {
        await cancelReminderNotification(todo.notification_id);
      }
      const { error } = await supabase
        .from('todos')
        .update({ reminder_at: null, notification_id: null })
        .eq('id', todo.id);
      if (!error) {
        const updated = todos.map(t => t.id === todo.id ? { ...t, reminder_at: null, notification_id: null } : t);
        onTodosChange(workspace.id, updated);
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
      const updated = todos.map(t =>
        t.id === reminderTodo.id ? { ...t, reminder_at: reminderAt, notification_id: notificationId } : t
      );
      onTodosChange(workspace.id, updated);
    } catch (error) {
      console.error('Error setting reminder:', error);
    }
    setReminderTodo(null);
  };

  const movePostit = async (todo: Todo, direction: 'up' | 'down') => {
    try {
      const postitTodos = todos
        .filter(t => t.grid_area === null)
        .sort((a, b) => a.order - b.order);
      const idx = postitTodos.findIndex(t => t.id === todo.id);
      if (direction === 'up' && idx === 0) return;
      if (direction === 'down' && idx === postitTodos.length - 1) return;
      const newIndex = direction === 'up' ? idx - 1 : idx + 1;

      const reordered = [...postitTodos];
      const [moved] = reordered.splice(idx, 1);
      reordered.splice(newIndex, 0, moved);

      const updates = reordered.map((t, i) => ({ id: t.id, order: i }));
      const updatedTodos = todos.map(t => {
        const u = updates.find(u => u.id === t.id);
        return u ? { ...t, order: u.order } : t;
      });
      onTodosChange(workspace.id, updatedTodos);

      for (const u of updates) {
        await supabase.from('todos').update({ order: u.order }).eq('id', u.id);
      }
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error moving postit:', error);
    }
  };

  const getTodosForArea = (area: GridArea) => {
    return todos.filter(t => t.grid_area === area).sort((a, b) => a.order - b.order);
  };

  const getProgressForArea = (area: GridArea) => {
    const areaTodos = getTodosForArea(area);
    if (areaTodos.length === 0) return 0;
    const completed = areaTodos.filter(t => t.is_completed).length;
    return Math.round((completed / areaTodos.length) * 100);
  };

  const renderGridArea = (area: GridArea) => {
    const areaTodos = getTodosForArea(area);
    const progress = getProgressForArea(area);
    const borderColors = settings.four_grid_todo_border_colors ?? DEFAULT_FOUR_GRID_TODO_BORDER_COLORS;
    const todoBorderLeftColor = borderColors[area];
    return (
      <GridAreaDropTarget
        area={area}
        todoBorderLeftColor={todoBorderLeftColor}
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
        onQuickAdd={addTodo}
        onReminderPress={openReminderPicker}
        onClearReminder={clearReminder}
        onSchedulePress={openSchedulePicker}
        isReorderMode={isReorderMode}
        onReorderEnd={persistAreaOrder}
        onMoveToArea={moveTodoToArea}
        onActivateReorderMode={enterReorderMode}
        skin={fourGridSkin}
      />
    );
  };

  const reorderActivationGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(300)
        .maxDistance(10)
        .runOnJS(true)
        .onStart(() => {
          if (!isReorderMode) {
            enterReorderMode();
          }
        }),
    [isReorderMode, enterReorderMode]
  );

  const renderFourGrid = () => (
    <View style={[styles.fourGridContainer, { backgroundColor: fourGridTheme.pageBg }]}>
      {isReorderMode && (
        <View style={styles.reorderBar}>
          <TouchableOpacity style={styles.reorderDoneButton} onPress={exitReorderMode}>
            <Check size={14} color="#fff" />
            <Text style={styles.reorderDoneText}>{tr('common.done')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {/*
        背面: 余白の長押しのみ並べ替えモードへ（pointerEvents: box-none のレイヤーを通過）
        前面: 4エリアのタスクグリッドは常にタッチを奪う → 長押しはタスクメニュー用
      */}
      <View style={styles.gridWorkspace}>
        {fourGridTheme.showGridPattern && (
          <Svg
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            width="100%"
            height="100%"
          >
            <Defs>
              <Pattern
                id="wbDots"
                x="0"
                y="0"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
              >
                <Circle cx="10" cy="10" r="0.9" fill={fourGridTheme.gridPatternDotColor} />
              </Pattern>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#wbDots)" opacity={0.7} />
          </Svg>
        )}
        <GestureDetector gesture={reorderActivationGesture}>
          <View style={styles.reorderHitLayer} collapsable={false} />
        </GestureDetector>
        <View pointerEvents="box-none" style={styles.gridForeground} collapsable={false}>
          <View pointerEvents="box-none" style={styles.grid}>
            <View pointerEvents="box-none" style={styles.gridRow}>
              {renderGridArea('top_left')}
              {renderGridArea('top_right')}
            </View>
            <View pointerEvents="box-none" style={styles.gridRow}>
              {renderGridArea('bottom_left')}
              {renderGridArea('bottom_right')}
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  const renderIndividual = () => {
    const sortedPostits = todos
      .filter(t => t.grid_area === null)
      .sort((a, b) => a.order - b.order);
    const completedCount = sortedPostits.filter(t => t.is_completed).length;
    const total = sortedPostits.length;
    const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    return (
      <KeyboardAvoidingView
        style={styles.individualContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {total > 0 && (
          <View style={styles.indHeader}>
            <Text style={styles.indHeaderCount}>{tr('workspace.completedCount', { completed: completedCount, total })}</Text>
            <View style={styles.indProgressTrack}>
              <View style={[styles.indProgressFill, { width: `${progressPct}%` as any }]} />
            </View>
            <Text style={styles.indHeaderPct}>{progressPct}%</Text>
          </View>
        )}

        <ScrollView
          style={styles.indScroll}
          contentContainerStyle={[
            styles.indScrollContent,
            total === 0 && styles.indScrollContentEmpty,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {total === 0 ? (
            <View style={styles.indEmpty}>
              <Text style={styles.indEmptyTitle}>{tr('workspace.noTodos')}</Text>
              <Text style={styles.indEmptyHint}>{tr('workspace.noTodosHint')}</Text>
            </View>
          ) : (
            sortedPostits.map(todo => {
              if (editingTodo?.id === todo.id) {
                return (
                  <View key={todo.id} style={styles.indTodoEditing}>
                    <TextInput
                      style={styles.indTodoEditInput}
                      value={editingTodoText}
                      onChangeText={setEditingTodoText}
                      multiline
                      autoFocus
                      maxLength={100}
                      returnKeyType="done"
                      blurOnSubmit
                      onSubmitEditing={saveEditingTodo}
                    />
                    <View style={styles.indTodoEditActions}>
                      <TouchableOpacity style={styles.indTodoEditCancel} onPress={cancelEditingTodo}>
                        <Text style={styles.indTodoEditCancelText}>{tr('common.cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.indTodoEditSave} onPress={saveEditingTodo}>
                        <Text style={styles.indTodoEditSaveText}>{tr('common.save')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }
              return (
                <TouchableOpacity
                  key={todo.id}
                  style={[styles.indTodoRow, todo.is_completed && styles.indTodoRowDone]}
                  onPress={() => startEditingTodo(todo)}
                  onLongPress={e => {
                    setLongPressedTodo(todo.id);
                    setPostitMenuTodo(todo);
                    setPostitMenuPosition({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
                    if (Platform.OS !== 'web') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }
                  }}
                  delayLongPress={400}
                  activeOpacity={0.75}
                >
                  <View style={styles.indTodoAccent} />
                  <TouchableOpacity
                    style={styles.indTodoCheckWrap}
                    onPress={() => toggleTodo(todo)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <View style={[styles.indTodoCheck, todo.is_completed && styles.indTodoCheckFilled]}>
                      {todo.is_completed && <Check size={11} color="#fff" strokeWidth={3} />}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.indTodoBody}>
                    <Text
                      style={[styles.indTodoText, todo.is_completed && styles.indTodoTextDone]}
                      numberOfLines={4}
                    >
                      {todo.content}
                    </Text>
                    {todo.reminder_at && (
                      <View style={styles.indTodoReminder}>
                        <Bell size={10} color="#f59e0b" />
                        <Text style={styles.indTodoReminderText}>
                          {(() => {
                            const d = new Date(todo.reminder_at);
                            const h = d.getHours().toString().padStart(2, '0');
                            const m = d.getMinutes().toString().padStart(2, '0');
                            const now = new Date();
                            if (d.toDateString() === now.toDateString()) return `${tr('common.today')} ${h}:${m}`;
                            const tmr = new Date(now);
                            tmr.setDate(tmr.getDate() + 1);
                            if (d.toDateString() === tmr.toDateString()) return `${tr('common.tomorrow')} ${h}:${m}`;
                            return `${d.getMonth() + 1}/${d.getDate()} ${h}:${m}`;
                          })()}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        <View style={styles.indAddBar}>
          <TextInput
            style={styles.indAddInput}
            value={newTaskText}
            onChangeText={setNewTaskText}
            placeholder={tr('workspace.addTaskInputPlaceholder')}
            placeholderTextColor="#bbb"
            returnKeyType="done"
            onSubmitEditing={handleAddPostit}
            blurOnSubmit={false}
            maxLength={100}
          />
          <TouchableOpacity
            style={[styles.indAddSend, !newTaskText.trim() && styles.indAddSendOff]}
            onPress={handleAddPostit}
            disabled={!newTaskText.trim()}
            activeOpacity={0.7}
          >
            <Plus size={18} color={newTaskText.trim() ? '#fff' : '#ccc'} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  };

  return (
    <View style={styles.pageContainer}>
      {workspace.type === 'four_grid' ? renderFourGrid() : workspace.type === 'individual' ? renderIndividual() : (
        <View style={styles.individualContainer}>
          <Text style={styles.notePlaceholder}>{tr('workspace.noteDesc')}</Text>
        </View>
      )}

      <ReminderPicker
        visible={reminderTodo !== null}
        currentReminder={reminderTodo?.reminder_at ?? null}
        onSelect={handleSetReminder}
        onClose={() => setReminderTodo(null)}
        workspaceDate={workspace.date}
      />

      <PostitMenu
        visible={postitMenuTodo !== null}
        todo={postitMenuTodo}
        position={postitMenuPosition}
        todos={todos}
        onClose={() => { setPostitMenuTodo(null); setLongPressedTodo(null); }}
        onSchedulePress={t => { setPostitMenuTodo(null); setLongPressedTodo(null); openSchedulePicker(t); }}
        onMoveUp={(t) => { setPostitMenuTodo(null); setLongPressedTodo(null); movePostit(t, 'up'); }}
        onMoveDown={(t) => { setPostitMenuTodo(null); setLongPressedTodo(null); movePostit(t, 'down'); }}
        onDelete={(id) => { setPostitMenuTodo(null); setLongPressedTodo(null); deleteTodo(id); }}
      />

      <TodoSchedulePicker
        visible={schedulingTodo !== null}
        todo={schedulingTodo}
        workspaceDate={workspace.date}
        onSave={handleSaveTodoSchedule}
        onRemove={handleRemoveTodoSchedule}
        onClose={() => setSchedulingTodo(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pageContainer: {
    flex: 1,
    backgroundColor: '#f5f5dc',
  },
  fourGridContainer: {
    flex: 1,
  },
  gridWorkspace: {
    flex: 1,
    position: 'relative',
  },
  reorderHitLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    backgroundColor: 'transparent',
  },
  gridForeground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  grid: {
    flex: 1,
    padding: 12,
    rowGap: 8,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    columnGap: 8,
  },
  reorderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: '#8e44ad',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reorderDoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reorderDoneText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  individualContainer: {
    flex: 1,
    backgroundColor: '#f7f7f5',
  },
  // ── progress header ──
  indHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e8e8',
  },
  indHeaderCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    minWidth: 52,
  },
  indProgressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#efefef',
    borderRadius: 2,
    overflow: 'hidden',
  },
  indProgressFill: {
    height: 4,
    backgroundColor: '#3b82f6',
    borderRadius: 2,
  },
  indHeaderPct: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
    minWidth: 32,
    textAlign: 'right',
  },
  // ── scroll list ──
  indScroll: {
    flex: 1,
  },
  indScrollContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  indScrollContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  // ── empty state ──
  indEmpty: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  indEmptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ccc',
    marginBottom: 6,
  },
  indEmptyHint: {
    fontSize: 13,
    color: '#ddd',
  },
  // ── todo row ──
  indTodoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
    overflow: 'hidden',
    minHeight: 52,
  },
  indTodoRowDone: {
    opacity: 0.6,
  },
  indTodoAccent: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: '#3b82f6',
  },
  indTodoCheckWrap: {
    paddingHorizontal: 12,
    alignSelf: 'center',
  },
  indTodoCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#d0d0d0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indTodoCheckFilled: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  indTodoBody: {
    flex: 1,
    paddingVertical: 13,
    paddingRight: 14,
  },
  indTodoText: {
    fontSize: 14,
    color: '#1a1a1a',
    lineHeight: 20,
  },
  indTodoTextDone: {
    textDecorationLine: 'line-through',
    color: '#bbb',
  },
  indTodoReminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  indTodoReminderText: {
    fontSize: 11,
    color: '#f59e0b',
  },
  // ── inline editing ──
  indTodoEditing: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  indTodoEditInput: {
    fontSize: 14,
    color: '#1a1a1a',
    minHeight: 56,
    textAlignVertical: 'top',
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginBottom: 8,
  },
  indTodoEditActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  indTodoEditCancel: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  indTodoEditCancelText: {
    fontSize: 13,
    color: '#888',
  },
  indTodoEditSave: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
  },
  indTodoEditSaveText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  // ── bottom add bar ──
  indAddBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8e8e8',
  },
  indAddInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#f5f5f3',
    borderRadius: 20,
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#1a1a1a',
  },
  indAddSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indAddSendOff: {
    backgroundColor: '#efefef',
  },
  notePlaceholder: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    padding: 16,
  },
});
