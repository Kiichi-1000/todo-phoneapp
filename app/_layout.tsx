import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { FourGridSkinProvider } from '@/lib/fourGridSkin';
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConsentScreen from '@/components/ConsentScreen';
import LanguagePickerModal from '@/components/LanguagePickerModal';
import 'react-native-url-polyfill/auto';
import {
  requestNotificationPermissions,
  addNotificationReceivedListener,
  addNotificationResponseListener,
} from '@/lib/notifications';
import { scheduleGoalReminders } from '@/lib/goalReminders';
import { scheduleDeadlineNotifications } from '@/lib/deadlineNotifications';
import { supabase } from '@/lib/supabase';
import { PostHogProvider } from 'posthog-react-native';
import { POSTHOG_API_KEY, POSTHOG_HOST, initPostHog } from '@/lib/posthog';


const CONSENT_KEY = 'tosche_consent_accepted';

function RootNavigator() {
  const { session, loading, isPasswordRecovery } = useAuth();
  const { hasSelectedLanguage, loaded: langLoaded, markLanguageSelected } = useLanguage();
  const segments = useSegments();
  const router = useRouter();
  const notificationListenerRef = useRef<any>(null);
  const responseListenerRef = useRef<any>(null);
  const [consentAccepted, setConsentAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CONSENT_KEY).then(value => {
      setConsentAccepted(value === 'true');
    }).catch((err) => {
      setConsentAccepted(false);
    });
  }, []);


  const handleAcceptConsent = async () => {
    await AsyncStorage.setItem(CONSENT_KEY, 'true');
    setConsentAccepted(true);
    // Async, fire-and-forget — analytics failure must never block consent.
    import('@/lib/posthog')
      .then(({ track }) => track('consent_accepted'))
      .catch(() => {});
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;

    requestNotificationPermissions();

    notificationListenerRef.current = addNotificationReceivedListener(() => {});
    responseListenerRef.current = addNotificationResponseListener((response: any) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.type === 'deadline_morning' || data?.type === 'deadline_evening') {
        router.push('/deadlines');
      } else {
        router.push('/(tabs)/workspace');
      }
    });

    return () => {
      if (notificationListenerRef.current) {
        notificationListenerRef.current.remove();
      }
      if (responseListenerRef.current) {
        responseListenerRef.current.remove();
      }
    };
  }, []);

  // Refresh goal reminders when the user logs in. Re-runs on each session
  // because settings (enabled / hour) may have changed since last app open.
  // Failures are silent — reminders are nice-to-have, not critical path.
  useEffect(() => {
    if (Platform.OS === 'web' || !session) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('user_settings')
          .select('goal_reminders_enabled, goal_reminder_hour')
          .limit(1)
          .maybeSingle() as {
            data: { goal_reminders_enabled: boolean; goal_reminder_hour: number } | null;
          };
        const enabled = data?.goal_reminders_enabled ?? true;
        const hour = data?.goal_reminder_hour ?? 9;
        await scheduleGoalReminders({ enabled, hour });
      } catch {
        // ignore
      }
    })();
  }, [session]);

  // Schedule deadline notifications (朝8時＋夜20時) on session start.
  useEffect(() => {
    if (Platform.OS === 'web' || !session) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('todos')
          .select('id, content, due_date, course_name')
          .eq('user_id', session.user.id)
          .eq('is_completed', false)
          .not('due_date', 'is', null);
        if (data && data.length > 0) {
          await scheduleDeadlineNotifications(data as any);
        }
      } catch {
        // ignore — deadline notifications are nice-to-have
      }
    })();
  }, [session]);

  useEffect(() => {
    if (loading || !langLoaded || !hasSelectedLanguage || consentAccepted !== true) return;

    if (isPasswordRecovery && session) {
      router.replace('/(auth)/reset-password');
      return;
    }

    const seg0 = segments[0];
    const inAuthGroup = seg0 === '(auth)';
    // segments === [] (= seg0 が undefined) はまだどのルートグループにも解決されて
    // いない「ルート」状態。Android では起動直後にこの状態が続くことがあり、その間に
    // セッションがあっても (inAuthGroup が false のため) タブへ遷移できず「ログイン
    // 済みなのにログイン画面で固まる」バグになっていた。root も遷移対象に含め、
    // paywall / statistics / support などの認証済み単体画面 (seg0 がそれら) は対象外と
    // することで、両 OS で確実にルーティングしつつリダイレクトループを防ぐ。
    const atRoot = seg0 === undefined;

    if (!session) {
      // 未認証でログイングループ外にいるならログインへ送る (root 含む)。
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else {
      // 認証済み: 認証グループ内 or 未解決(root) のときだけタブへ送る。
      if (inAuthGroup || atRoot) {
        const inResetPassword = (segments as string[])[1] === 'reset-password';
        if (!inResetPassword) {
          router.replace('/(tabs)/workspace');
        }
      }
    }
  }, [session, loading, isPasswordRecovery, consentAccepted, langLoaded, hasSelectedLanguage, segments]);

  const showLoadingOverlay = !langLoaded || consentAccepted === null;
  const showLanguagePicker = langLoaded && !hasSelectedLanguage;
  const showConsent = langLoaded && hasSelectedLanguage && consentAccepted === false;
  const showSessionLoading =
    langLoaded && hasSelectedLanguage && consentAccepted === true && loading;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="support" />
        {/* paywall は modal。ヘッダー左の「閉じる」ボタン、RC Paywall 内蔵 X、下スワイプ、
            の 3 経路すべてから dismiss 可能。onDismiss が handleClose を呼んで
            /(tabs)/workspace に router.replace する設計のため、無限ループの心配はない
            (= router.back() ではなく router.replace なので、元タブ AI の useFocusEffect は再判定されない)。
            ユーザーが「閉じられない」と感じるリスクを最小化するため、swipe 含め全経路を有効化。 */}
        <Stack.Screen
          name="paywall"
          options={{ presentation: 'modal', gestureEnabled: true }}
        />
        <Stack.Screen
          name="statistics"
          options={{
            headerShown: true,
            title: '統計',
            headerBackTitle: '戻る',
            headerTintColor: '#0f172a',
            headerTitleStyle: { fontWeight: '700', fontSize: 17 },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen name="goal-coach" />
        <Stack.Screen name="claude-integration" />
        <Stack.Screen name="deadlines" />
        <Stack.Screen name="ai-memo" />
        <Stack.Screen name="+not-found" />
      </Stack>

      {showLoadingOverlay && (
        <View style={[StyleSheet.absoluteFill, styles.loadingContainer]} pointerEvents="auto">
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      )}

      {showLanguagePicker && (
        <LanguagePickerModal visible={true} onComplete={markLanguageSelected} />
      )}

      {showConsent && <ConsentScreen onAccept={handleAcceptConsent} />}

      {showSessionLoading && (
        <View style={[StyleSheet.absoluteFill, styles.loadingContainer]} pointerEvents="auto">
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      )}

      <StatusBar style="dark" backgroundColor="#ffffff" translucent={false} />
    </>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  // Eagerly create the singleton PostHog instance so manual `track()` calls
  // outside the React tree (e.g. webhook reconciliation) work without
  // waiting for the provider to mount.
  useEffect(() => {
    initPostHog().catch(() => {/* analytics-only failure; ignore */});
  }, []);

  const innerTree = (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <FourGridSkinProvider>
            <RootNavigator />
          </FourGridSkinProvider>
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {POSTHOG_API_KEY ? (
        <PostHogProvider
          apiKey={POSTHOG_API_KEY}
          options={{
            host: POSTHOG_HOST,
            enableSessionReplay: true,
            sessionReplayConfig: {
              maskAllTextInputs: true,
              maskAllImages: false,
              maskAllSandboxedViews: false,
              throttleDelayMs: 1000,
            },
            captureAppLifecycleEvents: true,
          }}
          autocapture={{
            captureScreens: true,
            captureTouches: true,
          }}
        >
          {innerTree}
        </PostHogProvider>
      ) : (
        innerTree
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f0',
  },
});
