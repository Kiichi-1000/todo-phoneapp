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
import { supabase } from '@/lib/supabase';

// #region agent log
const __dbg_b9137e = (location: string, message: string, data: Record<string, unknown> = {}, hypothesisId = '') => {
  try {
    console.log('[DEBUG-b9137e]', location, message, data);
  } catch {}
  try {
    fetch('http://127.0.0.1:7260/ingest/233848d3-ee49-4e11-b914-cf2c146394ee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'b9137e' },
      body: JSON.stringify({ sessionId: 'b9137e', hypothesisId, location, message, data, timestamp: Date.now() }),
    }).catch(() => {});
  } catch {}
};
__dbg_b9137e('app/_layout.tsx:module-top', 'JS module loaded', {}, 'H4');
// #endregion

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
    // #region agent log
    __dbg_b9137e('app/_layout.tsx:RootNavigator-mount', 'AsyncStorage.getItem(CONSENT_KEY) start', {}, 'H1');
    // #endregion
    AsyncStorage.getItem(CONSENT_KEY).then(value => {
      // #region agent log
      __dbg_b9137e('app/_layout.tsx:RootNavigator-mount', 'AsyncStorage.getItem resolved', { value, accepted: value === 'true' }, 'H1');
      // #endregion
      setConsentAccepted(value === 'true');
    }).catch((err) => {
      // #region agent log
      __dbg_b9137e('app/_layout.tsx:RootNavigator-mount', 'AsyncStorage.getItem rejected', { err: String(err) }, 'H1');
      // #endregion
      setConsentAccepted(false);
    });
  }, []);

  // #region agent log
  useEffect(() => {
    __dbg_b9137e(
      'app/_layout.tsx:RootNavigator-render',
      'state snapshot',
      {
        loading,
        hasSession: !!session,
        isPasswordRecovery,
        langLoaded,
        hasSelectedLanguage,
        consentAccepted,
        segments: segments.join('/'),
      },
      'H1+H2+H3'
    );
  }, [loading, session, isPasswordRecovery, langLoaded, hasSelectedLanguage, consentAccepted, segments]);
  // #endregion

  const handleAcceptConsent = async () => {
    await AsyncStorage.setItem(CONSENT_KEY, 'true');
    setConsentAccepted(true);
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;

    requestNotificationPermissions();

    notificationListenerRef.current = addNotificationReceivedListener(() => {});
    responseListenerRef.current = addNotificationResponseListener(() => {
      router.push('/(tabs)/workspace');
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

  useEffect(() => {
    if (loading || !langLoaded || !hasSelectedLanguage || consentAccepted !== true) return;

    if (isPasswordRecovery && session) {
      router.replace('/(auth)/reset-password');
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 0);
    } else if (session && inAuthGroup) {
      const inResetPassword = (segments as string[])[1] === 'reset-password';
      if (!inResetPassword) {
        router.replace('/(tabs)/workspace');
      }
    }
  }, [session, loading, isPasswordRecovery, consentAccepted, langLoaded, hasSelectedLanguage]);

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
        {/* paywall は modal だが、下スワイプ閉じを無効化。
            理由: スワイプで閉じると handleClose が走らず、元タブに戻って useFocusEffect が
            再度 paywall を push する無限ループになる。X ボタンで明示的に閉じてもらう。 */}
        <Stack.Screen
          name="paywall"
          options={{ presentation: 'modal', gestureEnabled: false }}
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LanguageProvider>
          <AuthProvider>
            <FourGridSkinProvider>
              <RootNavigator />
            </FourGridSkinProvider>
          </AuthProvider>
        </LanguageProvider>
      </SafeAreaProvider>
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
