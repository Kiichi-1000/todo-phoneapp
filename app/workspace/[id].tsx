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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { Workspace, Todo, GridArea } from '@/types/database';

const GRID_AREAS: GridArea[] = ['top_left', 'top_right', 'bottom_left', 'bottom_right'];

const GRID_AREA_LABELS: Record<GridArea, string> = {
  top_left: '左上',
  top_right: '右上',
  bottom_left: '左下',
  bottom_right: '右下',
};

export default function WorkspaceScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
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

  useEffect(() => {
    loadWorkspace();
  }, [id]);

  const loadWorkspace = async () => {
    try {
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', id)
        .single() as { data: Workspace | null; error: any };

      if (workspaceError) throw workspaceError;
      setWorkspace(workspaceData);

      const { data: todosData, error: todosError } = await supabase
        .from('todos')
        .select('*')
        .eq('workspace_id', id)
        .order('created_at', { ascending: true }) as { data: Todo[] | null; error: any };

      if (todosError) throw todosError;
      setTodos(todosData || []);
    } catch (error) {
      console.error('Error loading workspace:', error);
      Alert.alert('エラー', 'ワークスペースの読み込みに失敗しました');
    }
  };

  const addTodo = async (gridArea: GridArea) => {
    const content = newTodoContent[gridArea].trim();
    if (!content) return;

    try {
      const { data, error } = await supabase
        .from('todos')
        .insert({
          workspace_id: id,
          content,
          grid_area: gridArea,
        } as any)
        .select()
        .single() as { data: Todo | null; error: any };

      if (error) throw error;
      if (!data) throw new Error('No data returned');

      setTodos([...todos, data]);
      setNewTodoContent({ ...newTodoContent, [gridArea]: '' });
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

      setTodos(todos.filter((t) => t.id !== todoId));
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
        <Text>読み込み中...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{workspace.title}</Text>
        <View style={styles.placeholder} />
      </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
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
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  placeholder: {
    width: 32,
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
