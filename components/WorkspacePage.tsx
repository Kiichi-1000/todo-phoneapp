import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Plus, Bell, Check } from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Workspace, Todo, GridArea, UserSettings } from '@/types/database';
import GridAreaDropTarget from '@/components/GridAreaDropTarget';
import ReminderPicker from '@/components/ReminderPicker';
import { scheduleReminderNotification, cancelReminderNotification } from '@/lib/notifications';
import PostitMenu from '@/components/PostitMenu';

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
  const [gridTitles, setGridTitles] = useState<Record<GridArea, string>>({
    top_left: workspace.area_titles?.top_left || '\u5DE6\u4E0A\u30A8\u30EA\u30A2',
    top_right: workspace.area_titles?.top_right || '\u53F3\u4E0A\u30A8\u30EA\u30A2',
    bottom_left: workspace.area_titles?.bottom_left || '\u5DE6\u4E0B\u30A8\u30EA\u30A2',
    bottom_right: workspace.area_titles?.bottom_right || '\u53F3\u4E0B\u30A8\u30EA\u30A2',
  });
  const [newTodoContent, setNewTodoContent] = useState<Record<GridArea, string>>({
    top_left: '',
    top_right: '',
    bottom_left: '',
    bottom_right: '',
  });
  const [editingArea, setEditingArea] = useState<GridArea | null>(null);
  const [editingAreaName, setEditingAreaName] = useState('');
  const [isAddingPostit, setIsAddingPostit] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  const [reminderTodo, setReminderTodo] = useState<Todo | null>(null);
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
          top_left: '\u5DE6\u4E0A\u30A8\u30EA\u30A2',
          top_right: '\u53F3\u4E0A\u30A8\u30EA\u30A2',
          bottom_left: '\u5DE6\u4E0B\u30A8\u30EA\u30A2',
          bottom_right: '\u53F3\u4E0B\u30A8\u30EA\u30A2',
        };
        const updatedAreaTitles = { ...currentAreaTitles, [editingArea]: newAreaName };
        const { data: updateData, error } = await supabase
          .from('workspaces')
          .update({ area_titles: updatedAreaTitles })
          .eq('id', workspace.id)
          .select();
        if (!error && updateData && updateData[0]) {
          onWorkspaceChange({ ...workspace, area_titles: updateData[0].area_titles });
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
    try {
      const { error } = await supabase
        .from('todos')
        .update({ content: editingTodoText.trim() })
        .eq('id', editingTodo.id);
      if (error) throw error;
      const updated = todos.map(t =>
        t.id === editingTodo.id ? { ...t, content: editingTodoText.trim() } : t
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

  const addTodo = async (gridArea: GridArea, content?: string) => {
    if (!user) return;
    const taskContent = content || newTodoContent[gridArea].trim();
    if (!taskContent) return;
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
      setIsAddingPostit(false);
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
        onQuickAdd={addTodo}
        onReminderPress={openReminderPicker}
        onClearReminder={clearReminder}
        isReorderMode={isReorderMode}
        onReorderEnd={persistAreaOrder}
        onMoveToArea={moveTodoToArea}
        onActivateReorderMode={enterReorderMode}
      />
    );
  };

  const reorderActivationGesture = Gesture.LongPress()
    .minDuration(300)
    .maxDistance(10)
    .runOnJS(true)
    .onStart(() => {
      if (!isReorderMode) {
        enterReorderMode();
      }
    });

  const renderFourGrid = () => (
    <View style={styles.fourGridContainer}>
      {isReorderMode && (
        <View style={styles.reorderBar}>
          <TouchableOpacity style={styles.reorderDoneButton} onPress={exitReorderMode}>
            <Check size={14} color="#fff" />
            <Text style={styles.reorderDoneText}>完了</Text>
          </TouchableOpacity>
        </View>
      )}
      {/*
        背面: 余白の長押しのみ並べ替えモードへ（pointerEvents: box-none のレイヤーを通過）
        前面: 4エリアのタスクグリッドは常にタッチを奪う → 長押しはタスクメニュー用
      */}
      <View style={styles.gridWorkspace}>
        <GestureDetector gesture={reorderActivationGesture}>
          <View style={styles.reorderHitLayer} collapsable={false} />
        </GestureDetector>
        <View style={styles.gridForeground} collapsable={false}>
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
        </View>
      </View>
    </View>
  );

  const renderIndividual = () => {
    const sortedPostits = todos
      .filter(t => t.grid_area === null)
      .sort((a, b) => a.order - b.order);

    return (
      <View style={styles.individualContainer}>
        {sortedPostits.length === 0 && !isAddingPostit ? (
          <View style={styles.emptyPostitsContainer}>
            <Text style={styles.emptyPostitsText}>
              {'\u53F3\u4E0B\u306E\uFF0B\u30DC\u30BF\u30F3\u3067\u30DD\u30B9\u30C8\u30A4\u30C3\u30C8\u3092\u8FFD\u52A0'}
            </Text>
          </View>
        ) : (
          <View style={styles.postitsContent}>
            {sortedPostits.map((todo) => (
              <View key={todo.id}>
                {editingTodo?.id === todo.id ? (
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
                        <TouchableOpacity style={styles.postitEditSaveButton} onPress={saveEditingTodo}>
                          <Text style={styles.postitEditSaveText}>{'\u2713'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.postitEditCancelButton} onPress={cancelEditingTodo}>
                          <Text style={styles.postitEditCancelText}>{'\u2715'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={styles.postit}>
                    <View style={styles.postitRow}>
                      <TouchableOpacity style={styles.postitCheckbox} onPress={() => toggleTodo(todo)}>
                        {todo.is_completed && <View style={styles.postitCheckboxFilled} />}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.postitTextContainer}
                        onPress={() => startEditingTodo(todo)}
                        onLongPress={(e) => {
                          setLongPressedTodo(todo.id);
                          setPostitMenuTodo(todo);
                          setPostitMenuPosition({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
                          if (Platform.OS !== 'web') {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          }
                        }}
                        delayLongPress={400}
                      >
                        <Text style={[styles.postitText, todo.is_completed && styles.postitTextCompleted]}>
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
                            if (d.toDateString() === now.toDateString()) return `\u4ECA\u65E5 ${h}:${m}`;
                            const tmr = new Date(now);
                            tmr.setDate(tmr.getDate() + 1);
                            if (d.toDateString() === tmr.toDateString()) return `\u660E\u65E5 ${h}:${m}`;
                            return `${d.getMonth() + 1}/${d.getDate()} ${h}:${m}`;
                          })()}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))}
            {isAddingPostit && (
              <View style={styles.postitInputCard}>
                <TextInput
                  style={styles.postitInputCardText}
                  value={newTaskText}
                  onChangeText={setNewTaskText}
                  placeholder={'\u30DD\u30B9\u30C8\u30A4\u30C3\u30C8\u3092\u5165\u529B...'}
                  placeholderTextColor="#bdc3c7"
                  multiline
                  autoFocus
                  maxLength={100}
                />
                <View style={styles.postitInputCardButtons}>
                  <TouchableOpacity
                    style={styles.postitInputCardCancelButton}
                    onPress={() => { setIsAddingPostit(false); setNewTaskText(''); }}
                  >
                    <Text style={styles.postitInputCardCancelText}>{'\u2715'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.postitInputCardSaveButton, !newTaskText.trim() && styles.postitInputCardSaveButtonDisabled]}
                    onPress={handleAddPostit}
                    disabled={!newTaskText.trim()}
                  >
                    <Text style={styles.postitInputCardSaveText}>{'\u2713'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
        {!isAddingPostit && (
          <TouchableOpacity
            style={styles.addPostitButton}
            onPress={() => { setIsAddingPostit(true); setNewTaskText(''); }}
          >
            <Plus size={24} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.pageContainer}>
      {workspace.type === 'four_grid' ? renderFourGrid() : workspace.type === 'individual' ? renderIndividual() : (
        <View style={styles.individualContainer}>
          <Text style={styles.notePlaceholder}>{'\u30CE\u30FC\u30C8\u30E2\u30FC\u30C9\uFF08\u958B\u767A\u4E2D\uFF09'}</Text>
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
        onReminderPress={(t) => { setPostitMenuTodo(null); setLongPressedTodo(null); openReminderPicker(t); }}
        onClearReminder={async (t) => {
          setPostitMenuTodo(null);
          setLongPressedTodo(null);
          await clearReminder(t);
        }}
        onMoveUp={(t) => { setPostitMenuTodo(null); setLongPressedTodo(null); movePostit(t, 'up'); }}
        onMoveDown={(t) => { setPostitMenuTodo(null); setLongPressedTodo(null); movePostit(t, 'down'); }}
        onDelete={(id) => { setPostitMenuTodo(null); setLongPressedTodo(null); deleteTodo(id); }}
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
    pointerEvents: 'box-none',
  },
  grid: {
    flex: 1,
    padding: 12,
    rowGap: 8,
    pointerEvents: 'box-none',
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    columnGap: 8,
    pointerEvents: 'box-none',
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
    backgroundColor: '#f5f5f5',
    position: 'relative',
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
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
  },
  postit: {
    backgroundColor: '#fffacd',
    width: '100%',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffd700',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 8,
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
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffd700',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 8,
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
  notePlaceholder: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    padding: 16,
  },
});
