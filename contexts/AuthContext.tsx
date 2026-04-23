import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signInWithApple: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  reauthenticateWithPassword: (password: string) => Promise<{ error: string | null }>;
  reauthenticateWithProvider: (provider: 'google' | 'apple') => Promise<{ error: string | null }>;
  deleteAccount: () => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  isPasswordRecovery: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signInWithGoogle: async () => ({ error: null }),
  signInWithApple: async () => ({ error: null }),
  signOut: async () => {},
  reauthenticateWithPassword: async () => ({ error: null }),
  reauthenticateWithProvider: async () => ({ error: null }),
  deleteAccount: async () => ({ error: null }),
  resetPassword: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  isPasswordRecovery: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const isPasswordRecoveryRef = useRef(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        isPasswordRecoveryRef.current = true;
        setIsPasswordRecovery(true);
      }
      setSession(s);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    try {
      setSession(null);
      await supabase.auth.signOut();
    } catch {
      setSession(null);
    }
  };

  const reauthenticateWithPassword = async (password: string) => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    const email = currentSession?.user?.email;
    if (!email) {
      return { error: 'メールアドレスが取得できません。再ログインしてください。' };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: 'パスワードが正しくありません' };
    }
    return { error: null };
  };

  const reauthenticateWithProvider = async (provider: 'google' | 'apple') => {
    if (provider === 'google') {
      return signInWithGoogle();
    }
    return signInWithApple();
  };

  const deleteAccount = async () => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        return { error: 'セッションが無効です。再ログインしてください。' };
      }

      const { data, error } = await supabase.functions.invoke('delete-account');

      if (error) {
        const message =
          (data as { error?: string } | null)?.error ||
          error.message ||
          'アカウントの削除に失敗しました';
        return { error: message };
      }

      await supabase.auth.signOut().catch(() => {});
      setSession(null);
      return { error: null };
    } catch (e: any) {
      return { error: e?.message || 'アカウントの削除に失敗しました' };
    }
  };

  const signInWithGoogle = async () => {
    try {
      const redirectUrl = Linking.createURL('/(auth)/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });
      if (error) return { error: error.message };
      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        if (result.type === 'success' && result.url) {
          const url = new URL(result.url);
          const params = new URLSearchParams(url.hash.substring(1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          }
        }
      }
      return { error: null };
    } catch (e: any) {
      return { error: e.message || 'Google認証に失敗しました' };
    }
  };

  const signInWithApple = async () => {
    try {
      if (Platform.OS === 'web') {
        const redirectUrl = `${window.location.origin}/(auth)/callback`;
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: {
            redirectTo: redirectUrl,
          },
        });
        if (error) return { error: error.message };
        return { error: null };
      }

      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        return { error: 'Apple認証からトークンを取得できませんでした' };
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error) return { error: error.message };
      return { error: null };
    } catch (e: any) {
      if (e.code === 'ERR_REQUEST_CANCELED') {
        return { error: null };
      }
      return { error: e.message || 'Apple認証に失敗しました' };
    }
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = Platform.OS === 'web'
      ? `${window.location.origin}/(auth)/reset-password`
      : Linking.createURL('/(auth)/reset-password');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    isPasswordRecoveryRef.current = false;
    setIsPasswordRecovery(false);
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        signInWithApple,
        signOut,
        reauthenticateWithPassword,
        reauthenticateWithProvider,
        deleteAccount,
        resetPassword,
        updatePassword,
        isPasswordRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
