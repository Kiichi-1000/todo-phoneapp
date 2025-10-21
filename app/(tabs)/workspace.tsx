import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Plus, Trash2, Calendar } from 'lucide-react-native';
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

  const panGesture = Gesture.Pan()
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD) {
        goToPreviousPage();
      } else if (event.translationX < -SWIPE_THRESHOLD) {
        goToNextPage();
      }
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

    testConnection();
    loadSettings();
  }, []);

  useEffect(() => {
    if (settings) {
      loadWorkspaceDates();
    }
  }, [settings]);

  useEffect(() => {
    if (workspaceDates.length > 0 && workspaceDates[currentIndex]) {
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
    }
  };

  const loadWorkspaceDates = async () => {
    try {
      console.log('Loading workspace dates...');
      const { data: workspaces, error } = await supabase
        .from('workspaces')
        .select('id, date')
        .order('date', { ascending: false }) as { data: Array<{ id: string; date: string }> | null; error: any };

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
      const datesWithTodos = (workspaces || [])
        .filter((w) => workspaceIdsWithTodos.has(w.id) || w.date === today)
        .map((w) => w.date);

      if (!datesWithTodos.includes(today)) {
        datesWithTodos.unshift(today);
      }

      const sortedDates = Array.from(new Set(datesWithTodos)).sort(
        (a, b) => new Date(b).getTime() - new Date(a).getTime()
      );

      setWorkspaceDates(sortedDates);

      const todayIndex = sortedDates.indexOf(today);
      setCurrentIndex(todayIndex >= 0 ? todayIndex : 0);
    } catch (error) {
      console.error('Error loading workspace dates:', error);
    }
  };

  const loadWorkspaceByDate = async (dateString: string) => {
    try {
      const { data: existingWorkspace, error: fetchError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('date', dateString)
        .maybeSingle() as { data: Workspace | null; error: any };

      if (fetchError) throw fetchError;

      if (existingWorkspace) {
        setWorkspace(existingWorkspace);
        await loadTodos(existingWorkspace.id);
      } else {
        const date = new Date(dateString);
        const { data: newWorkspace, error: createError } = await supabase
          .from('workspaces')
          .insert({
            title: formatDateTitle(date),
            type: settings?.default_workspace_type || 'four_grid',
            date: dateString,
          } as any)
          .select()
          .single() as { data: Workspace | null; error: any };

        if (createError) throw createError;

        setWorkspace(newWorkspace);
        setTodos([]);
      }
    } catch (error) {
      console.error('Error loading workspace:', error);
    }
  };

  const loadTodos = async (workspaceId: string) => {
    try {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true }) as { data: Todo[] | null; error: any };

      if (error) throw error;
      setTodos(data || []);
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

  const goToPreviousPage = () => {
    if (currentIndex < workspaceDates.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToNextPage = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const addTodo = async (gridArea: GridArea) => {
    if (!workspace) return;

    const content = newTodoContent[gridArea].trim();
    if (!content) return;

    try {
      const { data, error } = await supabase
        .from('todos')
        .insert({
          workspace_id: workspace.id,
          content,
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
    return todos.filter((t) => t.grid_area === area);
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
      <View style={styles.gridArea}>
        <View style={styles.areaHeader}>
          <Text style={styles.areaTitle}>{gridTitles[area]}</Text>
          <Text style={styles.areaProgress}>{progress}%</Text>
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        <ScrollView style={styles.todoList}>
          {areaTodos.map((todo) => (
            <View key={todo.id} style={styles.todoItem}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => toggleTodo(todo)}>
                {todo.is_completed && <View style={styles.checkboxFilled} />}
              </TouchableOpacity>
              <Text
                style={[
                  styles.todoText,
                  todo.is_completed && styles.todoTextCompleted,
                ]}>
                {todo.content}
              </Text>
              <TouchableOpacity
                onPress={() => deleteTodo(todo.id)}
                style={styles.deleteButton}>
                <Trash2 size={16} color="#999" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <View style={styles.addTodoContainer}>
          <TextInput
            style={styles.addTodoInput}
            value={newTodoContent[area]}
            onChangeText={(text) =>
              setNewTodoContent({ ...newTodoContent, [area]: text })
            }
            placeholder="新しいタスク"
            placeholderTextColor="#999"
            onSubmitEditing={() => addTodo(area)}
          />
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => addTodo(area)}>
            <Plus size={20} color="#000" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

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
        <View style={styles.dateContainer}>
          <Calendar size={20} color="#000" />
          <Text style={styles.headerTitle}>{workspace.title}</Text>
        </View>
        <Text style={styles.pageIndicator}>
          {currentIndex + 1} / {workspaceDates.length}
        </Text>
      </View>

      <GestureDetector gesture={panGesture}>
        <View style={styles.content}>
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
      </GestureDetector>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
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
    backgroundColor: '#fff',
    borderRadius: 8,
    marginHorizontal: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  areaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  areaTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  areaProgress: {
    fontSize: 12,
    color: '#666',
  },
  progressBar: {
    height: 3,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#000',
  },
  todoList: {
    flex: 1,
    marginBottom: 8,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 4,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxFilled: {
    width: 12,
    height: 12,
    backgroundColor: '#000',
    borderRadius: 2,
  },
  todoText: {
    flex: 1,
    fontSize: 14,
    color: '#000',
  },
  todoTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  deleteButton: {
    padding: 4,
  },
  addTodoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 8,
  },
  addTodoInput: {
    flex: 1,
    fontSize: 14,
    color: '#000',
    paddingVertical: 4,
  },
  addButton: {
    padding: 4,
  },
});
