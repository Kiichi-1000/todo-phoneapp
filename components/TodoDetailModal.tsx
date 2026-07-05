import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, FileText } from 'lucide-react-native';
import { Todo } from '@/types/database';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  visible: boolean;
  todo: Todo | null;
  onSave: (todo: Todo, description: string | null) => void;
  onClose: () => void;
}

export default function TodoDetailModal({ visible, todo, onSave, onClose }: Props) {
  const { t } = useLanguage();
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (visible && todo) {
      setDescription(todo.description ?? '');
    }
  }, [visible, todo]);

  if (!todo) return null;

  const handleSave = () => {
    const trimmed = description.trim();
    onSave(todo, trimmed.length > 0 ? trimmed : null);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.container}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <FileText size={18} color="#3498db" />
              <Text style={styles.headerTitle}>{t('workspace.taskDetailTitle')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#999" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>{t('workspace.taskDetailTaskLabel')}</Text>
            <View style={styles.contentCard}>
              <Text style={styles.contentText}>{todo.content}</Text>
            </View>

            <Text style={styles.sectionLabel}>{t('workspace.taskDetailDescriptionLabel')}</Text>
            <TextInput
              style={styles.descriptionInput}
              value={description}
              onChangeText={setDescription}
              placeholder={t('workspace.taskDetailPlaceholder')}
              placeholderTextColor="#c0c0c0"
              multiline
              textAlignVertical="top"
              maxLength={2000}
            />
          </ScrollView>

          <View style={styles.footer}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginTop: 10 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
  closeBtn: { padding: 6, backgroundColor: '#f5f5f5', borderRadius: 16 },
  body: { paddingHorizontal: 24, paddingBottom: 8 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  contentCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  contentText: { fontSize: 16, color: '#111', fontWeight: '500', lineHeight: 22 },
  descriptionInput: {
    fontSize: 15,
    color: '#111',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
    minHeight: 120,
    maxHeight: 260,
    lineHeight: 21,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginRight: 8 },
  cancelBtnText: { fontSize: 15, color: '#888', fontWeight: '500' },
  saveBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, backgroundColor: '#222' },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '600' },
});
