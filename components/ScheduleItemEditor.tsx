import { useState, useEffect, useMemo } from 'react';
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
import { X, Trash2, Clock } from 'lucide-react-native';
import { Schedule } from '@/types/database';
import { SCHEDULE_COLORS, minutesToTimeString } from '@/lib/scheduleUtils';
import WheelPicker from '@/components/WheelPicker';

interface Props {
  visible: boolean;
  schedule: Partial<Schedule> | null;
  onSave: (data: { title: string; start_minutes: number; end_minutes: number; color: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
  isNew: boolean;
}

const HOURS = Array.from({ length: 25 }, (_, i) => ({ label: `${i}`, value: i }));
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => ({
  label: m.toString().padStart(2, '0'),
  value: m,
}));

export default function ScheduleItemEditor({ visible, schedule, onSave, onDelete, onClose, isNew }: Props) {
  const [title, setTitle] = useState('');
  const [startHour, setStartHour] = useState(0);
  const [startMin, setStartMin] = useState(0);
  const [endHour, setEndHour] = useState(1);
  const [endMin, setEndMin] = useState(0);
  const [color, setColor] = useState(SCHEDULE_COLORS[0]);

  useEffect(() => {
    if (schedule) {
      setTitle(schedule.title || '');
      const sm = schedule.start_minutes || 0;
      const em = schedule.end_minutes || 60;
      setStartHour(Math.floor(sm / 60));
      setStartMin(sm % 60);
      setEndHour(Math.floor(em / 60));
      setEndMin(em % 60);
      setColor(schedule.color || SCHEDULE_COLORS[0]);
    }
  }, [schedule]);

  const startTotal = startHour * 60 + startMin;
  const endTotal = endHour * 60 + endMin;
  const duration = endTotal > startTotal ? endTotal - startTotal : 0;
  const durationLabel = useMemo(() => {
    if (duration <= 0) return '---';
    const h = Math.floor(duration / 60);
    const m = duration % 60;
    if (h > 0 && m > 0) return `${h}時間${m}分`;
    if (h > 0) return `${h}時間`;
    return `${m}分`;
  }, [duration]);

  const handleSave = () => {
    let start = startHour * 60 + startMin;
    let end = endHour * 60 + endMin;
    if (end <= start) end = start + 30;
    if (end > 1440) end = 1440;
    onSave({ title: title || '(無題)', start_minutes: start, end_minutes: end, color });
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
            <Text style={styles.headerTitle}>{isNew ? '予定を追加' : '予定を編集'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#999" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="タイトルを入力"
              placeholderTextColor="#c0c0c0"
              maxLength={50}
              autoFocus={false}
            />

            <View style={styles.timeSection}>
              <View style={styles.timeBlock}>
                <Text style={styles.timeBlockLabel}>開始</Text>
                <View style={styles.wheelRow}>
                  <WheelPicker
                    items={HOURS}
                    selectedValue={startHour}
                    onValueChange={setStartHour}
                    width={64}
                  />
                  <Text style={styles.colonText}>:</Text>
                  <WheelPicker
                    items={MINUTES}
                    selectedValue={startMin}
                    onValueChange={setStartMin}
                    width={64}
                  />
                </View>
              </View>

              <View style={styles.timeDivider}>
                <View style={styles.timeDividerLine} />
                <View style={styles.durationBadge}>
                  <Clock size={12} color="#888" />
                  <Text style={[styles.durationText, hasError && styles.durationTextError]}>
                    {hasError ? '無効' : durationLabel}
                  </Text>
                </View>
                <View style={styles.timeDividerLine} />
              </View>

              <View style={styles.timeBlock}>
                <Text style={styles.timeBlockLabel}>終了</Text>
                <View style={styles.wheelRow}>
                  <WheelPicker
                    items={HOURS}
                    selectedValue={endHour}
                    onValueChange={setEndHour}
                    width={64}
                  />
                  <Text style={styles.colonText}>:</Text>
                  <WheelPicker
                    items={MINUTES}
                    selectedValue={endMin}
                    onValueChange={setEndMin}
                    width={64}
                  />
                </View>
              </View>
            </View>

            <Text style={styles.sectionLabel}>カラー</Text>
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
                  {title || '(無題)'}
                </Text>
                <Text style={styles.previewTime}>
                  {minutesToTimeString(startTotal)} - {minutesToTimeString(endTotal)}
                </Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {!isNew && onDelete && (
              <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
                <Trash2 size={18} color="#ff3b30" />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, hasError && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={hasError}
            >
              <Text style={styles.saveBtnText}>{isNew ? '追加' : '保存'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  closeBtn: {
    padding: 6,
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
  },
  body: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  titleInput: {
    fontSize: 18,
    color: '#111',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
    fontWeight: '500',
  },
  timeSection: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeBlock: {
    alignItems: 'center',
    flex: 1,
  },
  timeBlockLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginHorizontal: 2,
  },
  timeDivider: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 24,
  },
  timeDividerLine: {
    width: 1,
    height: 24,
    backgroundColor: '#e0e0e0',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginVertical: 6,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
  },
  durationTextError: {
    color: '#ff3b30',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginTop: 28,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDotActive: {
    borderWidth: 3,
    borderColor: '#000',
  },
  colorCheck: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  previewCard: {
    flexDirection: 'row',
    marginTop: 24,
    marginBottom: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eee',
  },
  previewBar: {
    width: 4,
  },
  previewContent: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  previewTime: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  deleteBtn: {
    padding: 10,
    backgroundColor: '#fff0f0',
    borderRadius: 12,
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginRight: 8,
  },
  cancelBtnText: {
    fontSize: 15,
    color: '#888',
    fontWeight: '500',
  },
  saveBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#222',
  },
  saveBtnDisabled: {
    backgroundColor: '#ccc',
  },
  saveBtnText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
});
