import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Platform, Modal } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Bell, Trash2, Pencil } from 'lucide-react-native';
import { formatReminderDisplay } from './ReminderPicker';
import { Todo, GridArea } from '@/types/database';

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
  onDragStart?: (todo: Todo, area: GridArea, absoluteX: number, absoluteY: number) => void;
  onDragMove?: (absoluteX: number, absoluteY: number) => void;
  onDragDrop?: (todo: Todo, sourceArea: GridArea, absoluteX: number, absoluteY: number) => void;
  isDragging?: boolean;
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
  onDragStart,
  onDragMove,
  onDragDrop,
  isDragging,
}: DraggableTodoItemProps) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const itemRef = useRef<View>(null);
  const hasMoved = useSharedValue(false);
  const startAbsX = useSharedValue(0);
  const startAbsY = useSharedValue(0);

  const showMenu = () => {
    if (itemRef.current) {
      itemRef.current.measureInWindow((x, y, width, height) => {
        setMenuPosition({ x, y: y + height });
        setMenuVisible(true);
      });
    } else {
      setMenuVisible(true);
    }
  };

  const handleDragStart = (absX: number, absY: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onDragStart?.(todo, area, absX, absY);
  };

  const handleDragMove = (absX: number, absY: number) => {
    onDragMove?.(absX, absY);
  };

  const handleDragDrop = (absX: number, absY: number) => {
    onDragDrop?.(todo, area, absX, absY);
  };

  const handleShowMenu = () => {
    showMenu();
  };

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(400)
    .onStart((e) => {
      hasMoved.value = false;
      startAbsX.value = e.absoluteX;
      startAbsY.value = e.absoluteY;
      runOnJS(handleDragStart)(e.absoluteX, e.absoluteY);
    })
    .onUpdate((e) => {
      const dx = Math.abs(e.translationX);
      const dy = Math.abs(e.translationY);
      if (dx > 5 || dy > 5) {
        hasMoved.value = true;
      }
      runOnJS(handleDragMove)(e.absoluteX, e.absoluteY);
    })
    .onEnd((e) => {
      if (hasMoved.value) {
        runOnJS(handleDragDrop)(e.absoluteX, e.absoluteY);
      } else {
        runOnJS(handleShowMenu)();
        // Also need to cancel drag
        runOnJS(handleDragDrop)(startAbsX.value, startAbsY.value);
      }
    })
    .onFinalize(() => {
      hasMoved.value = false;
    });

  if (isEditing) {
    return (
      <View style={[styles.todoItem, styles.todoItemEditingInline]}>
        <View style={styles.todoItemInner}>
          <TouchableOpacity style={styles.checkbox} onPress={() => onToggle(todo)}>
            {todo.is_completed && <View style={styles.checkboxFilled} />}
          </TouchableOpacity>
          <TextInput
            style={[styles.todoText, styles.todoEditInlineInput]}
            value={editingText}
            onChangeText={onEditTextChange}
            multiline
            autoFocus
            maxLength={100}
            onSubmitEditing={onSaveEdit}
          />
        </View>
        <View style={styles.todoEditInlineButtons}>
          <TouchableOpacity style={styles.todoEditInlineSave} onPress={onSaveEdit}>
            <Text style={styles.todoEditInlineSaveText}>保存</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.todoEditInlineCancel} onPress={onCancelEdit}>
            <Text style={styles.todoEditInlineCancelText}>取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.todoItem, isDragging && styles.todoItemDragging]}>
          <View ref={itemRef} style={styles.todoItemInner}>
            <TouchableOpacity style={styles.checkbox} onPress={() => onToggle(todo)}>
              {todo.is_completed && <View style={styles.checkboxFilled} />}
            </TouchableOpacity>

            <View style={styles.todoTextContainer}>
              <Text style={[styles.todoText, todo.is_completed && styles.todoTextCompleted]}>
                {todo.content}
              </Text>
            </View>

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
                onStartEdit(todo);
              }}
            >
              <Pencil size={15} color="#3498db" />
              <Text style={[styles.menuItemText, { color: '#3498db' }]}>タスクを編集</Text>
            </TouchableOpacity>
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
  todoItemDragging: {
    opacity: 0.3,
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
  todoItemEditingInline: {
    borderLeftColor: '#3498db',
    backgroundColor: 'rgba(52, 152, 219, 0.08)',
  },
  todoEditInlineInput: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#3498db',
    paddingVertical: 2,
    minHeight: 20,
  },
  todoEditInlineButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
    marginLeft: 26,
  },
  todoEditInlineSave: {
    backgroundColor: '#27ae60',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  todoEditInlineSaveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  todoEditInlineCancel: {
    backgroundColor: '#95a5a6',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  todoEditInlineCancelText: {
    color: '#fff',
    fontSize: 11,
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
