import { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { Todo, GridArea } from '@/types/database';
import { useDragDrop } from './DragDropContext';
import DraggableTodoItem from './DraggableTodoItem';

interface GridAreaDropTargetProps {
  area: GridArea;
  gridTitles: Record<GridArea, string>;
  editingArea: GridArea | null;
  editingAreaName: string;
  setEditingAreaName: (name: string) => void;
  saveAreaName: () => void;
  cancelEditingAreaName: () => void;
  startEditingAreaName: (area: GridArea) => void;
  progress: number;
  areaTodos: Todo[];
  editingTodo: Todo | null;
  editingTodoText: string;
  setEditingTodoText: (text: string) => void;
  saveEditingTodo: () => void;
  cancelEditingTodo: () => void;
  startEditingTodo: (todo: Todo) => void;
  toggleTodo: (todo: Todo) => void;
  deleteTodo: (todoId: string) => void;
  handleDragEnd: (todoId: string, sourceArea: GridArea, targetArea: GridArea, absoluteY: number) => void;
  addingToArea: GridArea | null;
  newTaskText: string;
  setNewTaskText: (text: string) => void;
  saveNewTask: () => void;
  cancelAddingTask: () => void;
  startAddingTask: (area: GridArea) => void;
}

export default function GridAreaDropTarget({
  area,
  gridTitles,
  editingArea,
  editingAreaName,
  setEditingAreaName,
  saveAreaName,
  cancelEditingAreaName,
  startEditingAreaName,
  progress,
  areaTodos,
  editingTodo,
  editingTodoText,
  setEditingTodoText,
  saveEditingTodo,
  cancelEditingTodo,
  startEditingTodo,
  toggleTodo,
  deleteTodo,
  handleDragEnd,
  addingToArea,
  newTaskText,
  setNewTaskText,
  saveNewTask,
  cancelAddingTask,
  startAddingTask,
}: GridAreaDropTargetProps) {
  const { dragState, hoveredArea, registerArea } = useDragDrop();
  const viewRef = useRef<View>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (viewRef.current) {
        viewRef.current.measureInWindow((x, y, width, height) => {
          if (width > 0 && height > 0) {
            registerArea(area, { x, y, width, height });
          }
        });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [area, registerArea]);

  const isDropTarget = dragState !== null && hoveredArea === area && dragState.sourceArea !== area;
  const isDragSource = dragState !== null && dragState.sourceArea === area;

  return (
    <View
      ref={viewRef}
      style={[
        styles.gridArea,
        isDropTarget && styles.gridAreaDropTarget,
      ]}
      onLayout={() => {
        if (viewRef.current) {
          viewRef.current.measureInWindow((x, y, width, height) => {
            if (width > 0 && height > 0) {
              registerArea(area, { x, y, width, height });
            }
          });
        }
      }}
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
            <TouchableOpacity style={styles.saveAreaNameButton} onPress={saveAreaName}>
              <Text style={styles.saveAreaNameButtonText}>OK</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelAreaNameButton} onPress={cancelEditingAreaName}>
              <Text style={styles.cancelAreaNameButtonText}>x</Text>
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

      {isDropTarget && (
        <View style={styles.dropHintBar}>
          <Text style={styles.dropHintText}>ここにドロップ</Text>
        </View>
      )}

      <ScrollView style={styles.todoList} scrollEnabled={dragState === null}>
        {areaTodos.map((todo, index) => (
          <DraggableTodoItem
            key={todo.id}
            todo={todo}
            area={area}
            index={index}
            isEditing={editingTodo?.id === todo.id}
            editingText={editingTodoText}
            onEditTextChange={setEditingTodoText}
            onSaveEdit={saveEditingTodo}
            onCancelEdit={cancelEditingTodo}
            onStartEdit={startEditingTodo}
            onToggle={toggleTodo}
            onDelete={deleteTodo}
            onDragEnd={handleDragEnd}
          />
        ))}

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
              <TouchableOpacity style={styles.postitCancelButton} onPress={cancelAddingTask}>
                <Text style={styles.postitCancelButtonText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.postitSaveButton, !newTaskText.trim() && styles.postitSaveButtonDisabled]}
                onPress={saveNewTask}
                disabled={!newTaskText.trim()}
              >
                <Text style={styles.postitSaveButtonText}>追加</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {areaTodos.length === 0 && addingToArea !== area && (
          <TouchableOpacity style={styles.addTaskArea} onPress={() => startAddingTask(area)}>
            <Text style={styles.addTaskHint}>タップで追加</Text>
          </TouchableOpacity>
        )}

        {areaTodos.length > 0 && addingToArea !== area && (
          <TouchableOpacity style={styles.addTaskAreaSubtle} onPress={() => startAddingTask(area)}>
            <Text style={styles.addTaskHintSubtle}>+</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  gridArea: {
    flex: 1,
    backgroundColor: '#fffacd',
    borderRadius: 2,
    marginHorizontal: 4,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    transform: [{ rotate: '0.5deg' }],
    borderWidth: 0.5,
    borderColor: '#f0e68c',
  },
  gridAreaDropTarget: {
    borderWidth: 2,
    borderColor: '#3498db',
    borderStyle: 'dashed',
    backgroundColor: '#fff9e0',
  },
  areaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  areaTitleContainer: {
    flex: 1,
  },
  areaTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#2c3e50',
    fontStyle: 'italic',
    textDecorationLine: 'underline',
    textDecorationStyle: 'dashed',
    textDecorationColor: '#e74c3c',
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
  dropHintBar: {
    backgroundColor: 'rgba(52, 152, 219, 0.15)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3498db',
    borderStyle: 'dashed',
  },
  dropHintText: {
    fontSize: 11,
    color: '#3498db',
    fontWeight: '600',
  },
  todoList: {
    flex: 1,
    marginBottom: 8,
  },
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
});
