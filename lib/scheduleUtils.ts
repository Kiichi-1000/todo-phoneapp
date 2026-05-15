import { Schedule } from '@/types/database';

// 20-color palette for schedule entries. Designed so the pie-chart view
// stays varied across the day even with many events. Saved values may be any
// color (legacy entries still render fine), but new entries are drawn from
// this set.
//
// KEEP IN SYNC WITH `SCHEDULE_PALETTE` in
// `supabase/functions/ai-chat/tools.ts` so server-side auto-pick matches.
export const SCHEDULE_COLORS = [
  // Original 10 (kept first for backwards compatibility)
  '#4A90D9',  // blue
  '#E8654A',  // coral
  '#50B86C',  // green
  '#F5A623',  // orange
  '#9B59B6',  // purple
  '#1ABC9C',  // teal
  '#E74C8B',  // magenta
  '#34495E',  // slate
  '#F39C12',  // amber
  '#2ECC71',  // emerald
  // Extended 10 (more pastels and bright accents)
  '#6C5CE7',  // indigo
  '#00B894',  // mint
  '#FDCB6E',  // peach
  '#74B9FF',  // sky blue
  '#A29BFE',  // lavender
  '#FF7675',  // salmon
  '#55EFC4',  // light teal
  '#FAB1A0',  // light coral
  '#FF6B9D',  // hot pink
  '#7DA0FA',  // periwinkle
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

export function parseDateString(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
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

const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
const DAYS_EN_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getDayOfWeek(dateString: string, lang: 'ja' | 'en' = 'ja'): string {
  const d = parseDateString(dateString);
  return (lang === 'en' ? DAYS_EN_SHORT : DAYS_JA)[d.getDay()];
}

export function formatDateDisplay(dateString: string, lang: 'ja' | 'en' = 'ja'): string {
  const d = parseDateString(dateString);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dow = getDayOfWeek(dateString, lang);
  if (lang === 'en') {
    return `${dow}, ${month}/${day}`;
  }
  return `${month}月${day}日 (${dow})`;
}
