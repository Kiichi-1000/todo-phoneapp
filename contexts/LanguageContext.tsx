import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import ja from '@/locales/ja.json';
import en from '@/locales/en.json';

export type Language = 'ja' | 'en';

const STORAGE_KEY_LANG = 'app_language';
const STORAGE_KEY_LANG_SET = 'app_language_selected';

const dictionaries: Record<Language, Record<string, any>> = { ja, en };

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
  hasSelectedLanguage: boolean;
  markLanguageSelected: () => Promise<void>;
  loaded: boolean;
}

const defaultContext: LanguageContextValue = {
  lang: 'ja',
  setLang: async () => {},
  t: (key: string) => key,
  hasSelectedLanguage: false,
  markLanguageSelected: async () => {},
  loaded: false,
};

const LanguageContext = createContext<LanguageContextValue>(defaultContext);

function lookup(dict: Record<string, any>, key: string): string | undefined {
  const parts = key.split('.');
  let cur: any = dict;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) {
      cur = cur[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = params[k];
    return v === undefined || v === null ? `{{${k}}}` : String(v);
  });
}

async function persistLanguageToDb(lang: Language) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('user_settings')
      .update({ preferred_language: lang })
      .eq('user_id', user.id);
  } catch {}
}

async function fetchLanguageFromDb(): Promise<Language | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('user_settings')
      .select('preferred_language')
      .eq('user_id', user.id)
      .maybeSingle() as { data: { preferred_language: Language } | null; error: any };
    if (error || !data) return null;
    return data.preferred_language === 'en' ? 'en' : 'ja';
  } catch {
    return null;
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('ja');
  const [hasSelectedLanguage, setHasSelectedLanguage] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storedLang, selectedFlag] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_LANG),
          AsyncStorage.getItem(STORAGE_KEY_LANG_SET),
        ]);
        if (cancelled) return;
        if (storedLang === 'ja' || storedLang === 'en') {
          setLangState(storedLang);
        }
        setHasSelectedLanguage(selectedFlag === '1');
      } catch {
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
      if (!session) return;
      const dbLang = await fetchLanguageFromDb();
      if (!dbLang) return;
      setLangState(dbLang);
      try {
        await AsyncStorage.setItem(STORAGE_KEY_LANG, dbLang);
      } catch {}
    });
    return () => subscription.unsubscribe();
  }, []);

  const setLang = useCallback(async (next: Language) => {
    setLangState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_LANG, next);
    } catch {}
    persistLanguageToDb(next);
  }, []);

  const markLanguageSelected = useCallback(async () => {
    setHasSelectedLanguage(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_LANG_SET, '1');
    } catch {}
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const primary = lookup(dictionaries[lang], key);
      if (primary !== undefined) return interpolate(primary, params);
      const fallback = lookup(dictionaries.ja, key);
      if (fallback !== undefined) return interpolate(fallback, params);
      return key;
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, hasSelectedLanguage, markLanguageSelected, loaded }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useT() {
  return useContext(LanguageContext).t;
}
