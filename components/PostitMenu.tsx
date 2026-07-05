import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { CalendarClock, ChevronUp, ChevronDown, Trash2, FileText } from 'lucide-react-native';
import { Todo } from '@/types/database';
import { useLanguage } from '@/contexts/LanguageContext';

interface PostitMenuProps {
  visible: boolean;
  todo: Todo | null;
  position: { x: number; y: number };
  todos: Todo[];
  onClose: () => void;
  onShowDetail: (todo: Todo) => void;
  onSchedulePress: (todo: Todo) => void;
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
  onShowDetail,
  onSchedulePress,
  onMoveUp,
  onMoveDown,
  onDelete,
}: PostitMenuProps) {
  const { t } = useLanguage();
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
            onPress={() => { onClose(); onShowDetail(todo); }}
          >
            <FileText size={15} color="#16a085" />
            <Text style={[styles.menuItemText, { color: '#16a085' }]}>{t('workspace.showTaskDetail')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => { onClose(); onSchedulePress(todo); }}
          >
            <CalendarClock size={15} color="#3b82f6" />
            <Text style={[styles.menuItemText, { color: '#3b82f6' }]}>
              {todo.schedule_start_minutes != null ? t('workspace.scheduleChange') : t('workspace.scheduleSet')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => { if (idx > 0) onMoveUp(todo); }}
          >
            <ChevronUp size={15} color="#007AFF" />
            <Text style={[styles.menuItemText, { color: '#007AFF' }]}>{t('workspace.moveUp')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => { if (idx < sortedPostits.length - 1) onMoveDown(todo); }}
          >
            <ChevronDown size={15} color="#007AFF" />
            <Text style={[styles.menuItemText, { color: '#007AFF' }]}>{t('workspace.moveDown')}</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => { onClose(); onDelete(todo.id); }}
          >
            <Trash2 size={15} color="#e74c3c" />
            <Text style={[styles.menuItemText, { color: '#e74c3c' }]}>{t('workspace.deleteTask')}</Text>
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
