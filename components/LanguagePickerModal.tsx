import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, SafeAreaView } from 'react-native';
import { Check, Globe } from 'lucide-react-native';
import { useLanguage, Language } from '@/contexts/LanguageContext';

interface Props {
  visible: boolean;
  onComplete: () => void;
}

// #region agent log
const __dbgLPM = (location: string, message: string, data: Record<string, unknown> = {}) => {
  try {
    console.log('[DEBUG-b9137e]', location, message, data);
  } catch {}
  try {
    fetch('http://127.0.0.1:7260/ingest/233848d3-ee49-4e11-b914-cf2c146394ee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'b9137e' },
      body: JSON.stringify({ sessionId: 'b9137e', hypothesisId: 'H6+H7+H8', location, message, data, timestamp: Date.now() }),
    }).catch(() => {});
  } catch {}
};
// #endregion

export default function LanguagePickerModal({ visible, onComplete }: Props) {
  // #region agent log
  __dbgLPM('LanguagePickerModal:render', 'function body entered', { visible });
  // #endregion
  const { t, lang, setLang, markLanguageSelected } = useLanguage();
  const [selected, setSelected] = useState<Language>(lang);

  // #region agent log
  useEffect(() => {
    __dbgLPM('LanguagePickerModal:mount', 'mounted', {
      visible,
      lang,
      titleResolved: t('languagePicker.title'),
      continueResolved: t('languagePicker.continue'),
    });
    return () => {
      __dbgLPM('LanguagePickerModal:unmount', 'unmounted', {});
    };
  }, []);
  // #endregion

  const handleContinue = async () => {
    await setLang(selected);
    await markLanguageSelected();
    onComplete();
  };

  const options: { value: Language; label: string }[] = [
    { value: 'ja', label: t('languagePicker.japanese') },
    { value: 'en', label: t('languagePicker.english') },
  ];

  return (
    <Modal visible={visible} animationType="fade" transparent={false}>
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <Globe size={36} color="#3b82f6" />
          </View>
          <Text style={styles.title}>{t('languagePicker.title')}</Text>
          <Text style={styles.subtitle}>{t('languagePicker.subtitle')}</Text>

          <View style={styles.options}>
            {options.map(opt => {
              const active = selected === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => setSelected(opt.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                    {opt.label}
                  </Text>
                  {active && <Check size={20} color="#3b82f6" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.continueBtn} onPress={handleContinue} activeOpacity={0.85}>
            <Text style={styles.continueBtnText}>{t('languagePicker.continue')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 60,
    alignItems: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 36,
  },
  options: {
    width: '100%',
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  optionActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  optionLabelActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: 24,
  },
  continueBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
