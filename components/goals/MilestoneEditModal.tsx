// Small modal for creating/editing a single roadmap step.
// Kept as a separate small modal (vs inline editing in the detail view) so the
// user has clear focus + clear save/delete affordances.

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Trash2 } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { GoalMilestone } from '@/types/database';

interface Props {
  visible: boolean;
  goalId: string;
  initialMilestone?: GoalMilestone | null;  // null = create mode
  nextSortOrder?: number;                    // used when creating new
  onClose: () => void;
  onSaved: () => void;
}

function isValidYMD(s: string): boolean {
  if (!s) return true; // empty is allowed (no target date)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
}

export default function MilestoneEditModal({
  visible,
  goalId,
  initialMilestone,
  nextSortOrder,
  onClose,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const isEdit = !!initialMilestone;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (initialMilestone) {
      setTitle(initialMilestone.title);
      setDescription(initialMilestone.description ?? '');
      setTargetDate(initialMilestone.target_date ?? '');
    } else {
      setTitle('');
      setDescription('');
      setTargetDate('');
    }
  }, [visible, initialMilestone]);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert(t('goal.editor.validationError'), t('goal.editor.errorTitleRequired'));
      return;
    }
    if (!isValidYMD(targetDate)) {
      Alert.alert(t('goal.editor.validationError'), t('goal.editor.errorStepDateFormat'));
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      if (isEdit && initialMilestone) {
        const { error } = await supabase
          .from('goal_milestones')
          .update({
            title: trimmedTitle,
            description: description.trim() || null,
            target_date: targetDate || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', initialMilestone.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('goal_milestones').insert({
          user_id: user.id,
          goal_id: goalId,
          title: trimmedTitle,
          description: description.trim() || null,
          target_date: targetDate || null,
          sort_order: nextSortOrder ?? 0,
        });
        if (error) throw error;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert(t('goal.editor.saveError'), e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEdit || !initialMilestone) return;
    Alert.alert(
      t('goal.editor.deleteStepTitle'),
      t('goal.editor.deleteConfirmStep', { title: initialMilestone.title }),
      [
        { text: t('goal.actions.cancel'), style: 'cancel' },
        {
          text: t('goal.actions.delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('goal_milestones')
              .delete()
              .eq('id', initialMilestone.id);
            if (error) { Alert.alert(t('goal.editor.genericError'), error.message); return; }
            onSaved();
            onClose();
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {isEdit ? t('goal.editor.stepEditTitle') : t('goal.editor.stepAddTitle')}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <X size={20} color="#475569" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.body}>
            <View style={styles.field}>
              <Text style={styles.label}>{t('goal.editor.fieldTitle')} <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder={t('goal.editor.placeholderTitleStep')}
                placeholderTextColor="#94A3B8"
                autoFocus={!isEdit}
                maxLength={100}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t('goal.editor.fieldDescription')}</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                value={description}
                onChangeText={setDescription}
                placeholder={t('goal.editor.placeholderDescriptionStep')}
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={300}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t('goal.editor.fieldTargetDate')}</Text>
              <TextInput
                style={styles.input}
                value={targetDate}
                onChangeText={setTargetDate}
                placeholder={t('goal.editor.placeholderDate')}
                placeholderTextColor="#94A3B8"
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
              />
              <Text style={styles.hint}>{t('goal.editor.hintTargetDate')}</Text>
            </View>
          </View>

          <View style={styles.footer}>
            {isEdit && (
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.7}>
                <Trash2 size={16} color="#DC2626" strokeWidth={2.4} />
                <Text style={styles.deleteBtnText}>{t('goal.actions.delete')}</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>{isEdit ? t('goal.actions.update') : t('goal.actions.add')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
  },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  field: { marginBottom: 18 },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  required: { color: '#DC2626' },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 15, color: '#0F172A',
  },
  inputMulti: { minHeight: 60, textAlignVertical: 'top' },
  hint: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  footer: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 11, borderRadius: 11,
    borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2',
  },
  deleteBtnText: { fontSize: 13, color: '#DC2626', fontWeight: '700' },
  saveBtn: {
    paddingHorizontal: 26, paddingVertical: 12, borderRadius: 11,
    backgroundColor: '#0F172A', minWidth: 100, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
