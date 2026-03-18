import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { formatDate } from '@/lib/scheduleUtils';

interface Props {
  visible: boolean;
  currentDate: string;
  onSelectDate: (date: string) => void;
  onClose: () => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_SIZE = Math.floor((SCREEN_WIDTH - 80) / 7);
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function ScheduleCalendarModal({ visible, currentDate, onSelectDate, onClose }: Props) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(currentDate);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const todayStr = formatDate(new Date());

  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: { day: number; dateStr: string; isCurrentMonth: boolean }[] = [];

    for (let i = 0; i < firstDay; i++) {
      days.push({ day: 0, dateStr: '', isCurrentMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      days.push({
        day: d,
        dateStr: formatDate(date),
        isCurrentMonth: true,
      });
    }

    return days;
  }, [viewMonth]);

  const prevMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>日付を選択</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={22} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.monthBtn}>
              <ChevronLeft size={20} color="#333" />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>
              {viewMonth.getFullYear()}年{viewMonth.getMonth() + 1}月
            </Text>
            <TouchableOpacity onPress={nextMonth} style={styles.monthBtn}>
              <ChevronRight size={20} color="#333" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((w, i) => (
              <View key={w} style={styles.weekdayCell}>
                <Text style={[styles.weekdayText, i === 0 && styles.sundayText, i === 6 && styles.saturdayText]}>
                  {w}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {calendarDays.map((item, idx) => {
              if (!item.isCurrentMonth) {
                return <View key={`empty-${idx}`} style={styles.dayCell} />;
              }
              const isSelected = item.dateStr === currentDate;
              const isToday = item.dateStr === todayStr;
              const dayOfWeek = (idx) % 7;

              return (
                <TouchableOpacity
                  key={item.dateStr}
                  style={[styles.dayCell, isSelected && styles.selectedDay, isToday && !isSelected && styles.todayDay]}
                  onPress={() => onSelectDate(item.dateStr)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isSelected && styles.selectedDayText,
                      isToday && !isSelected && styles.todayDayText,
                      dayOfWeek === 0 && styles.sundayText,
                      dayOfWeek === 6 && styles.saturdayText,
                    ]}
                  >
                    {item.day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.todayButton}
            onPress={() => onSelectDate(todayStr)}
          >
            <Text style={styles.todayButtonText}>今日に移動</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  closeBtn: {
    padding: 4,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthBtn: {
    padding: 8,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  sundayText: {
    color: '#E8654A',
  },
  saturdayText: {
    color: '#4A90D9',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dayText: {
    fontSize: 15,
    color: '#222',
    fontWeight: '500',
  },
  selectedDay: {
    backgroundColor: '#222',
    borderRadius: 20,
  },
  selectedDayText: {
    color: '#fff',
    fontWeight: '700',
  },
  todayDay: {
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
  },
  todayDayText: {
    color: '#E8654A',
    fontWeight: '700',
  },
  todayButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 12,
    backgroundColor: '#222',
    borderRadius: 10,
  },
  todayButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
