// Deadline notification scheduler — local notifications for 課題期限.
//
// Default (notification_offsets = null):
//   1. Morning (8:00 on due date): 「今日が締切です」
//   2. Evening (20:00 on due date): 「まだ未完了です」
//
// Custom offsets (notification_offsets = "1d,2h,..."):
//   Supported: "2d" (2日前), "1d" (1日前), "2h" (2時間前), "1h" (1時間前)
//   Each offset fires at due_date - offset (using 23:59 as due time for day offsets).
//   Default morning+evening are ALSO kept when custom offsets are set.
//
// All notifications are LOCAL (on-device). No push token needed.
// Identifiers are prefixed `deadline_` so we can clear just our own.
// Re-scheduling is idempotent: cancel all → re-schedule from current data.

import { Platform } from 'react-native';
import { NativeModulesProxy } from 'expo-modules-core';

const ID_PREFIX = 'deadline_';
const MORNING_HOUR = 8;
const EVENING_HOUR = 20;

// Preset offset definitions
export type OffsetKey = '2d' | '1d' | '2h' | '1h';

export const OFFSET_PRESETS: { key: OffsetKey; label: string }[] = [
  { key: '2d', label: '2日前' },
  { key: '1d', label: '1日前' },
  { key: '2h', label: '2時間前' },
  { key: '1h', label: '1時間前' },
];

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

export interface DeadlineTask {
  id: string;
  content: string;
  due_date: string; // YYYY-MM-DD or YYYY-MM-DDTHH:MM
  course_name?: string | null;
  notification_offsets?: string | null; // comma-separated: "1d,2d,1h,2h"
}

function notifId(todoId: string, suffix: string): string {
  return `${ID_PREFIX}${suffix}_${todoId}`;
}

function parseDateLocal(dateStr: string): Date {
  if (dateStr.includes('T')) {
    const [datePart, timePart] = dateStr.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const [h, min] = timePart.split(':').map(Number);
    return new Date(y, m - 1, d, h, min);
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Parse offset string to milliseconds before due date end-of-day (23:59). */
function offsetToMs(offset: string): number | null {
  const match = offset.match(/^(\d+)([dh])$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'd') return value * 24 * 60 * 60 * 1000;
  if (unit === 'h') return value * 60 * 60 * 1000;
  return null;
}

function offsetLabel(offset: string): string {
  const preset = OFFSET_PRESETS.find((p) => p.key === offset);
  return preset ? preset.label : offset;
}

// ---------- Public API ----------

/** Cancel all deadline notifications. */
export async function cancelAllDeadlineNotifications(): Promise<void> {
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
    // best effort
  }
}

/** Cancel notifications for a specific task (e.g. on completion). */
export async function cancelDeadlineNotification(todoId: string): Promise<void> {
  const mod = await getNotifications();
  if (!mod) return;
  // Cancel all possible identifiers for this task
  const suffixes = ['am', 'pm', '2d', '1d', '2h', '1h'];
  for (const suffix of suffixes) {
    try {
      await mod.cancelScheduledNotificationAsync(notifId(todoId, suffix));
    } catch { /* ignore */ }
  }
}

/**
 * Schedule deadline notifications for all provided tasks.
 * Idempotent: cancels all existing deadline notifications first,
 * then schedules fresh ones for each task.
 */
export async function scheduleDeadlineNotifications(
  tasks: DeadlineTask[]
): Promise<number> {
  await cancelAllDeadlineNotifications();

  if (tasks.length === 0) return 0;

  const mod = await getNotifications();
  if (!mod) return 0;

  // Check permissions
  try {
    const status = await mod.getPermissionsAsync();
    if (!status.granted) {
      const req = await mod.requestPermissionsAsync();
      if (!req.granted) return 0;
    }
  } catch {
    return 0;
  }

  // Ensure Android channel exists
  if (Platform.OS === 'android') {
    try {
      await mod.setNotificationChannelAsync('deadlines', {
        name: '課題の締切',
        importance: mod.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    } catch { /* ignore */ }
  }

  const now = new Date();
  let scheduledCount = 0;

  async function scheduleOne(
    identifier: string,
    title: string,
    body: string,
    fireDate: Date,
    todoId: string,
    notifType: string,
  ): Promise<boolean> {
    if (fireDate <= now) return false;
    try {
      await mod!.scheduleNotificationAsync({
        identifier,
        content: {
          title,
          body,
          data: { type: notifType, todoId },
          sound: 'default',
          ...(Platform.OS === 'android' ? { channelId: 'deadlines' } : {}),
        },
        trigger: {
          type: mod!.SchedulableTriggerInputTypes.DATE,
          date: fireDate,
        } as any,
      });
      return true;
    } catch {
      return false;
    }
  }

  for (const task of tasks) {
    const dueDate = parseDateLocal(task.due_date);
    const label = task.course_name
      ? `[${task.course_name}] ${task.content}`
      : task.content;

    // --- Default notifications (always scheduled) ---

    // Morning notification (8:00 on due date)
    const morningTime = new Date(
      dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(),
      MORNING_HOUR, 0, 0, 0,
    );
    if (await scheduleOne(
      notifId(task.id, 'am'),
      '📅 今日が締切です',
      label,
      morningTime,
      task.id,
      'deadline_morning',
    )) {
      scheduledCount++;
    }

    // Evening notification (20:00 on due date)
    const eveningTime = new Date(
      dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(),
      EVENING_HOUR, 0, 0, 0,
    );
    if (await scheduleOne(
      notifId(task.id, 'pm'),
      '⚠️ まだ未完了の課題があります',
      label,
      eveningTime,
      task.id,
      'deadline_evening',
    )) {
      scheduledCount++;
    }

    // --- Custom offset notifications ---
    if (task.notification_offsets) {
      const offsets = task.notification_offsets.split(',').map((s) => s.trim()).filter(Boolean);
      // Due time reference: actual time if specified, else 23:59 (end of day)
      const dueRef = task.due_date.includes('T')
        ? dueDate // parseDateLocal already extracted hours/minutes
        : new Date(
            dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(),
            23, 59, 0, 0,
          );

      for (const offset of offsets) {
        const ms = offsetToMs(offset);
        if (ms === null) continue;
        const fireDate = new Date(dueRef.getTime() - ms);
        if (await scheduleOne(
          notifId(task.id, offset),
          `🔔 ${offsetLabel(offset)}に締切の課題があります`,
          label,
          fireDate,
          task.id,
          `deadline_custom_${offset}`,
        )) {
          scheduledCount++;
        }
      }
    }
  }

  return scheduledCount;
}
