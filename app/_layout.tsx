import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import {
  requestNotificationPermissions,
  addNotificationReceivedListener,
  addNotificationResponseListener,
} from '@/lib/notifications';

function RootNavigator() {
  const { session, loading, isPasswordRecovery } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const notificationListenerRef = useRef<any>(null);
  const responseListenerRef = useRef<any>(null);

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
    if (loading) return;

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
      const inResetPassword = segments[1] === 'reset-password';
      if (!inResetPassword) {
        router.replace('/(tabs)/workspace');
      }
    }
  }, [session, loading, isPasswordRecovery]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a1a2e" />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
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
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
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
