import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Workspace, Todo, GridArea } from '@/types/database';

const GRID_AREAS: GridArea[] = ['top_left', 'top_right', 'bottom_left', 'bottom_right'];

const GRID_AREA_LABELS: Record<GridArea, string> = {
  top_left: '左上',
  top_right: '右上',
  bottom_left: '左下',
  bottom_right: '右下',
};

function WorkspaceScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [gridTitles, setGridTitles] = useState<Record<GridArea, string>>({
    top_left: '左上エリア',
    top_right: '右上エリア',
    bottom_left: '左下エリア',
    bottom_right: '右下エリア',
  });
  const [editingTitle, setEditingTitle] = useState<GridArea | null>(null);
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

      if (workspaceData?.area_titles) {
        setGridTitles({
          top_left: workspaceData.area_titles.top_left || '左上エリア',
          top_right: workspaceData.area_titles.top_right || '右上エリア',
          bottom_left: workspaceData.area_titles.bottom_left || '左下エリア',
          bottom_right: workspaceData.area_titles.bottom_right || '右下エリア',
        });
      }

      const { data: todosData, error: todosError } = await supabase
        .from('todos')
        .select('*')
        .eq('workspace_id', id)
        .order('order', { ascending: true }) as { data: Todo[] | null; error: any };

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
      // Get the maximum order value for this grid area
      const areaTodos = todos.filter((t) => t.grid_area === gridArea);
      const maxOrder = areaTodos.length > 0 
        ? Math.max(...areaTodos.map((t) => t.order))
        : -1;

      if (!user) return;
      const { data, error } = await supabase
        .from('todos')
        .insert({
          workspace_id: id,
          content,
          grid_area: gridArea,
          order: maxOrder + 1,
          is_completed: false,
          due_date: null,
          position_x: null,
          position_y: null,
          completed_at: null,
          user_id: user.id,
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
    return todos.filter((t) => t.grid_area === area).sort((a, b) => a.order - b.order);
  };

  const moveTodo = async (todo: Todo, direction: 'up' | 'down') => {
    if (!todo.grid_area) return;
    try {
      const areaTodos = getTodosForArea(todo.grid_area);
      const currentIndex = areaTodos.findIndex((t) => t.id === todo.id);
      
      if (direction === 'up' && currentIndex === 0) return;
      if (direction === 'down' && currentIndex === areaTodos.length - 1) return;
      
      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      const targetTodo = areaTodos[newIndex];
      
      // Swap orders
      const updates = [
        { id: todo.id, order: targetTodo.order },
        { id: targetTodo.id, order: todo.order },
      ];
      
      // Update local state immediately
      const updatedTodos = todos.map((t) => {
        if (t.id === todo.id) return { ...t, order: targetTodo.order };
        if (t.id === targetTodo.id) return { ...t, order: todo.order };
        return t;
      });
      setTodos(updatedTodos);
      
      // Update database
      const updatePromises = updates.map((update) =>
        supabase
          .from('todos')
          .update({ order: update.order } as any)
          .eq('id', update.id)
      );
      
      const results = await Promise.all(updatePromises);
      const hasError = results.some((result) => result.error);
      
      if (hasError) {
        throw new Error('Failed to update todo order');
      }
    } catch (error) {
      console.error('Error moving todo:', error);
      Alert.alert('エラー', 'タスクの並び替えに失敗しました');
      loadWorkspace();
    }
  };

  const renderTodoItem = (item: Todo, index: number, areaTodos: Todo[]) => {
    const canMoveUp = index > 0;
    const canMoveDown = index < areaTodos.length - 1;
    
    return (
      <View style={styles.todoItem}>
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => toggleTodo(item)}>
          {item.is_completed && <View style={styles.checkboxFilled} />}
        </TouchableOpacity>
        
        <Text
          style={[
            styles.todoText,
            item.is_completed && styles.todoTextCompleted,
          ]}>
          {item.content}
        </Text>
        
        <View style={styles.orderButtons}>
          <TouchableOpacity
            onPress={() => moveTodo(item, 'up')}
            disabled={!canMoveUp}
            style={[styles.orderButton, !canMoveUp && styles.orderButtonDisabled]}>
            <ChevronUp size={16} color={canMoveUp ? '#007AFF' : '#ccc'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => moveTodo(item, 'down')}
            disabled={!canMoveDown}
            style={[styles.orderButton, !canMoveDown && styles.orderButtonDisabled]}>
            <ChevronDown size={16} color={canMoveDown ? '#007AFF' : '#ccc'} />
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity
          onPress={() => deleteTodo(item.id)}
          style={styles.deleteButton}>
          <Trash2 size={16} color="#999" />
        </TouchableOpacity>
      </View>
    );
  };

  const getProgressForArea = (area: GridArea) => {
    const areaTodos = getTodosForArea(area);
    if (areaTodos.length === 0) return 0;
    const completed = areaTodos.filter((t) => t.is_completed).length;
    return Math.round((completed / areaTodos.length) * 100);
  };

  const updateAreaTitle = async (area: GridArea, newTitle: string) => {
    if (!newTitle.trim()) return;

    try {
      const updatedTitles = {
        ...gridTitles,
        [area]: newTitle,
      };

      const { error } = await supabase
        .from('workspaces')
        .update({ area_titles: updatedTitles } as any)
        .eq('id', id);

      if (error) throw error;

      setGridTitles(updatedTitles);
      setEditingTitle(null);
    } catch (error) {
      console.error('Error updating area title:', error);
      Alert.alert('エラー', 'エリア名の更新に失敗しました');
    }
  };

  const renderGridArea = (area: GridArea) => {
    const areaTodos = getTodosForArea(area);
    const progress = getProgressForArea(area);

    return (
      <View style={styles.gridArea} key={area}>
        <View style={styles.areaHeader}>
          {editingTitle === area ? (
            <TextInput
              style={styles.areaTitleInput}
              value={gridTitles[area]}
              onChangeText={(text) =>
                setGridTitles({ ...gridTitles, [area]: text })
              }
              onBlur={() => updateAreaTitle(area, gridTitles[area])}
              onSubmitEditing={() => updateAreaTitle(area, gridTitles[area])}
              autoFocus
              returnKeyType="done"
            />
          ) : (
            <TouchableOpacity onPress={() => setEditingTitle(area)}>
              <Text style={styles.areaTitle}>{gridTitles[area]}</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.areaProgress}>{progress}%</Text>
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        <ScrollView style={styles.todoList} nestedScrollEnabled>
          {areaTodos.map((todo, index) => (
            <View key={todo.id}>
              {renderTodoItem(todo, index, areaTodos)}
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
            returnKeyType="done"
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

export default WorkspaceScreen;

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
  areaTitleInput: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#007AFF',
    paddingVertical: 2,
    minWidth: 100,
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
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
    minHeight: 48,
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
    lineHeight: 20,
  },
  todoTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
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
  deleteButton: {
    padding: 8,
    marginHorizontal: 4,
  },
  addTodoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 8,
    backgroundColor: '#fff',
  },
  addTodoInput: {
    flex: 1,
    fontSize: 14,
    color: '#000',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  addButton: {
    padding: 8,
  },
});
