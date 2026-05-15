// Goal reminder scheduler — local notifications for setting/reviewing goals
// at the start and end of each level's period.
//
// Cycles:
//   - monthly:   day 1 (setup), last day of month (review)
//   - half_year: Jan 1 / Jul 1 (setup), Jun 30 / Dec 31 (review)
//   - yearly:    Jan 1 (setup), Dec 31 (review)
//   - long_term: Jan 1 every 5 years (setup) — currently 2026, 2031, ...
//                Dec 31 of the year before next cycle (review)
//
// Coalescing rule: when multiple notifications fall on the same date,
// we COMBINE them into a single richer notification to avoid spamming the
// user (e.g. Jan 1 = monthly + half_year + yearly setup → one notification
// listing all three).
//
// All notifications are LOCAL (scheduled on-device). No server / push token
// needed. Identifiers are prefixed `goal_` so we can clear just our own
// without affecting other reminders.

import { Platform } from 'react-native';
import { NativeModulesProxy } from 'expo-modules-core';

const ID_PREFIX = 'goal_';
const HORIZON_MONTHS = 12; // schedule reminders up to N months ahead

let Notifications: typeof import('expo-notifications') | null = null;
let moduleChecked = false;

function hasNotificationsSupport(): boolean {
  if (Platform.OS === 'web') return false;
  const modules = NativeModulesProxy as Record<string, unknown>;
  return Boolean(modules?.ExpoPushTokenManager);
}

async function getNotifications(): Promise<typeof import('expo-notifications') | null> {
  if (moduleChecked) return Notifications;
  if (!hasNotificationsSupport()) {
    moduleChecked = true;
    return null;
  }
  try {
    const mod = require('expo-notifications') as typeof import('expo-notifications');
    Notifications = mod;
    moduleChecked = true;
    return Notifications;
  } catch {
    moduleChecked = true;
    return null;
  }
}

// ---------- Date helpers ----------

function lastDayOfMonth(year: number, monthIdx0: number): number {
  // monthIdx0: 0-11
  return new Date(year, monthIdx0 + 1, 0).getDate();
}

function isInFuture(date: Date, ref: Date): boolean {
  return date.getTime() > ref.getTime();
}

// ---------- Reminder events ----------
//
// Each reminder is keyed by ISO date (YYYY-MM-DD) so multiple kinds on the
// same day get coalesced into a single notification.

type ReminderKind =
  | 'monthly_setup'
  | 'monthly_review'
  | 'half_year_setup'
  | 'half_year_review'
  | 'yearly_setup'
  | 'yearly_review'
  | 'long_term_setup'
  | 'long_term_review';

interface ReminderEvent {
  date: Date;     // local time, hour set later
  kind: ReminderKind;
}

const KIND_DESC: Record<ReminderKind, string> = {
  monthly_setup:     '📅 今月の目標を立てましょう',
  monthly_review:    '✅ 今月の目標を振り返りましょう',
  half_year_setup:   '📊 新しい半期の目標を立てましょう',
  half_year_review:  '✅ 半期目標の振り返りをしましょう',
  yearly_setup:      '🎯 今年の目標を立てましょう',
  yearly_review:     '✅ 今年の目標を振り返りましょう',
  long_term_setup:   '🚀 これから5年間の目標を立てましょう',
  long_term_review:  '✅ 5年間の目標を振り返りましょう',
};

// Order kinds within a coalesced notification body, broadest → finest.
const KIND_PRIORITY: ReminderKind[] = [
  'long_term_setup',
  'yearly_setup',
  'half_year_setup',
  'monthly_setup',
  'long_term_review',
  'yearly_review',
  'half_year_review',
  'monthly_review',
];

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Compute all reminder events between `from` and `from + HORIZON_MONTHS`.
function computeUpcomingEvents(from: Date): ReminderEvent[] {
  const events: ReminderEvent[] = [];
  const horizon = new Date(from.getFullYear(), from.getMonth() + HORIZON_MONTHS, from.getDate());

  // Monthly: day 1 setup + last day review
  let cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur < horizon) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const day1 = new Date(y, m, 1);
    const dayLast = new Date(y, m, lastDayOfMonth(y, m));

    if (isInFuture(day1, from)) events.push({ date: day1, kind: 'monthly_setup' });
    if (isInFuture(dayLast, from)) events.push({ date: dayLast, kind: 'monthly_review' });

    // Half-year setup: Jan 1 + Jul 1 of each year
    if (m === 0 && isInFuture(day1, from)) {
      events.push({ date: new Date(y, 0, 1), kind: 'half_year_setup' });
      events.push({ date: new Date(y, 0, 1), kind: 'yearly_setup' });
      // Long-term: every 5 years on Jan 1 (year % 5 === 1 starting 2026 → 2026, 2031, ...)
      // We treat this as a "if there's no current long-term goal, prompt yearly"; for
      // simplicity here, always remind on years that are multiples of 5 from 2026.
      if ((y - 2026) % 5 === 0 && y >= 2026) {
        events.push({ date: new Date(y, 0, 1), kind: 'long_term_setup' });
      }
    }
    if (m === 6 && isInFuture(day1, from)) {
      events.push({ date: new Date(y, 6, 1), kind: 'half_year_setup' });
    }

    // Half-year review: Jun 30 + Dec 31
    if (m === 5 && isInFuture(dayLast, from)) {
      events.push({ date: new Date(y, 5, 30), kind: 'half_year_review' });
    }
    if (m === 11 && isInFuture(dayLast, from)) {
      events.push({ date: new Date(y, 11, 31), kind: 'half_year_review' });
      events.push({ date: new Date(y, 11, 31), kind: 'yearly_review' });
      if ((y + 1 - 2026) % 5 === 0 && y + 1 >= 2031) {
        events.push({ date: new Date(y, 11, 31), kind: 'long_term_review' });
      }
    }

    // Advance to next month
    cur = new Date(y, m + 1, 1);
  }

  return events;
}

// Coalesce events that share the same date into one record.
interface CoalescedNotification {
  date: Date;     // hour will be added later
  dateKey: string;
  kinds: ReminderKind[];
}

function coalesceEvents(events: ReminderEvent[]): CoalescedNotification[] {
  const map = new Map<string, CoalescedNotification>();
  for (const ev of events) {
    const key = dateKey(ev.date);
    const existing = map.get(key);
    if (existing) {
      if (!existing.kinds.includes(ev.kind)) existing.kinds.push(ev.kind);
    } else {
      map.set(key, { date: ev.date, dateKey: key, kinds: [ev.kind] });
    }
  }
  // Sort kinds by priority within each notification
  const out = Array.from(map.values());
  for (const n of out) {
    n.kinds.sort((a, b) => KIND_PRIORITY.indexOf(a) - KIND_PRIORITY.indexOf(b));
  }
  // Sort notifications by date
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}

function buildNotificationContent(n: CoalescedNotification): { title: string; body: string } {
  if (n.kinds.length === 1) {
    return {
      title: KIND_DESC[n.kinds[0]],
      body: 'ToScheで目標を確認・編集しましょう。',
    };
  }
  // Multiple — pick a leading title (the broadest setup wins)
  const lead = n.kinds[0];
  const restLines = n.kinds.slice(1).map((k) => `• ${KIND_DESC[k]}`).join('\n');
  return {
    title: KIND_DESC[lead],
    body: restLines || 'ToScheで目標を確認・編集しましょう。',
  };
}

// ---------- Public API ----------

export async function cancelAllGoalReminders(): Promise<void> {
  const mod = await getNotifications();
  if (!mod) return;
  try {
    const all = await mod.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (typeof n.identifier === 'string' && n.identifier.startsWith(ID_PREFIX)) {
        await mod.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch {
    // ignore — best effort
  }
}

interface ScheduleOptions {
  enabled: boolean;
  hour: number; // 0-23
}

export async function scheduleGoalReminders(opts: ScheduleOptions): Promise<number> {
  // First, always clear our own to avoid duplicates
  await cancelAllGoalReminders();

  if (!opts.enabled) return 0;

  const mod = await getNotifications();
  if (!mod) return 0;

  // Permissions
  try {
    const status = await mod.getPermissionsAsync();
    if (!status.granted) {
      const req = await mod.requestPermissionsAsync();
      if (!req.granted) return 0;
    }
  } catch {
    return 0;
  }

  const now = new Date();
  const events = computeUpcomingEvents(now);
  const coalesced = coalesceEvents(events);

  let scheduledCount = 0;
  for (const n of coalesced) {
    const fireDate = new Date(
      n.date.getFullYear(),
      n.date.getMonth(),
      n.date.getDate(),
      opts.hour,
      0,
      0,
      0,
    );
    if (fireDate <= now) continue;

    const { title, body } = buildNotificationContent(n);
    const identifier = ID_PREFIX + n.dateKey;

    try {
      await mod.scheduleNotificationAsync({
        identifier,
        content: {
          title,
          body,
          data: { type: 'goal_reminder', kinds: n.kinds, date: n.dateKey },
        },
        trigger: {
          type: mod.SchedulableTriggerInputTypes.DATE,
          date: fireDate,
        } as any,
      });
      scheduledCount++;
    } catch {
      // Skip individual failures
    }
  }

  return scheduledCount;
}

// Listing helper for debug / settings UI
export async function getScheduledGoalReminders(): Promise<{ id: string; date: string }[]> {
  const mod = await getNotifications();
  if (!mod) return [];
  try {
    const all = await mod.getAllScheduledNotificationsAsync();
    return all
      .filter((n: any) => typeof n.identifier === 'string' && n.identifier.startsWith(ID_PREFIX))
      .map((n: any) => ({
        id: n.identifier,
        date: n.identifier.replace(ID_PREFIX, ''),
      }));
  } catch {
    return [];
  }
}
