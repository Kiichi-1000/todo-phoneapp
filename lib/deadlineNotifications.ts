// Deadline notification scheduler — local notifications for課題期限.
//
// Two notifications per deadline task:
//   1. Morning (8:00 on due date): 「今日が締切です」
//   2. Evening (20:00 on due date): 「まだ未完了です」
//
// All notifications are LOCAL (on-device). No push token needed.
// Identifiers are prefixed `deadline_` so we can clear just our own.
// Re-scheduling is idempotent: cancel all → re-schedule from current data.

import { Platform } from 'react-native';
import { NativeModulesProxy } from 'expo-modules-core';

const ID_PREFIX = 'deadline_';
const MORNING_HOUR = 8;
const EVENING_HOUR = 20;

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
  due_date: string; // YYYY-MM-DD
  course_name?: string | null;
}

function morningId(todoId: string): string {
  return `${ID_PREFIX}am_${todoId}`;
}

function eveningId(todoId: string): string {
  return `${ID_PREFIX}pm_${todoId}`;
}

function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
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
  try {
    await mod.cancelScheduledNotificationAsync(morningId(todoId));
  } catch { /* ignore */ }
  try {
    await mod.cancelScheduledNotificationAsync(eveningId(todoId));
  } catch { /* ignore */ }
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

  for (const task of tasks) {
    const dueDate = parseDateLocal(task.due_date);
    const label = task.course_name
      ? `[${task.course_name}] ${task.content}`
      : task.content;

    // Morning notification (8:00 on due date)
    const morningTime = new Date(
      dueDate.getFullYear(),
      dueDate.getMonth(),
      dueDate.getDate(),
      MORNING_HOUR,
      0,
      0,
      0,
    );

    if (morningTime > now) {
      try {
        await mod.scheduleNotificationAsync({
          identifier: morningId(task.id),
          content: {
            title: '📅 今日が締切です',
            body: label,
            data: { type: 'deadline_morning', todoId: task.id },
            sound: 'default',
            ...(Platform.OS === 'android' ? { channelId: 'deadlines' } : {}),
          },
          trigger: {
            type: mod.SchedulableTriggerInputTypes.DATE,
            date: morningTime,
          } as any,
        });
        scheduledCount++;
      } catch { /* skip */ }
    }

    // Evening notification (20:00 on due date — "still incomplete" alert)
    const eveningTime = new Date(
      dueDate.getFullYear(),
      dueDate.getMonth(),
      dueDate.getDate(),
      EVENING_HOUR,
      0,
      0,
      0,
    );

    if (eveningTime > now) {
      try {
        await mod.scheduleNotificationAsync({
          identifier: eveningId(task.id),
          content: {
            title: '⚠️ まだ未完了の課題があります',
            body: label,
            data: { type: 'deadline_evening', todoId: task.id },
            sound: 'default',
            ...(Platform.OS === 'android' ? { channelId: 'deadlines' } : {}),
          },
          trigger: {
            type: mod.SchedulableTriggerInputTypes.DATE,
            date: eveningTime,
          } as any,
        });
        scheduledCount++;
      } catch { /* skip */ }
    }
  }

  return scheduledCount;
}
