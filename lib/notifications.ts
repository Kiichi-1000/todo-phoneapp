import { Platform } from 'react-native';

let Notifications: typeof import('expo-notifications') | null = null;

async function getNotifications() {
  if (Notifications) return Notifications;
  if (Platform.OS === 'web') return null;
  try {
    Notifications = require('expo-notifications');
    return Notifications;
  } catch {
    return null;
  }
}

(async () => {
  if (Platform.OS === 'web') return;
  const mod = await getNotifications();
  if (!mod) return;
  mod.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
})();

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const mod = await getNotifications();
  if (!mod) return false;

  const { status: existingStatus } = await mod.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await mod.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  if (Platform.OS === 'android') {
    await mod.setNotificationChannelAsync('reminders', {
      name: 'リマインダー',
      importance: mod.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  return true;
}

export async function scheduleReminderNotification(
  todoId: string,
  content: string,
  reminderAt: Date
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const mod = await getNotifications();
  if (!mod) return null;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  const now = new Date();
  const secondsUntil = Math.floor((reminderAt.getTime() - now.getTime()) / 1000);

  if (secondsUntil <= 0) return null;

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
  if (Platform.OS === 'web') return { remove: () => {} };
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
  if (Platform.OS === 'web') return { remove: () => {} };
  try {
    const mod = require('expo-notifications');
    return mod.addNotificationReceivedListener(callback);
  } catch {
    return { remove: () => {} };
  }
}
