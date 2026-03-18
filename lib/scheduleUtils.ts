import { Schedule } from '@/types/database';

export const SCHEDULE_COLORS = [
  '#4A90D9',
  '#E8654A',
  '#50B86C',
  '#F5A623',
  '#9B59B6',
  '#1ABC9C',
  '#E74C8B',
  '#34495E',
  '#F39C12',
  '#2ECC71',
];

export function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

export function timeStringToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getOverlappingSchedules(schedules: Schedule[], startMin: number, endMin: number, excludeId?: string): Schedule[] {
  return schedules.filter(s => {
    if (excludeId && s.id === excludeId) return false;
    return s.start_minutes < endMin && s.end_minutes > startMin;
  });
}

export function snapToInterval(minutes: number, interval: number): number {
  return Math.round(minutes / interval) * interval;
}

export function getDayOfWeek(dateString: string): string {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const d = new Date(dateString);
  return days[d.getDay()];
}

export function formatDateDisplay(dateString: string): string {
  const d = new Date(dateString);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dow = getDayOfWeek(dateString);
  return `${month}月${day}日 (${dow})`;
}
