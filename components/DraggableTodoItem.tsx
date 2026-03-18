import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Platform, Modal } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Bell, Trash2 } from 'lucide-react-native';
import { formatReminderDisplay } from './ReminderPicker';
import { Todo, GridArea } from '@/types/database';
import { useDragDrop } from './DragDropContext';

interface DraggableTodoItemProps {
  todo: Todo;
  area: GridArea;
  index: number;
  isEditing: boolean;
  editingText: string;
  onEditTextChange: (text: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (todo: Todo) => void;
  onToggle: (todo: Todo) => void;
  onDelete: (todoId: string) => void;
  onDragEnd: (todoId: string, sourceArea: GridArea, targetArea: GridArea, absoluteY: number) => void;
  onReminderPress: (todo: Todo) => void;
  onClearReminder: (todo: Todo) => void;
}

export default function DraggableTodoItem({
  todo,
  area,
  index,
  isEditing,
  editingText,
  onEditTextChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onToggle,
  onDelete,
  onDragEnd,
  onReminderPress,
  onClearReminder,
}: DraggableTodoItemProps) {
  const { startDrag, endDrag, updateHoveredArea, getHoveredArea } = useDragDrop();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(0);
  const opacity = useSharedValue(1);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const itemRef = useRef<View>(null);

  const startDragJS = (todoId: string, sourceArea: GridArea, idx: number) => {
    startDrag(todoId, sourceArea, idx);
  };

  const updateHoverJS = (absX: number, absY: number) => {
    updateHoveredArea(absX, absY);
  };

  const endDragJS = (absX: number, absY: number) => {
    const targetArea = getHoveredArea(absX, absY);
    endDrag();
    if (targetArea) {
      onDragEnd(todo.id, area, targetArea, absY);
    }
  };

  const showMenu = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (itemRef.current) {
      itemRef.current.measureInWindow((x, y, width, height) => {
        setMenuPosition({ x, y: y + height });
        setMenuVisible(true);
      });
    } else {
      setMenuVisible(true);
    }
  };

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.05);
      zIndex.value = 1000;
      opacity.value = 0.9;
      runOnJS(startDragJS)(todo.id, area, index);
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      runOnJS(updateHoverJS)(event.absoluteX, event.absoluteY);
    })
    .onEnd((event) => {
      const absX = event.absoluteX;
      const absY = event.absoluteY;
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      scale.value = withSpring(1);
      isDragging.value = false;
      zIndex.value = 0;
      opacity.value = withTiming(1);
      runOnJS(endDragJS)(absX, absY);
    })
    .onFinalize(() => {
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      scale.value = withSpring(1);
      isDragging.value = false;
      zIndex.value = 0;
      opacity.value = withTiming(1);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIndex.value,
    opacity: opacity.value,
  }));

  const dragIndicatorStyle = useAnimatedStyle(() => ({
    opacity: isDragging.value ? 1 : 0,
    height: isDragging.value ? 3 : 0,
  }));

  if (isEditing) {
    return (
      <View style={styles.todoItemEditing}>
        <TextInput
          style={styles.todoEditInput}
          value={editingText}
          onChangeText={onEditTextChange}
          multiline
          autoFocus
          maxLength={100}
        />
        <View style={styles.todoEditButtons}>
          <TouchableOpacity style={styles.todoEditSaveButton} onPress={onSaveEdit}>
            <Text style={styles.todoEditSaveText}>OK</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.todoEditCancelButton} onPress={onCancelEdit}>
            <Text style={styles.todoEditCancelText}>x</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.todoItem, animatedStyle]}>
          <View ref={itemRef} style={styles.todoItemInner}>
            <TouchableOpacity style={styles.checkbox} onPress={() => onToggle(todo)}>
              {todo.is_completed && <View style={styles.checkboxFilled} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.todoTextContainer}
              onPress={() => onStartEdit(todo)}
              onLongPress={showMenu}
              delayLongPress={400}
            >
              <Text style={[styles.todoText, todo.is_completed && styles.todoTextCompleted]}>
                {todo.content}
              </Text>
            </TouchableOpacity>

            {todo.reminder_at && (
              <Bell size={10} color="#e67e22" style={styles.reminderDot} />
            )}
          </View>

          {todo.reminder_at && (
            <View style={styles.reminderBadge}>
              <Bell size={9} color="#e67e22" />
              <Text style={styles.reminderBadgeText}>
                {formatReminderDisplay(todo.reminder_at)}
              </Text>
            </View>
          )}

          <Animated.View style={[styles.dragIndicator, dragIndicatorStyle]} />
        </Animated.View>
      </GestureDetector>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={[styles.menu, { top: menuPosition.y, left: menuPosition.x }]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                onReminderPress(todo);
              }}
            >
              <Bell size={15} color="#e67e22" />
              <Text style={styles.menuItemText}>
                {todo.reminder_at ? 'リマインダーを変更' : 'リマインダーを設定'}
              </Text>
            </TouchableOpacity>
            {todo.reminder_at && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  onClearReminder(todo);
                }}
              >
                <Bell size={15} color="#999" />
                <Text style={[styles.menuItemText, { color: '#999' }]}>リマインダーを削除</Text>
              </TouchableOpacity>
            )}
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                onDelete(todo.id);
              }}
            >
              <Trash2 size={15} color="#e74c3c" />
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>タスクを削除</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  todoItem: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#ff6b6b',
  },
  todoItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
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
  todoTextContainer: {
    flex: 1,
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
  reminderDot: {
    marginLeft: 4,
  },
  reminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 26,
    marginTop: 2,
  },
  reminderBadgeText: {
    fontSize: 10,
    color: '#e67e22',
  },
  dragIndicator: {
    backgroundColor: '#3498db',
    borderRadius: 2,
    marginTop: 2,
    alignSelf: 'center',
    width: '60%',
  },
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
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  menu: {
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
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 14,
    color: '#2c3e50',
    fontWeight: '500',
  },
  menuItemDanger: {
    color: '#e74c3c',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 12,
    marginVertical: 2,
  },
});
