import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Platform, Modal } from 'react-native';
import { Bell, Trash2 } from 'lucide-react-native';
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
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const itemRef = useRef<View>(null);

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
      <View style={styles.todoItem}>
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
      </View>

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
