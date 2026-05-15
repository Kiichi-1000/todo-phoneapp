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
    supabase.auth.getSession().then(({ data: { session: s }, error }) => {
      if (error) {
        // リフレッシュトークンが無効な場合はストレージから削除してサインアウト
        supabase.auth.signOut().catch(() => {});
        setSession(null);
      } else {
        setSession(s);
      }
      setLoading(false);
    }).catch((err) => {
      setSession(null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        isPasswordRecoveryRef.current = true;
        setIsPasswordRecovery(true);
      }
      // トークンリフレッシュ失敗時は強制サインアウト
      if (event === 'TOKEN_REFRESHED' && !s) {
        supabase.auth.signOut().catch(() => {});
        setSession(null);
        setLoading(false);
        return;
      }
      if ((event as string) === 'SIGNED_OUT' || (event as string) === 'USER_DELETED') {
        setSession(null);
        isPasswordRecoveryRef.current = false;
        setIsPasswordRecovery(false);
        setLoading(false);
        return;
      }
      setSession(s);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Supabase の onAuthStateChange は通常 setSession を反映してくれるが、
  // ごく稀に (特に Cold start 直後の Google/Apple OAuth で) 発火が遅れる/取りこぼされる
  // ケースがあり、その結果「ログイン成功したのにアプリ側の user が null のまま
  // タブ画面に到達 → データが読み込まれない → アプリ再起動でやっと session が
  // 反映される」というバグになる。各 sign-in メソッドの末尾で明示的に
  // getSession() を呼び、強制的に React 側 state を同期しておく。
  const forceSyncSession = async () => {
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s);
      setLoading(false);
    } catch {
      // 取得失敗時は触らない (onAuthStateChange に委ねる)
    }
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    await forceSyncSession();
    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    await forceSyncSession();
    return { error: null };
  };

  const signOut = async () => {
    try {
      setSession(null);
      isPasswordRecoveryRef.current = false;
      setIsPasswordRecovery(false);
      await supabase.auth.signOut();
    } catch {
      setSession(null);
      isPasswordRecoveryRef.current = false;
      setIsPasswordRecovery(false);
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
      if (!data?.url) {
        return { error: 'Google認証の初期化に失敗しました' };
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      if (result.type !== 'success' || !result.url) {
        if (result.type === 'cancel' || result.type === 'dismiss') {
          return { error: null };
        }
        return { error: 'Google認証が完了しませんでした' };
      }

      const callbackUrl = new URL(result.url);

      // PKCE flow (Supabase v2 default): authorization code in query params
      const code = callbackUrl.searchParams.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) return { error: exchangeError.message };
        await forceSyncSession();
        return { error: null };
      }

      // Implicit flow fallback: tokens in URL hash
      const hash = callbackUrl.hash.startsWith('#') ? callbackUrl.hash.substring(1) : callbackUrl.hash;
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) return { error: sessionError.message };
        await forceSyncSession();
        return { error: null };
      }

      const oauthError = callbackUrl.searchParams.get('error_description')
        ?? callbackUrl.searchParams.get('error')
        ?? hashParams.get('error_description')
        ?? hashParams.get('error');
      return { error: oauthError ? decodeURIComponent(oauthError) : 'Google認証のレスポンスを解析できませんでした' };
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
      await forceSyncSession();
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
