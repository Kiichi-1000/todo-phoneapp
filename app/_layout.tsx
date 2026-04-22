import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConsentScreen from '@/components/ConsentScreen';
import 'react-native-url-polyfill/auto';
import {
  requestNotificationPermissions,
  addNotificationReceivedListener,
  addNotificationResponseListener,
} from '@/lib/notifications';

const CONSENT_KEY = 'tosche_consent_accepted';

function RootNavigator() {
  const { session, loading, isPasswordRecovery } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const notificationListenerRef = useRef<any>(null);
  const responseListenerRef = useRef<any>(null);
  const [consentAccepted, setConsentAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CONSENT_KEY).then(value => {
      setConsentAccepted(value === 'true');
    });
  }, []);

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

  useEffect(() => {
    if (loading || consentAccepted !== true) return;

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
  }, [session, loading, isPasswordRecovery, consentAccepted]);

  if (consentAccepted === null || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a1a2e" />
      </View>
    );
  }

  if (!consentAccepted) {
    return <ConsentScreen onAccept={handleAcceptConsent} />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="support" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
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
