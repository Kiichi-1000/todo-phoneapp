import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { X, Trash2 } from 'lucide-react-native';
import { Schedule } from '@/types/database';
import { SCHEDULE_COLORS, minutesToTimeString } from '@/lib/scheduleUtils';

interface Props {
  visible: boolean;
  schedule: Partial<Schedule> | null;
  onSave: (data: { title: string; start_minutes: number; end_minutes: number; color: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
  isNew: boolean;
}

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

  const handleSave = () => {
    const start = startHour * 60 + startMin;
    let end = endHour * 60 + endMin;
    if (end <= start) {
      end = start + 10;
    }
    if (end > 1440) end = 1440;
    onSave({ title: title || '(無題)', start_minutes: start, end_minutes: end, color });
  };

  const renderTimePicker = (
    label: string,
    hour: number,
    min: number,
    setHour: (h: number) => void,
    setMinute: (m: number) => void
  ) => (
    <View style={styles.timePickerSection}>
      <Text style={styles.timeLabel}>{label}</Text>
      <View style={styles.timeRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeScroll}>
          {Array.from({ length: 25 }, (_, i) => i).map(h => (
            <TouchableOpacity
              key={h}
              style={[styles.timePill, hour === h && styles.timePillActive]}
              onPress={() => setHour(h)}
            >
              <Text style={[styles.timePillText, hour === h && styles.timePillTextActive]}>
                {h}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={styles.timeSeparator}>:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeScroll}>
          {[0, 10, 20, 30, 40, 50].map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.timePill, min === m && styles.timePillActive]}
              onPress={() => setMinute(m)}
            >
              <Text style={[styles.timePillText, min === m && styles.timePillTextActive]}>
                {m.toString().padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{isNew ? '予定を追加' : '予定を編集'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={22} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body}>
            <Text style={styles.fieldLabel}>タイトル</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="予定のタイトル"
              placeholderTextColor="#aaa"
              maxLength={50}
            />

            {renderTimePicker('開始時間', startHour, startMin, setStartHour, setStartMin)}
            {renderTimePicker('終了時間', endHour, endMin, setEndHour, setEndMin)}

            <View style={styles.previewRow}>
              <Text style={styles.fieldLabel}>プレビュー</Text>
              <Text style={styles.previewText}>
                {minutesToTimeString(startHour * 60 + startMin)} - {minutesToTimeString(endHour * 60 + endMin)}
              </Text>
            </View>

            <Text style={styles.fieldLabel}>カラー</Text>
            <View style={styles.colorRow}>
              {SCHEDULE_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {!isNew && onDelete && (
              <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
                <Trash2 size={18} color="#ff3b30" />
                <Text style={styles.deleteBtnText}>削除</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>保存</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#fafafa',
  },
  timePickerSection: {
    marginTop: 8,
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeScroll: {
    flex: 1,
    maxHeight: 40,
  },
  timePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 6,
  },
  timePillActive: {
    backgroundColor: '#222',
  },
  timePillText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  timePillTextActive: {
    color: '#fff',
  },
  timeSeparator: {
    fontSize: 18,
    fontWeight: '600',
    marginHorizontal: 6,
    color: '#333',
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  previewText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A90D9',
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorDotActive: {
    borderWidth: 3,
    borderColor: '#000',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
  },
  deleteBtnText: {
    color: '#ff3b30',
    fontSize: 15,
    fontWeight: '500',
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 8,
  },
  cancelBtnText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  saveBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#222',
  },
  saveBtnText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
});
