import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Bell, BellOff, X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WheelPicker from './WheelPicker';

interface ReminderPickerProps {
  visible: boolean;
  currentReminder: string | null;
  onSelect: (reminderAt: string | null) => void;
  onClose: () => void;
  workspaceDate?: string;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function buildQuickOptions(targetDate: Date) {
  const now = new Date();
  const isToday = isSameDay(targetDate, now);

  if (isToday) {
    return [
      { label: '5\u5206\u5F8C', minutes: 5 },
      { label: '15\u5206\u5F8C', minutes: 15 },
      { label: '30\u5206\u5F8C', minutes: 30 },
      { label: '1\u6642\u9593\u5F8C', minutes: 60 },
      { label: '3\u6642\u9593\u5F8C', minutes: 180 },
    ];
  }

  return [
    { label: '9:00', hour: 9, minute: 0 },
    { label: '10:00', hour: 10, minute: 0 },
    { label: '12:00', hour: 12, minute: 0 },
    { label: '14:00', hour: 14, minute: 0 },
    { label: '17:00', hour: 17, minute: 0 },
    { label: '19:00', hour: 19, minute: 0 },
    { label: '21:00', hour: 21, minute: 0 },
  ];
}

const HOUR_ITEMS = Array.from({ length: 24 }, (_, i) => ({
  label: i.toString().padStart(2, '0'),
  value: i,
}));

const MINUTE_ITEMS = Array.from({ length: 12 }, (_, i) => ({
  label: (i * 5).toString().padStart(2, '0'),
  value: i * 5,
}));

function getTargetDate(workspaceDate?: string): Date {
  if (!workspaceDate) return new Date();
  const parts = workspaceDate.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function formatTargetDateLabel(targetDate: Date): string {
  const now = new Date();
  if (isSameDay(targetDate, now)) return '\u4ECA\u65E5';
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(targetDate, tomorrow)) return '\u660E\u65E5';
  return `${targetDate.getMonth() + 1}\u6708${targetDate.getDate()}\u65E5`;
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
  workspaceDate,
}: ReminderPickerProps) {
  const [mode, setMode] = useState<'quick' | 'calendar'>('quick');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarHour, setCalendarHour] = useState(9);
  const [calendarMinute, setCalendarMinute] = useState(0);

  const targetDate = getTargetDate(workspaceDate);
  const isTargetToday = isSameDay(targetDate, new Date());
  const targetDateLabel = formatTargetDateLabel(targetDate);
  const quickOptions = buildQuickOptions(targetDate);

  const now = new Date();
  const defaultHour = isTargetToday ? (now.getHours() + 1 > 23 ? 23 : now.getHours() + 1) : 9;
  const [pickerHour, setPickerHour] = useState(defaultHour);
  const [pickerMinute, setPickerMinute] = useState(0);

  useEffect(() => {
    if (visible) {
      const n = new Date();
      const td = getTargetDate(workspaceDate);
      const isTd = isSameDay(td, n);
      const nh = isTd ? (n.getHours() + 1 > 23 ? 23 : n.getHours() + 1) : 9;
      setPickerHour(nh);
      setPickerMinute(0);
    }
  }, [visible, workspaceDate]);

  const handleQuickOption = (option: any) => {
    let date: Date;
    if ('minutes' in option && option.minutes) {
      date = new Date();
      date.setMinutes(date.getMinutes() + option.minutes);
    } else if ('hour' in option) {
      date = new Date(targetDate);
      date.setHours(option.hour, option.minute || 0, 0, 0);
      if (date <= new Date()) return;
    } else {
      return;
    }
    onSelect(date.toISOString());
  };

  const handleTimeConfirm = () => {
    const date = new Date(targetDate);
    date.setHours(pickerHour, pickerMinute, 0, 0);
    if (date <= new Date()) return;
    onSelect(date.toISOString());
  };

  const isTimeValid = () => {
    const date = new Date(targetDate);
    date.setHours(pickerHour, pickerMinute, 0, 0);
    return date > new Date();
  };

  const handleCalendarConfirm = () => {
    if (!selectedDate) return;
    const date = new Date(selectedDate);
    date.setHours(calendarHour, calendarMinute, 0, 0);
    if (date <= new Date()) return;
    onSelect(date.toISOString());
  };

  const handleRemoveReminder = () => {
    onSelect(null);
  };

  const calendarDaysInfo = (() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return { days: lastDay.getDate(), startDay: firstDay.getDay() };
  })();

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
          <ScrollView style={styles.quickContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.todayTimeSection}>
              <Text style={styles.todayTimeSectionTitle}>{targetDateLabel}{'\u306E\u6642\u9593\u3092\u6307\u5B9A'}</Text>
              <View style={styles.wheelRow}>
                <WheelPicker
                  items={HOUR_ITEMS}
                  selectedValue={pickerHour}
                  onValueChange={setPickerHour}
                  width={80}
                />
                <Text style={styles.wheelColon}>:</Text>
                <WheelPicker
                  items={MINUTE_ITEMS}
                  selectedValue={pickerMinute}
                  onValueChange={setPickerMinute}
                  width={80}
                />
              </View>
              <Text style={styles.todayTimePreview}>
                {targetDateLabel} {pickerHour.toString().padStart(2, '0')}:{pickerMinute.toString().padStart(2, '0')}
              </Text>
              <TouchableOpacity
                style={[styles.confirmBtn, !isTimeValid() && styles.confirmBtnDisabled]}
                disabled={!isTimeValid()}
                onPress={handleTimeConfirm}
              >
                <Text style={styles.confirmBtnText}>{'\u3053\u306E\u6642\u9593\u306B\u8A2D\u5B9A'}</Text>
              </TouchableOpacity>
              {!isTimeValid() && (
                <Text style={styles.pastWarning}>{'\u904E\u53BB\u306E\u6642\u9593\u306F\u8A2D\u5B9A\u3067\u304D\u307E\u305B\u3093'}</Text>
              )}
            </View>

            <View style={styles.todayTimeSectionDivider} />

            <View style={styles.quickList}>
              {quickOptions.map((opt: any) => (
                <TouchableOpacity
                  key={opt.label}
                  style={styles.quickOption}
                  onPress={() => handleQuickOption(opt)}
                >
                  <Bell size={16} color="#e67e22" />
                  <Text style={styles.quickOptionText}>
                    {isTargetToday ? opt.label : `${targetDateLabel} ${opt.label}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : (
          <ScrollView style={styles.calendarContainer} showsVerticalScrollIndicator={false}>
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
              {Array.from({ length: calendarDaysInfo.startDay }).map((_, i) => (
                <View key={`e-${i}`} style={styles.dayCell} />
              ))}
              {Array.from({ length: calendarDaysInfo.days }).map((_, i) => {
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
            <View style={styles.wheelRow}>
              <WheelPicker
                items={HOUR_ITEMS}
                selectedValue={calendarHour}
                onValueChange={setCalendarHour}
                width={80}
              />
              <Text style={styles.wheelColon}>:</Text>
              <WheelPicker
                items={MINUTE_ITEMS}
                selectedValue={calendarMinute}
                onValueChange={setCalendarMinute}
                width={80}
              />
            </View>

            {selectedDate && (
              <Text style={styles.calendarTimePreview}>
                {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 {calendarHour.toString().padStart(2, '0')}:{calendarMinute.toString().padStart(2, '0')}
              </Text>
            )}

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
  quickContainer: {
    flex: 1,
  },
  quickList: {
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
  todayTimeSectionDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  todayTimeSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    alignItems: 'center',
  },
  todayTimeSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  wheelColon: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1a1a1a',
    marginHorizontal: 8,
  },
  todayTimePreview: {
    fontSize: 16,
    fontWeight: '500',
    color: '#007AFF',
    marginBottom: 16,
  },
  pastWarning: {
    fontSize: 12,
    color: '#e74c3c',
    marginTop: 8,
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
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  calendarTimePreview: {
    fontSize: 16,
    fontWeight: '500',
    color: '#007AFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 24,
    marginHorizontal: 16,
    alignSelf: 'stretch',
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
