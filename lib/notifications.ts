import { Platform } from 'react-native';
import { NativeModulesProxy } from 'expo-modules-core';

let Notifications: typeof import('expo-notifications') | null = null;
let notificationModuleChecked = false;
let notificationHandlerInitialized = false;
const notificationsEnabled = false;

function hasNativeNotificationSupport() {
  if (!notificationsEnabled) return false;
  if (Platform.OS === 'web') return false;
  const modules = NativeModulesProxy as Record<string, unknown>;
  return Boolean(modules?.ExpoPushTokenManager);
}

async function getNotifications() {
  if (notificationModuleChecked) return Notifications;
  if (Notifications) return Notifications;
  if (Platform.OS === 'web' || !hasNativeNotificationSupport()) {
    notificationModuleChecked = true;
    return null;
  }

  try {
    const mod = require('expo-notifications') as typeof import('expo-notifications');

    try {
      await mod.getPermissionsAsync();
    } catch {
      Notifications = null;
      notificationModuleChecked = true;
      return null;
    }

    Notifications = mod;
    notificationModuleChecked = true;
    return Notifications;
  } catch {
    Notifications = null;
    notificationModuleChecked = true;
    return null;
  }
}

async function ensureNotificationHandlerInitialized() {
  if (notificationHandlerInitialized || Platform.OS === 'web') return;

  const mod = await getNotifications();
  if (!mod) return;

  try {
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationHandlerInitialized = true;
  } catch {
    notificationHandlerInitialized = false;
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  await ensureNotificationHandlerInitialized();

  const mod = await getNotifications();
  if (!mod) return false;

  let finalStatus: import('expo-notifications').NotificationPermissionsStatus['status'];

  try {
    const { status: existingStatus } = await mod.getPermissionsAsync();
    finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await mod.requestPermissionsAsync();
      finalStatus = status;
    }
  } catch {
    return false;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  if (Platform.OS === 'android') {
    try {
      await mod.setNotificationChannelAsync('reminders', {
        name: 'リマインダー',
        importance: mod.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    } catch {
      return false;
    }
  }

  return true;
}

export async function scheduleReminderNotification(
  todoId: string,
  content: string,
  reminderAt: Date
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  await ensureNotificationHandlerInitialized();

  const mod = await getNotifications();
  if (!mod) return null;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  const now = new Date();
  const secondsUntil = Math.floor((reminderAt.getTime() - now.getTime()) / 1000);

  if (secondsUntil <= 0) return null;

  try {
    const notificationId = await mod.scheduleNotificationAsync({
      content: {
        title: 'タスクリマインダー',
        body: content,
        data: { todoId },
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
      },
      trigger: {
        type: mod.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntil,
        repeats: false,
      },
    });

    return notificationId;
  } catch {
    return null;
  }
}

export async function cancelReminderNotification(notificationId: string): Promise<void> {
  if (Platform.OS === 'web') return;

  const mod = await getNotifications();
  if (!mod) return;

  try {
    await mod.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.error('Error cancelling notification:', error);
  }
}

export function addNotificationResponseListener(
  callback: (response: any) => void
) {
  if (Platform.OS === 'web' || !hasNativeNotificationSupport()) {
    return { remove: () => {} };
  }
  try {
    const mod = require('expo-notifications');
    return mod.addNotificationResponseReceivedListener(callback);
  } catch {
    return { remove: () => {} };
  }
}

export function addNotificationReceivedListener(
  callback: (notification: any) => void
) {
  if (Platform.OS === 'web' || !hasNativeNotificationSupport()) {
    return { remove: () => {} };
  }
  try {
    const mod = require('expo-notifications');
    return mod.addNotificationReceivedListener(callback);
  } catch {
    return { remove: () => {} };
  }
}
