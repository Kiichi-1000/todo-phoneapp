import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { Bell, BellOff, X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ReminderPickerProps {
  visible: boolean;
  currentReminder: string | null;
  onSelect: (reminderAt: string | null) => void;
  onClose: () => void;
}

const QUICK_OPTIONS = [
  { label: '5分後', minutes: 5 },
  { label: '15分後', minutes: 15 },
  { label: '30分後', minutes: 30 },
  { label: '1時間後', minutes: 60 },
  { label: '3時間後', minutes: 180 },
  { label: '明日 9:00', preset: 'tomorrow9' },
  { label: '明日 12:00', preset: 'tomorrow12' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES_OPTIONS = [0, 15, 30, 45];

function getPresetTime(preset: string): Date {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (preset === 'tomorrow9') {
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }
  if (preset === 'tomorrow12') {
    tomorrow.setHours(12, 0, 0, 0);
    return tomorrow;
  }
  return now;
}

function formatReminderDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const timeStr = `${h}:${m}`;

  if (isToday) return `今日 ${timeStr}`;
  if (isTomorrow) return `明日 ${timeStr}`;

  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}/${day} ${timeStr}`;
}

export { formatReminderDisplay };

export default function ReminderPicker({
  visible,
  currentReminder,
  onSelect,
  onClose,
}: ReminderPickerProps) {
  const [mode, setMode] = useState<'quick' | 'calendar'>('quick');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState(0);

  const handleQuickOption = (option: (typeof QUICK_OPTIONS)[number]) => {
    let date: Date;
    if ('minutes' in option && option.minutes) {
      date = new Date();
      date.setMinutes(date.getMinutes() + option.minutes);
    } else if ('preset' in option && option.preset) {
      date = getPresetTime(option.preset);
    } else {
      return;
    }
    onSelect(date.toISOString());
  };

  const handleCalendarConfirm = () => {
    if (!selectedDate) return;
    const date = new Date(selectedDate);
    date.setHours(selectedHour, selectedMinute, 0, 0);
    onSelect(date.toISOString());
  };

  const handleRemoveReminder = () => {
    onSelect(null);
  };

  const daysInMonth = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return {
      days: lastDay.getDate(),
      startDay: firstDay.getDay(),
    };
  }, [calendarMonth]);

  const navigateMonth = (dir: 'prev' | 'next') => {
    const d = new Date(calendarMonth);
    d.setMonth(d.getMonth() + (dir === 'prev' ? -1 : 1));
    setCalendarMonth(d);
  };

  const monthLabel = `${calendarMonth.getFullYear()}年${calendarMonth.getMonth() + 1}月`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>リマインダー</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={20} color="#666" />
          </TouchableOpacity>
        </View>

        {currentReminder && (
          <View style={styles.currentReminder}>
            <Bell size={14} color="#e67e22" />
            <Text style={styles.currentReminderText}>
              {formatReminderDisplay(currentReminder)}
            </Text>
            <TouchableOpacity onPress={handleRemoveReminder} style={styles.removeBtn}>
              <BellOff size={14} color="#e74c3c" />
              <Text style={styles.removeBtnText}>解除</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, mode === 'quick' && styles.tabActive]}
            onPress={() => setMode('quick')}
          >
            <Text style={[styles.tabText, mode === 'quick' && styles.tabTextActive]}>かんたん設定</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'calendar' && styles.tabActive]}
            onPress={() => setMode('calendar')}
          >
            <Text style={[styles.tabText, mode === 'calendar' && styles.tabTextActive]}>日時指定</Text>
          </TouchableOpacity>
        </View>

        {mode === 'quick' ? (
          <ScrollView style={styles.quickList}>
            {QUICK_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={styles.quickOption}
                onPress={() => handleQuickOption(opt)}
              >
                <Bell size={16} color="#e67e22" />
                <Text style={styles.quickOptionText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <ScrollView style={styles.calendarContainer}>
            <View style={styles.calendarNav}>
              <TouchableOpacity onPress={() => navigateMonth('prev')}>
                <ChevronLeft size={20} color="#007AFF" />
              </TouchableOpacity>
              <Text style={styles.monthLabel}>{monthLabel}</Text>
              <TouchableOpacity onPress={() => navigateMonth('next')}>
                <ChevronRight size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {['日', '月', '火', '水', '木', '金', '土'].map((d) => (
                <Text key={d} style={styles.weekDay}>{d}</Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {Array.from({ length: daysInMonth.startDay }).map((_, i) => (
                <View key={`e-${i}`} style={styles.dayCell} />
              ))}
              {Array.from({ length: daysInMonth.days }).map((_, i) => {
                const day = i + 1;
                const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isPast = date < today;
                const isSelected =
                  selectedDate &&
                  selectedDate.getDate() === day &&
                  selectedDate.getMonth() === calendarMonth.getMonth() &&
                  selectedDate.getFullYear() === calendarMonth.getFullYear();

                return (
                  <TouchableOpacity
                    key={day}
                    style={[styles.dayCell, isSelected && styles.dayCellSelected, isPast && styles.dayCellPast]}
                    disabled={isPast}
                    onPress={() => setSelectedDate(date)}
                  >
                    <Text style={[styles.dayCellText, isSelected && styles.dayCellTextSelected, isPast && styles.dayCellTextPast]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.timeLabel}>時刻</Text>
            <View style={styles.timeRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hourScroll}>
                {HOURS.map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.timePill, selectedHour === h && styles.timePillActive]}
                    onPress={() => setSelectedHour(h)}
                  >
                    <Text style={[styles.timePillText, selectedHour === h && styles.timePillTextActive]}>
                      {h.toString().padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.timeColon}>:</Text>
              <View style={styles.minuteRow}>
                {MINUTES_OPTIONS.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.timePill, selectedMinute === m && styles.timePillActive]}
                    onPress={() => setSelectedMinute(m)}
                  >
                    <Text style={[styles.timePillText, selectedMinute === m && styles.timePillTextActive]}>
                      {m.toString().padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, !selectedDate && styles.confirmBtnDisabled]}
              disabled={!selectedDate}
              onPress={handleCalendarConfirm}
            >
              <Text style={styles.confirmBtnText}>設定する</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  closeBtn: {
    padding: 4,
  },
  currentReminder: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3e2',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  currentReminderText: {
    flex: 1,
    fontSize: 14,
    color: '#e67e22',
    fontWeight: '500',
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fde8e8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  removeBtnText: {
    fontSize: 12,
    color: '#e74c3c',
    fontWeight: '500',
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  tabTextActive: {
    color: '#1a1a1a',
    fontWeight: '600',
  },
  quickList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  quickOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  quickOptionText: {
    fontSize: 15,
    color: '#1a1a1a',
  },
  calendarContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  calendarNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
  },
  dayCellPast: {
    opacity: 0.3,
  },
  dayCellText: {
    fontSize: 15,
    color: '#1a1a1a',
  },
  dayCellTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  dayCellTextPast: {
    color: '#999',
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  hourScroll: {
    flex: 1,
    maxHeight: 36,
  },
  timeColon: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginHorizontal: 6,
  },
  minuteRow: {
    flexDirection: 'row',
    gap: 4,
  },
  timePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    marginRight: 4,
  },
  timePillActive: {
    backgroundColor: '#007AFF',
  },
  timePillText: {
    fontSize: 14,
    color: '#666',
  },
  timePillTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  confirmBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 24,
  },
  confirmBtnDisabled: {
    backgroundColor: '#ccc',
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
