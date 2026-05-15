// Manual goal create/edit modal. Used for both new goals (per-section + button)
// and edit (tap on existing card). The level is fixed when opened — switching
// levels would require re-deriving period and parent options, so we keep it
// simple and force the user to delete & re-create if they want a different
// level.

import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Trash2, Target, Calendar, CalendarRange, CalendarDays, ChevronDown, Check } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Goal, GoalLevel } from '@/types/database';

interface Props {
  visible: boolean;
  level: GoalLevel;
  initialGoal?: Goal | null;
  onClose: () => void;
  onSaved: () => void;
}

// Visual style per level. Labels come from i18n via t() at render time.
const LEVEL_STYLE: Record<GoalLevel, { icon: any; color: string; bg: string }> = {
  long_term: { icon: Target,        color: '#8B5CF6', bg: '#F3F0FF' },
  yearly:    { icon: Calendar,      color: '#3B82F6', bg: '#EFF6FF' },
  half_year: { icon: CalendarRange, color: '#10B981', bg: '#ECFDF5' },
  monthly:   { icon: CalendarDays,  color: '#F59E0B', bg: '#FFFBEB' },
};

const LEVEL_LABEL_KEY: Record<GoalLevel, string> = {
  long_term: 'goal.level.longTerm',
  yearly:    'goal.level.yearly',
  half_year: 'goal.level.halfYear',
  monthly:   'goal.level.monthly',
};

const LEVEL_SHORT_KEY: Record<GoalLevel, string> = {
  long_term: 'goal.level.longTermShort',
  yearly:    'goal.level.yearlyShort',
  half_year: 'goal.level.halfYearShort',
  monthly:   'goal.level.monthlyShort',
};

// Higher-level levels that can be a parent of a given level
const VALID_PARENT_LEVELS: Record<GoalLevel, GoalLevel[]> = {
  long_term: [],
  yearly: ['long_term'],
  half_year: ['yearly', 'long_term'],
  monthly: ['half_year', 'yearly', 'long_term'],
};

function pad(n: number): string { return n.toString().padStart(2, '0'); }
function fmtDate(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function lastDayOfMonth(year: number, month: number): number {
  // month is 1-12
  return new Date(year, month, 0).getDate();
}

interface PresetChip { id: string; label: string; start: string; end: string; }

function getDefaultPeriod(level: GoalLevel, now: Date = new Date()): { start: string; end: string } {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (level === 'long_term') {
    return { start: `${y}-01-01`, end: `${y + 4}-12-31` };
  }
  if (level === 'yearly') {
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  if (level === 'half_year') {
    if (m <= 6) return { start: `${y}-01-01`, end: `${y}-06-30` };
    return { start: `${y}-07-01`, end: `${y}-12-31` };
  }
  // monthly
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}` };
}

function getPresets(
  level: GoalLevel,
  t: (key: string, params?: Record<string, string | number>) => string,
  now: Date = new Date(),
): PresetChip[] {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (level === 'long_term') {
    return [
      { id: '5y', label: t('goal.period.next5Years'), start: `${y}-01-01`, end: `${y + 4}-12-31` },
      { id: '3y', label: t('goal.period.next3Years'), start: `${y}-01-01`, end: `${y + 2}-12-31` },
    ];
  }
  if (level === 'yearly') {
    return [
      { id: 'this_year', label: t('goal.period.thisYear'), start: `${y}-01-01`, end: `${y}-12-31` },
      { id: 'next_year', label: t('goal.period.nextYear'), start: `${y + 1}-01-01`, end: `${y + 1}-12-31` },
    ];
  }
  if (level === 'half_year') {
    return [
      { id: 'h1', label: `${y} H1`, start: `${y}-01-01`, end: `${y}-06-30` },
      { id: 'h2', label: `${y} H2`, start: `${y}-07-01`, end: `${y}-12-31` },
      { id: 'h1_next', label: `${y + 1} H1`, start: `${y + 1}-01-01`, end: `${y + 1}-06-30` },
    ];
  }
  // monthly — current + next 3
  const presets: PresetChip[] = [];
  for (let i = 0; i < 4; i++) {
    let mm = m + i;
    let yy = y;
    while (mm > 12) { mm -= 12; yy += 1; }
    const last = lastDayOfMonth(yy, mm);
    const label = i === 0
      ? t('goal.period.thisMonth')
      : i === 1
      ? t('goal.period.nextMonth')
      : `${yy}/${mm}`;
    presets.push({
      id: `m_${yy}_${mm}`,
      label,
      start: `${yy}-${pad(mm)}-01`,
      end: `${yy}-${pad(mm)}-${pad(last)}`,
    });
  }
  return presets;
}

function isValidYMD(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
}

export default function GoalEditorModal({ visible, level, initialGoal, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const isEdit = !!initialGoal;
  const lvStyle = LEVEL_STYLE[level];
  const levelLabel = t(LEVEL_LABEL_KEY[level]);
  const Icon = lvStyle.icon;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [parentTitle, setParentTitle] = useState<string | null>(null);
  const [parentPickerVisible, setParentPickerVisible] = useState(false);
  const [parentOptions, setParentOptions] = useState<Goal[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset form when modal opens or initialGoal changes
  useEffect(() => {
    if (!visible) return;
    if (initialGoal) {
      setTitle(initialGoal.title);
      setDescription(initialGoal.description ?? '');
      setPeriodStart(initialGoal.period_start);
      setPeriodEnd(initialGoal.period_end);
      setParentId(initialGoal.parent_id);
    } else {
      const defaults = getDefaultPeriod(level);
      setTitle('');
      setDescription('');
      setPeriodStart(defaults.start);
      setPeriodEnd(defaults.end);
      setParentId(null);
    }
  }, [visible, initialGoal, level]);

  // Load parent options (goals at higher levels) when modal opens
  useEffect(() => {
    if (!visible || !user) return;
    const validParentLevels = VALID_PARENT_LEVELS[level];
    if (validParentLevels.length === 0) {
      setParentOptions([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .in('level', validParentLevels)
        .eq('is_completed', false)
        .order('level', { ascending: true })
        .order('period_start', { ascending: true });
      setParentOptions((data ?? []) as Goal[]);
    })();
  }, [visible, user, level]);

  // Resolve parent title when parentId or options change
  useEffect(() => {
    if (!parentId) { setParentTitle(null); return; }
    const found = parentOptions.find((g) => g.id === parentId);
    setParentTitle(found?.title ?? null);
  }, [parentId, parentOptions]);

  const presets = useMemo(() => getPresets(level, t), [level, t]);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert(t('goal.editor.validationError'), t('goal.editor.errorTitleRequired'));
      return;
    }
    if (!isValidYMD(periodStart) || !isValidYMD(periodEnd)) {
      Alert.alert(t('goal.editor.validationError'), t('goal.editor.errorDateFormat'));
      return;
    }
    if (periodEnd < periodStart) {
      Alert.alert(t('goal.editor.validationError'), t('goal.editor.errorEndBeforeStart'));
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      if (isEdit && initialGoal) {
        const { error } = await supabase
          .from('goals')
          .update({
            title: trimmedTitle,
            description: description.trim() || null,
            period_start: periodStart,
            period_end: periodEnd,
            parent_id: parentId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', initialGoal.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('goals').insert({
          user_id: user.id,
          level,
          title: trimmedTitle,
          description: description.trim() || null,
          period_start: periodStart,
          period_end: periodEnd,
          parent_id: parentId,
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
    if (!isEdit || !initialGoal) return;
    Alert.alert(
      t('goal.editor.deleteGoalTitle'),
      t('goal.editor.deleteConfirmGoal', { title: initialGoal.title }),
      [
        { text: t('goal.actions.cancel'), style: 'cancel' },
        {
          text: t('goal.actions.delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('goals')
              .delete()
              .eq('id', initialGoal.id);
            if (error) {
              Alert.alert(t('goal.editor.genericError'), error.message);
              return;
            }
            onSaved();
            onClose();
          },
        },
      ],
    );
  };

  const applyPreset = (p: PresetChip) => {
    setPeriodStart(p.start);
    setPeriodEnd(p.end);
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
          <View style={styles.headerLeft}>
            <View style={[styles.headerIconBg, { backgroundColor: lvStyle.bg }]}>
              <Icon size={16} color={lvStyle.color} strokeWidth={2.4} />
            </View>
            <Text style={styles.headerTitle}>
              {isEdit
                ? t('goal.editor.editTitle', { level: levelLabel })
                : t('goal.editor.addTitle', { level: levelLabel })}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <X size={20} color="#475569" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={20}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title */}
            <View style={styles.field}>
              <Text style={styles.label}>{t('goal.editor.fieldTitle')} <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder={t('goal.editor.placeholderTitleGoal')}
                placeholderTextColor="#94A3B8"
                autoFocus={!isEdit}
                maxLength={100}
              />
            </View>

            {/* Description */}
            <View style={styles.field}>
              <Text style={styles.label}>{t('goal.editor.fieldDescription')}</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                value={description}
                onChangeText={setDescription}
                placeholder={t('goal.editor.placeholderDescriptionGoal')}
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={500}
              />
            </View>

            {/* Presets */}
            <View style={styles.field}>
              <Text style={styles.label}>{t('goal.editor.fieldPeriodPreset')}</Text>
              <View style={styles.chipRow}>
                {presets.map((p) => {
                  const active = p.start === periodStart && p.end === periodEnd;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => applyPreset(p)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Period dates */}
            <View style={styles.field}>
              <Text style={styles.label}>{t('goal.editor.fieldPeriod')}</Text>
              <View style={styles.dateRow}>
                <View style={styles.dateInputWrap}>
                  <Text style={styles.dateInputLabel}>{t('goal.editor.fieldStart')}</Text>
                  <TextInput
                    style={styles.dateInput}
                    value={periodStart}
                    onChangeText={setPeriodStart}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                    keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                  />
                </View>
                <Text style={styles.dateSeparator}>–</Text>
                <View style={styles.dateInputWrap}>
                  <Text style={styles.dateInputLabel}>{t('goal.editor.fieldEnd')}</Text>
                  <TextInput
                    style={styles.dateInput}
                    value={periodEnd}
                    onChangeText={setPeriodEnd}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                    keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                  />
                </View>
              </View>
            </View>

            {/* Parent goal picker */}
            {parentOptions.length > 0 && (
              <View style={styles.field}>
                <Text style={styles.label}>{t('goal.editor.fieldParent')}</Text>
                <TouchableOpacity
                  style={styles.parentPickerBtn}
                  onPress={() => setParentPickerVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.parentPickerText, !parentId && styles.parentPickerPlaceholder]} numberOfLines={1}>
                    {parentTitle ?? t('goal.editor.parentNone')}
                  </Text>
                  <ChevronDown size={16} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Action footer */}
          <View style={styles.footer}>
            {isEdit && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDelete}
                activeOpacity={0.7}
              >
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
                <Text style={styles.saveBtnText}>{isEdit ? t('goal.actions.update') : t('goal.actions.save')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        {/* Parent picker sub-modal */}
        <Modal
          visible={parentPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setParentPickerVisible(false)}
        >
          <TouchableOpacity
            style={styles.pickerBackdrop}
            activeOpacity={1}
            onPress={() => setParentPickerVisible(false)}
          >
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>{t('goal.editor.parentPickerTitle')}</Text>
                <TouchableOpacity onPress={() => setParentPickerVisible(false)} style={styles.pickerClose}>
                  <X size={18} color="#475569" />
                </TouchableOpacity>
              </View>
              <ScrollView>
                <TouchableOpacity
                  style={[styles.pickerRow, !parentId && styles.pickerRowActive]}
                  onPress={() => {
                    setParentId(null);
                    setParentPickerVisible(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pickerRowText}>{t('goal.editor.parentNone')}</Text>
                  {!parentId && <Check size={16} color="#6366F1" strokeWidth={2.6} />}
                </TouchableOpacity>
                {parentOptions.map((g) => {
                  const isActive = parentId === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.pickerRow, isActive && styles.pickerRowActive]}
                      onPress={() => {
                        setParentId(g.id);
                        setParentPickerVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerRowText} numberOfLines={1}>{g.title}</Text>
                        <Text style={styles.pickerRowMeta}>
                          {t(LEVEL_SHORT_KEY[g.level])} · {g.period_start} – {g.period_end}
                        </Text>
                      </View>
                      {isActive && <Check size={16} color="#6366F1" strokeWidth={2.6} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconBg: {
    width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
  },

  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },

  field: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  required: { color: '#DC2626' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  inputMulti: { minHeight: 70, textAlignVertical: 'top' },

  // Presets
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  chipText: { fontSize: 12.5, color: '#475569', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  // Date inputs
  dateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  dateInputWrap: { flex: 1 },
  dateInputLabel: { fontSize: 11, color: '#94A3B8', marginBottom: 4, fontWeight: '600' },
  dateInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  dateSeparator: { fontSize: 16, color: '#94A3B8', paddingBottom: 11, paddingHorizontal: 2 },

  // Parent picker
  parentPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  parentPickerText: { flex: 1, fontSize: 14, color: '#0F172A', marginRight: 10 },
  parentPickerPlaceholder: { color: '#94A3B8' },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#fff',
    gap: 8,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  deleteBtnText: { fontSize: 13, color: '#DC2626', fontWeight: '700' },
  saveBtn: {
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 11,
    backgroundColor: '#0F172A',
    minWidth: 100,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Parent picker sub-modal
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 28,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  pickerTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  pickerClose: {
    width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  pickerRowActive: { backgroundColor: '#F5F7FF' },
  pickerRowText: { fontSize: 14, color: '#0F172A', fontWeight: '600' },
  pickerRowMeta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
});
