import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { X, Trash2, Clock, History, ListChecks } from 'lucide-react-native';
import { Schedule } from '@/types/database';
import { SCHEDULE_COLORS, minutesToTimeString } from '@/lib/scheduleUtils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import WheelPicker from '@/components/WheelPicker';

interface Props {
  visible: boolean;
  schedule: Partial<Schedule> | null;
  currentDate: string;
  onSave: (data: {
    title: string;
    description: string | null;
    start_minutes: number;
    end_minutes: number;
    color: string;
    source_todo_id?: string | null;
  }) => void;
  onDelete?: () => void;
  onClose: () => void;
  isNew: boolean;
}

interface WorkspaceTask {
  id: string;
  content: string;
  is_completed: boolean;
}

interface SuggestionItem {
  title: string;
  avgDuration: number;
  count: number;
  color: string;
}

const HOURS = Array.from({ length: 25 }, (_, i) => ({ label: `${i}`, value: i }));
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => ({
  label: m.toString().padStart(2, '0'),
  value: m,
}));

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}\u6642\u9593${m}\u5206`;
  if (h > 0) return `${h}\u6642\u9593`;
  return `${m}\u5206`;
}

export default function ScheduleItemEditor({ visible, schedule, currentDate, onSave, onDelete, onClose, isNew }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startHour, setStartHour] = useState(0);
  const [startMin, setStartMin] = useState(0);
  const [endHour, setEndHour] = useState(1);
  const [endMin, setEndMin] = useState(0);
  const [color, setColor] = useState(SCHEDULE_COLORS[0]);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [historyItems, setHistoryItems] = useState<SuggestionItem[]>([]);
  const [workspaceTasks, setWorkspaceTasks] = useState<WorkspaceTask[]>([]);
  const [linkedTaskId, setLinkedTaskId] = useState<string | null>(null);
  const historyCache = useRef<SuggestionItem[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (schedule) {
      setTitle(schedule.title || '');
      setDescription(schedule.description || '');
      const sm = schedule.start_minutes || 0;
      const em = schedule.end_minutes || 60;
      setStartHour(Math.floor(sm / 60));
      setStartMin(sm % 60);
      setEndHour(Math.floor(em / 60));
      setEndMin(em % 60);
      setColor(schedule.color || SCHEDULE_COLORS[0]);
      setSuggestions([]);
      setShowSuggestions(false);
      setLinkedTaskId(schedule.source_todo_id ?? null);
    }
  }, [schedule]);

  useEffect(() => {
    if (visible && user) {
      loadHistory();
    } else {
      historyCache.current = [];
      setHistoryItems([]);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [visible, user]);

  useEffect(() => {
    if (visible && user && currentDate) {
      loadWorkspaceTasks();
    } else {
      setWorkspaceTasks([]);
    }
  }, [visible, user, currentDate]);

  const loadWorkspaceTasks = async () => {
    if (!user || !currentDate) return;
    try {
      const { data, error } = await supabase
        .from('todos')
        .select('id, content, is_completed, workspaces!inner(date)')
        .eq('user_id', user.id)
        .eq('workspaces.date', currentDate)
        .order('created_at', { ascending: true }) as {
          data: WorkspaceTask[] | null;
          error: any;
        };
      if (error || !data) return;
      setWorkspaceTasks(data.filter(t => t.content && t.content.trim().length > 0));
    } catch (e) {
      console.error('Error loading workspace tasks:', e);
    }
  };

  const applyWorkspaceTask = (task: WorkspaceTask) => {
    setTitle(task.content);
    setLinkedTaskId(task.id);
  };

  const loadHistory = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('schedules')
        .select('title, start_minutes, end_minutes, color')
        .eq('user_id', user.id)
        .eq('is_from_todo', false)
        .order('created_at', { ascending: false })
        .limit(500) as { data: Pick<Schedule, 'title' | 'start_minutes' | 'end_minutes' | 'color'>[] | null; error: any };

      if (error || !data) return;

      const grouped = new Map<string, { durations: number[]; count: number; color: string }>();
      for (const item of data) {
        if (!item.title || item.title === '(\u7121\u984C)') continue;
        const key = item.title.trim().toLowerCase();
        const duration = item.end_minutes - item.start_minutes;
        if (!grouped.has(key)) {
          grouped.set(key, { durations: [duration], count: 1, color: item.color });
        } else {
          const g = grouped.get(key)!;
          g.durations.push(duration);
          g.count++;
        }
      }

      const result: SuggestionItem[] = [];
      const seenTitles = new Map<string, boolean>();
      for (const item of data) {
        if (!item.title || item.title === '(\u7121\u984C)') continue;
        const key = item.title.trim().toLowerCase();
        if (seenTitles.has(key)) continue;
        seenTitles.set(key, true);
        const g = grouped.get(key)!;
        const avgDuration = Math.round(g.durations.reduce((a, b) => a + b, 0) / g.durations.length / 5) * 5;
        result.push({
          title: item.title.trim(),
          avgDuration: Math.max(avgDuration, 5),
          count: g.count,
          color: g.color,
        });
      }

      historyCache.current = result;
      setHistoryItems(result.slice(0, 12));
    } catch (e) {
      console.error('Error loading schedule history:', e);
    }
  };

  const filterSuggestions = useCallback((query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const q = query.trim().toLowerCase();
    const filtered = historyCache.current.filter(item =>
      item.title.toLowerCase().includes(q)
    ).slice(0, 6);
    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  }, []);

  const handleTitleChange = (text: string) => {
    setTitle(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => filterSuggestions(text), 150);
  };

  const applySuggestion = (item: SuggestionItem) => {
    setTitle(item.title);
    setColor(item.color);
    const currentStart = startHour * 60 + startMin;
    const newEnd = Math.min(currentStart + item.avgDuration, 1440);
    setEndHour(Math.floor(newEnd / 60));
    setEndMin(newEnd % 60);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const applyHistoryItem = (item: SuggestionItem) => {
    setTitle(item.title);
    setColor(item.color);
    setLinkedTaskId(null);
  };

  const startTotal = startHour * 60 + startMin;
  const endTotal = endHour * 60 + endMin;
  const duration = endTotal > startTotal ? endTotal - startTotal : 0;
  const durationLabel = useMemo(() => {
    if (duration <= 0) return '---';
    const h = Math.floor(duration / 60);
    const m = duration % 60;
    if (h > 0 && m > 0) return `${h}\u6642\u9593${m}\u5206`;
    if (h > 0) return `${h}\u6642\u9593`;
    return `${m}\u5206`;
  }, [duration]);

  const handleSave = () => {
    let start = startHour * 60 + startMin;
    let end = endHour * 60 + endMin;
    if (end <= start) end = start + 30;
    if (end > 1440) end = 1440;
    const trimmedDescription = description.trim();
    onSave({
      title: title || '(\u7121\u984C)',
      description: trimmedDescription.length > 0 ? trimmedDescription : null,
      start_minutes: start,
      end_minutes: end,
      color,
      source_todo_id: linkedTaskId,
    });
  };

  const hasError = endTotal <= startTotal;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.container}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.headerTitle}>{isNew ? '\u4E88\u5B9A\u3092\u8FFD\u52A0' : '\u4E88\u5B9A\u3092\u7DE8\u96C6'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#999" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.titleWrapper}>
              <TextInput
                style={styles.titleInput}
                value={title}
                onChangeText={handleTitleChange}
                placeholder={'\u30BF\u30A4\u30C8\u30EB\u3092\u5165\u529B'}
                placeholderTextColor="#c0c0c0"
                maxLength={50}
                autoFocus={false}
                onFocus={() => {
                  setTitleFocused(true);
                  if (title.trim()) filterSuggestions(title);
                }}
                onBlur={() => {
                  setTitleFocused(false);
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
              />
              {showSuggestions && titleFocused && (
                <View style={styles.suggestionsContainer}>
                  {suggestions.map((item, idx) => (
                    <TouchableOpacity
                      key={`${item.title}-${idx}`}
                      style={styles.suggestionItem}
                      onPress={() => applySuggestion(item)}
                    >
                      <View style={[styles.suggestionColorDot, { backgroundColor: item.color }]} />
                      <View style={styles.suggestionContent}>
                        <Text style={styles.suggestionTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.suggestionMeta}>
                          {formatDuration(item.avgDuration)}
                          {item.count > 1 ? ` \u00B7 ${item.count}\u56DE\u4F7F\u7528` : ''}
                        </Text>
                      </View>
                      <History size={14} color="#ccc" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <TextInput
              style={styles.descriptionInput}
              value={description}
              onChangeText={setDescription}
              placeholder={t('scheduleEditor.descriptionPlaceholder')}
              placeholderTextColor="#c0c0c0"
              multiline
              textAlignVertical="top"
              maxLength={500}
            />

            <View style={styles.timeSection}>
              <View style={styles.timeBlock}>
                <Text style={styles.timeBlockLabel}>{'\u958B\u59CB'}</Text>
                <View style={styles.wheelRow}>
                  <WheelPicker items={HOURS} selectedValue={startHour} onValueChange={setStartHour} width={64} />
                  <Text style={styles.colonText}>:</Text>
                  <WheelPicker items={MINUTES} selectedValue={startMin} onValueChange={setStartMin} width={64} />
                </View>
              </View>

              <View style={styles.timeDivider}>
                <View style={styles.timeDividerLine} />
                <View style={styles.durationBadge}>
                  <Clock size={12} color="#888" />
                  <Text style={[styles.durationText, hasError && styles.durationTextError]}>
                    {hasError ? '\u7121\u52B9' : durationLabel}
                  </Text>
                </View>
                <View style={styles.timeDividerLine} />
              </View>

              <View style={styles.timeBlock}>
                <Text style={styles.timeBlockLabel}>{'\u7D42\u4E86'}</Text>
                <View style={styles.wheelRow}>
                  <WheelPicker items={HOURS} selectedValue={endHour} onValueChange={setEndHour} width={64} />
                  <Text style={styles.colonText}>:</Text>
                  <WheelPicker items={MINUTES} selectedValue={endMin} onValueChange={setEndMin} width={64} />
                </View>
              </View>
            </View>

            <Text style={styles.sectionLabel}>{'\u30AB\u30E9\u30FC'}</Text>
            <View style={styles.colorRow}>
              {SCHEDULE_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    color === c && styles.colorDotActive,
                    color === c && { borderColor: c },
                  ]}
                  onPress={() => setColor(c)}
                >
                  {color === c && <View style={styles.colorCheck} />}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.previewCard}>
              <View style={[styles.previewBar, { backgroundColor: color }]} />
              <View style={styles.previewContent}>
                <Text style={styles.previewTitle} numberOfLines={1}>
                  {title || '(\u7121\u984C)'}
                </Text>
                <Text style={styles.previewTime}>
                  {minutesToTimeString(startTotal)} - {minutesToTimeString(endTotal)}
                </Text>
              </View>
            </View>

            {historyItems.length > 0 && (
              <View style={styles.historySection}>
                <View style={styles.historyHeader}>
                  <History size={14} color="#888" />
                  <Text style={styles.historyTitle}>{t('scheduleEditor.addFromHistory')}</Text>
                </View>
                <Text style={styles.historyHint}>{t('scheduleEditor.addFromHistoryHint')}</Text>
                <View style={styles.historyChipsWrap}>
                  {historyItems.map((item, idx) => (
                    <TouchableOpacity
                      key={`${item.title}-${idx}`}
                      style={styles.historyChip}
                      onPress={() => applyHistoryItem(item)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.historyChipDot, { backgroundColor: item.color }]} />
                      <Text style={styles.historyChipText} numberOfLines={1}>
                        {item.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {workspaceTasks.length > 0 && (
              <View style={styles.historySection}>
                <View style={styles.historyHeader}>
                  <ListChecks size={14} color="#888" />
                  <Text style={styles.historyTitle}>{t('scheduleEditor.addFromTasks')}</Text>
                </View>
                <Text style={styles.historyHint}>{t('scheduleEditor.addFromTasksHint')}</Text>
                <View style={styles.historyChipsWrap}>
                  {workspaceTasks.map(task => (
                    <TouchableOpacity
                      key={task.id}
                      style={[styles.taskChip, task.is_completed && styles.taskChipCompleted]}
                      onPress={() => applyWorkspaceTask(task)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.taskChipText,
                          task.is_completed && styles.taskChipTextCompleted,
                        ]}
                        numberOfLines={1}
                      >
                        {task.content}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {!isNew && onDelete && (
              <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
                <Trash2 size={18} color="#ff3b30" />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>{'\u30AD\u30E3\u30F3\u30BB\u30EB'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, hasError && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={hasError}
            >
              <Text style={styles.saveBtnText}>{isNew ? '\u8FFD\u52A0' : '\u4FDD\u5B58'}</Text>
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
  container: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 20 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginTop: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
  closeBtn: { padding: 6, backgroundColor: '#f5f5f5', borderRadius: 16 },
  body: { paddingHorizontal: 24, paddingBottom: 8 },
  titleWrapper: { position: 'relative', zIndex: 100 },
  titleInput: { fontSize: 18, color: '#111', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#f8f8f8', borderRadius: 14, borderWidth: 1, borderColor: '#eee', fontWeight: '500' },
  descriptionInput: { fontSize: 14, color: '#111', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#f8f8f8', borderRadius: 14, borderWidth: 1, borderColor: '#eee', minHeight: 64, maxHeight: 120, lineHeight: 20, marginTop: 10 },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  suggestionColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  suggestionMeta: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  timeSection: { marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  timeBlock: { alignItems: 'center', flex: 1 },
  timeBlockLabel: { fontSize: 13, fontWeight: '600', color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  wheelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  colonText: { fontSize: 24, fontWeight: '700', color: '#333', marginHorizontal: 2 },
  timeDivider: { alignItems: 'center', paddingHorizontal: 8, paddingTop: 24 },
  timeDividerLine: { width: 1, height: 24, backgroundColor: '#e0e0e0' },
  durationBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f5f5f5', borderRadius: 12, marginVertical: 6 },
  durationText: { fontSize: 11, fontWeight: '600', color: '#888' },
  durationTextError: { color: '#ff3b30' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#888', marginTop: 28, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  colorDotActive: { borderWidth: 3, borderColor: '#000' },
  colorCheck: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' },
  historySection: {
    marginTop: 24,
    marginBottom: 12,
    backgroundColor: '#fafafa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  historyHint: {
    fontSize: 11,
    color: '#888',
    marginBottom: 10,
  },
  historyChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  historyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    maxWidth: '100%',
  },
  historyChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  historyChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
    maxWidth: 160,
  },
  taskChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dcecff',
    maxWidth: '100%',
  },
  taskChipCompleted: {
    backgroundColor: '#f3f3f3',
    borderColor: '#e5e5e5',
  },
  taskChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1f4a8a',
    maxWidth: 200,
  },
  taskChipTextCompleted: {
    color: '#999',
    textDecorationLine: 'line-through',
  },
  previewCard: { flexDirection: 'row', marginTop: 24, marginBottom: 8, backgroundColor: '#f9f9f9', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#eee' },
  previewBar: { width: 4 },
  previewContent: { flex: 1, paddingVertical: 14, paddingHorizontal: 14 },
  previewTitle: { fontSize: 15, fontWeight: '600', color: '#222' },
  previewTime: { fontSize: 13, color: '#888', marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  deleteBtn: { padding: 10, backgroundColor: '#fff0f0', borderRadius: 12 },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginRight: 8 },
  cancelBtnText: { fontSize: 15, color: '#888', fontWeight: '500' },
  saveBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, backgroundColor: '#222' },
  saveBtnDisabled: { backgroundColor: '#ccc' },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '600' },
});
