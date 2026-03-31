import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Bell, ChevronUp, ChevronDown, Trash2 } from 'lucide-react-native';
import { Todo } from '@/types/database';

interface PostitMenuProps {
  visible: boolean;
  todo: Todo | null;
  position: { x: number; y: number };
  todos: Todo[];
  onClose: () => void;
  onReminderPress: (todo: Todo) => void;
  onClearReminder: (todo: Todo) => void;
  onMoveUp: (todo: Todo) => void;
  onMoveDown: (todo: Todo) => void;
  onDelete: (todoId: string) => void;
}

export default function PostitMenu({
  visible,
  todo,
  position,
  todos,
  onClose,
  onReminderPress,
  onClearReminder,
  onMoveUp,
  onMoveDown,
  onDelete,
}: PostitMenuProps) {
  if (!todo) return null;

  const sortedPostits = todos
    .filter(t => t.grid_area === null)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const idx = sortedPostits.findIndex(t => t.id === todo.id);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.menu, { top: position.y, left: position.x }]}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => onReminderPress(todo)}
          >
            <Bell size={15} color="#e67e22" />
            <Text style={styles.menuItemText}>
              {todo.reminder_at ? '\u30EA\u30DE\u30A4\u30F3\u30C0\u30FC\u3092\u5909\u66F4' : '\u30EA\u30DE\u30A4\u30F3\u30C0\u30FC\u3092\u8A2D\u5B9A'}
            </Text>
          </TouchableOpacity>
          {todo.reminder_at && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => onClearReminder(todo)}
            >
              <Bell size={15} color="#999" />
              <Text style={[styles.menuItemText, { color: '#999' }]}>{'\u30EA\u30DE\u30A4\u30F3\u30C0\u30FC\u3092\u524A\u9664'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => { if (idx > 0) onMoveUp(todo); }}
          >
            <ChevronUp size={15} color="#007AFF" />
            <Text style={[styles.menuItemText, { color: '#007AFF' }]}>{'\u4E0A\u306B\u79FB\u52D5'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => { if (idx < sortedPostits.length - 1) onMoveDown(todo); }}
          >
            <ChevronDown size={15} color="#007AFF" />
            <Text style={[styles.menuItemText, { color: '#007AFF' }]}>{'\u4E0B\u306B\u79FB\u52D5'}</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => onDelete(todo.id)}
          >
            <Trash2 size={15} color="#e74c3c" />
            <Text style={[styles.menuItemText, { color: '#e74c3c' }]}>{'\u30BF\u30B9\u30AF\u3092\u524A\u9664'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
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
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 12,
    marginVertical: 2,
  },
});
