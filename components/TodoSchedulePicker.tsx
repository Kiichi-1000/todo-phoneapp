import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  Platform,
} from 'react-native';
import { X, CalendarClock, Clock, Bell, BellOff, Palette } from 'lucide-react-native';
import WheelPicker from './WheelPicker';
import { Todo } from '@/types/database';
import { minutesToTimeString, SCHEDULE_COLORS } from '@/lib/scheduleUtils';
import { useLanguage } from '@/contexts/LanguageContext';

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  label: String(i).padStart(2, '0'),
  value: i,
}));
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => ({
  label: String(m).padStart(2, '0'),
  value: m,
}));

interface Props {
  visible: boolean;
  todo: Todo | null;
  workspaceDate: string;
  onSave: (startMin: number, endMin: number, notifyBefore: number | null, color: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

function snapMinute(m: number): number {
  return MINUTES.reduce((prev, cur) =>
    Math.abs(cur.value - m) < Math.abs(prev.value - m) ? cur : prev
  ).value;
}

export default function TodoSchedulePicker({ visible, todo, workspaceDate, onSave, onRemove, onClose }: Props) {
  const { t } = useLanguage();
  const NOTIFY_OPTIONS: { label: string; value: number | null }[] = [
    { label: t('todoSchedule.notifyNone'), value: null },
    { label: t('todoSchedule.notify5'), value: 5 },
    { label: t('todoSchedule.notify10'), value: 10 },
    { label: t('todoSchedule.notify15'), value: 15 },
    { label: t('todoSchedule.notify30'), value: 30 },
    { label: t('todoSchedule.notify60'), value: 60 },
  ];
  const now = new Date();
  const defaultStart = now.getHours() * 60 + Math.ceil(now.getMinutes() / 5) * 5;

  const [startH, setStartH] = useState(Math.floor(defaultStart / 60));
  const [startM, setStartM] = useState(snapMinute(defaultStart % 60));
  const [endH, setEndH] = useState(Math.min(23, Math.floor(defaultStart / 60) + 1));
  const [endM, setEndM] = useState(snapMinute(defaultStart % 60));
  const [notifyBefore, setNotifyBefore] = useState<number | null>(null);
  const [color, setColor] = useState<string>(SCHEDULE_COLORS[1]);

  useEffect(() => {
    if (!visible || !todo) return;
    if (todo.schedule_start_minutes != null) {
      setStartH(Math.floor(todo.schedule_start_minutes / 60));
      setStartM(snapMinute(todo.schedule_start_minutes % 60));
    } else {
      const base = now.getHours() * 60 + Math.ceil(now.getMinutes() / 5) * 5;
      setStartH(Math.floor(base / 60));
      setStartM(snapMinute(base % 60));
    }
    if (todo.schedule_end_minutes != null) {
      setEndH(Math.floor(todo.schedule_end_minutes / 60));
      setEndM(snapMinute(todo.schedule_end_minutes % 60));
    } else {
      const base = now.getHours() * 60 + Math.ceil(now.getMinutes() / 5) * 5;
      const endBase = base + 60;
      setEndH(Math.min(23, Math.floor(endBase / 60)));
      setEndM(snapMinute(endBase % 60));
    }
    setNotifyBefore(todo.schedule_notify_before ?? null);
    setColor(todo.schedule_color ?? SCHEDULE_COLORS[1]);
  }, [visible, todo?.id]);

  if (!todo) return null;

  const startTotal = startH * 60 + startM;
  const endTotal = endH * 60 + endM;
  const durationMin = endTotal > startTotal ? endTotal - startTotal : 0;
  const durationLabel = durationMin > 0
    ? `${Math.floor(durationMin / 60) > 0 ? t('todoSchedule.durationHours', { n: Math.floor(durationMin / 60) }) : ''}${durationMin % 60 > 0 ? t('todoSchedule.durationMinutes', { n: durationMin % 60 }) : ''}`
    : '—';

  const hasExisting = todo.schedule_start_minutes != null;
  const canSave = endTotal > startTotal;

  const handleSave = () => {
    if (!canSave) return;
    onSave(startTotal, endTotal, notifyBefore, color);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <CalendarClock size={18} color="#3b82f6" />
            <Text style={styles.headerTitle}>{t('todoSchedule.title')}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={18} color="#999" />
            </TouchableOpacity>
          </View>

          {/* Task name */}
          <View style={styles.taskName}>
            <Text style={styles.taskNameText} numberOfLines={2}>{todo.content}</Text>
          </View>

          {/* Time pickers */}
          <View style={styles.timeSection}>
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>{t('todoSchedule.start')}</Text>
              <View style={styles.pickerRow}>
                <WheelPicker items={HOURS} selectedValue={startH} onValueChange={setStartH} width={72} />
                <Text style={styles.colon}>:</Text>
                <WheelPicker items={MINUTES} selectedValue={startM} onValueChange={setStartM} width={72} />
              </View>
            </View>

            <View style={styles.durationBadge}>
              <Clock size={12} color="#888" />
              <Text style={styles.durationText}>{durationLabel}</Text>
            </View>

            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>{t('todoSchedule.end')}</Text>
              <View style={styles.pickerRow}>
                <WheelPicker items={HOURS} selectedValue={endH} onValueChange={setEndH} width={72} />
                <Text style={styles.colon}>:</Text>
                <WheelPicker items={MINUTES} selectedValue={endM} onValueChange={setEndM} width={72} />
              </View>
            </View>
          </View>

          {!canSave && (
            <Text style={styles.errorText}>{t('todoSchedule.errorEndBeforeStart')}</Text>
          )}

          {/* Color section */}
          <View style={styles.colorSection}>
            <View style={styles.colorSectionHeader}>
              <Palette size={14} color="#3b82f6" />
              <Text style={styles.colorSectionTitle}>{t('todoSchedule.colorSectionTitle')}</Text>
            </View>
            <View style={styles.colorRow}>
              {SCHEDULE_COLORS.map(c => {
                const active = color === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorDot, { backgroundColor: c }, active && styles.colorDotActive]}
                    onPress={() => setColor(c)}
                    activeOpacity={0.8}
                  >
                    {active && <View style={styles.colorCheck} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Notification section */}
          <View style={styles.notifySection}>
            <View style={styles.notifySectionHeader}>
              <Bell size={14} color="#3b82f6" />
              <Text style={styles.notifySectionTitle}>{t('todoSchedule.notifySectionTitle')}</Text>
            </View>
            <View style={styles.notifyOptions}>
              {NOTIFY_OPTIONS.map(opt => {
                const active = notifyBefore === opt.value;
                return (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[styles.notifyChip, active && styles.notifyChipActive]}
                    onPress={() => setNotifyBefore(opt.value)}
                    activeOpacity={0.7}
                  >
                    {opt.value === null
                      ? <BellOff size={11} color={active ? '#fff' : '#aaa'} />
                      : null
                    }
                    <Text style={[styles.notifyChipText, active && styles.notifyChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            {hasExisting && (
              <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
                <Text style={styles.removeBtnText}>{t('common.delete')}</Text>
              </TouchableOpacity>
            )}
            <View style={styles.footerRight}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!canSave}
              >
                <Text style={styles.saveBtnText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 8 : 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  closeBtn: {
    padding: 4,
  },
  taskName: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f8f9fb',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  taskNameText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    lineHeight: 20,
  },
  timeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  timeBlock: {
    alignItems: 'center',
    flex: 1,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  colon: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
    marginHorizontal: 2,
    marginBottom: 4,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0f4ff',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 60,
    justifyContent: 'center',
  },
  durationText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3b82f6',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  colorSection: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    backgroundColor: '#f8f9fb',
    borderRadius: 12,
  },
  colorSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  colorSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotActive: {
    borderColor: '#222',
  },
  colorCheck: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  notifySection: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    padding: 14,
    backgroundColor: '#f8f9fb',
    borderRadius: 12,
  },
  notifySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  notifySectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  notifyOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  notifyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  notifyChipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  notifyChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  notifyChipTextActive: {
    color: '#fff',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f0f0f0',
  },
  removeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  removeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  footerRight: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 'auto',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
  },
  saveBtnDisabled: {
    backgroundColor: '#d0d0d0',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
