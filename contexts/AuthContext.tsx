import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseVerifier } from '@/lib/supabase';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { identifyUser, resetIdentity, track } from '@/lib/posthog';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  // 2FA (email OTP) login flow ---------------------------------------------
  // Verify an email/password pair WITHOUT establishing an app session, and
  // report whether the account has email 2FA enabled. The captured session
  // tokens are returned so the caller can adopt them later (skip path).
  verifyPasswordForLogin: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; twoFactorEnabled: boolean; session: Session | null }>;
  // Adopt a previously-verified session into the main client (no-2FA / "後で").
  adoptSession: (session: Session) => Promise<{ error: string | null }>;
  // Send a 6-digit email OTP code to the address (existing users only).
  sendEmailOtp: (email: string) => Promise<{ error: string | null }>;
  // Verify the OTP code; on success establishes the app session. When
  // enroll=true, also flips the user's two_factor_enabled flag on.
  completeOtpLogin: (
    email: string,
    token: string,
    enroll: boolean,
  ) => Promise<{ error: string | null }>;
  // Enable/disable email 2FA for the currently authenticated user.
  setTwoFactorEnabled: (enabled: boolean) => Promise<{ error: string | null }>;
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
  verifyPasswordForLogin: async () => ({ error: null, twoFactorEnabled: false, session: null }),
  adoptSession: async () => ({ error: null }),
  sendEmailOtp: async () => ({ error: null }),
  completeOtpLogin: async () => ({ error: null }),
  setTwoFactorEnabled: async () => ({ error: null }),
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

  // Analytics: identify the Supabase user to PostHog whenever a session is
  // present; reset identity on sign-out. Email is intentionally NOT sent —
  // only the opaque uid plus platform string.
  const prevUidRef = useRef<string | null>(null);
  useEffect(() => {
    const uid = session?.user?.id ?? null;
    const prevUid = prevUidRef.current;
    if (uid && uid !== prevUid) {
      identifyUser(uid, { platform: Platform.OS }).catch(() => {});
      // Only fire the sign-in event on a real user transition, not on
      // every session-object reference change.
      if (!prevUid) {
        track('sign_in_success', { platform: Platform.OS }).catch(() => {});
      }
    } else if (!uid && prevUid) {
      track('sign_out').catch(() => {});
      resetIdentity().catch(() => {});
    }
    prevUidRef.current = uid;
  }, [session?.user?.id]);

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

  // --- 2FA (email OTP) login flow ------------------------------------------
  // Verify the password on the throwaway verifier client so the main client's
  // auth state (and therefore the RootNavigator) is not disturbed. Reading
  // user_metadata.two_factor_enabled from the returned user tells us whether a
  // second factor is required.
  const verifyPasswordForLogin = async (email: string, password: string) => {
    try {
      const { data, error } = await supabaseVerifier.auth.signInWithPassword({ email, password });
      if (error) {
        return { error: error.message, twoFactorEnabled: false, session: null };
      }
      const twoFactorEnabled = data.user?.user_metadata?.two_factor_enabled === true;
      const captured = data.session ?? null;
      // Drop ONLY the verifier's in-memory session. scope:'local' must be used
      // here — the default global sign-out would revoke the user's refresh
      // tokens across ALL their devices and invalidate the tokens we just
      // captured for the skip ("後で") path.
      await supabaseVerifier.auth.signOut({ scope: 'local' }).catch(() => {});
      return { error: null, twoFactorEnabled, session: captured };
    } catch (e: any) {
      return { error: e?.message ?? '認証に失敗しました', twoFactorEnabled: false, session: null };
    }
  };

  // No 2FA / "後で": promote the already-verified tokens into the main client.
  const adoptSession = async (sess: Session) => {
    try {
      const { error } = await supabase.auth.setSession({
        access_token: sess.access_token,
        refresh_token: sess.refresh_token,
      });
      if (error) return { error: error.message };
      await forceSyncSession();
      return { error: null };
    } catch (e: any) {
      return { error: e?.message ?? 'セッションの確立に失敗しました' };
    }
  };

  // Email OTP for existing users (no new account created).
  const sendEmailOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  // Verify the emailed 6-digit code. On success the main client gets a real
  // session. When enrolling, persist the two_factor_enabled flag before
  // syncing React state so the next login already requires the second factor.
  const completeOtpLogin = async (email: string, token: string, enroll: boolean) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: token.trim(), type: 'email' });
    if (error) return { error: error.message };
    if (enroll) {
      await supabase.auth.updateUser({ data: { two_factor_enabled: true } }).catch(() => {});
    }
    await forceSyncSession();
    return { error: null };
  };

  const setTwoFactorEnabled = async (enabled: boolean) => {
    const { error } = await supabase.auth.updateUser({ data: { two_factor_enabled: enabled } });
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
        verifyPasswordForLogin,
        adoptSession,
        sendEmailOtp,
        completeOtpLogin,
        setTwoFactorEnabled,
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
