import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  Platform,
  Switch,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Download, Trash2, Info, CircleCheck as CheckCircle2, LogOut, CalendarSync, KeyRound, ChevronRight, UserX, Globe, Sparkles, MessageSquare, Brain, ChartBar as BarChart3, Target } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { getLegalDocumentsHubUrl } from '@/lib/legalUrls';
import { useAuth } from '@/contexts/AuthContext';
import {
  WorkspaceType,
  UserSettings,
  GridArea,
  FourGridTodoBorderColors,
  DEFAULT_FOUR_GRID_TODO_BORDER_COLORS,
} from '@/types/database';
import { DeleteAccountModal } from '@/components/DeleteAccountModal';
import { useFourGridSkin, FourGridSkin } from '@/lib/fourGridSkin';
import { useLanguage, Language } from '@/contexts/LanguageContext';
import FourGridColorEditor from '@/components/FourGridColorEditor';
// PromoCodeModal は App Store ガイドライン 3.1.1 対応で削除済み (App Store 版)

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut, updatePassword } = useAuth();
  const { skin: fourGridSkin, setSkin: setFourGridSkin } = useFourGridSkin();
  const { t, lang, setLang } = useLanguage();

  const WORKSPACE_TYPES: { type: WorkspaceType; label: string; description: string }[] = [
    { type: 'four_grid', label: t('settings.workspaceFourGrid'), description: t('settings.workspaceFourGridDesc') },
    { type: 'individual', label: t('settings.workspaceIndividual'), description: t('settings.workspaceIndividualDesc') },
    { type: 'note', label: t('settings.workspaceNote'), description: t('settings.workspaceNoteDesc') },
  ];

  const FOUR_GRID_SKINS: { value: FourGridSkin; label: string; description: string }[] = [
    { value: 'postit', label: t('settings.skinPostit'), description: t('settings.skinPostitDesc') },
    { value: 'whiteboard', label: t('settings.skinWhiteboard'), description: t('settings.skinWhiteboardDesc') },
  ];
  const [isExporting, setIsExporting] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [selectedType, setSelectedType] = useState<WorkspaceType>('four_grid');
  const [todoSyncEnabled, setTodoSyncEnabled] = useState(true);
  const [goalRemindersEnabled, setGoalRemindersEnabled] = useState(true);
  const [goalReminderHour, setGoalReminderHour] = useState(9);
  const [borderColors, setBorderColors] = useState<FourGridTodoBorderColors>(DEFAULT_FOUR_GRID_TODO_BORDER_COLORS);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  // promoModalVisible state は App Store 版で削除済み (3.1.1 対応)
  const [chatStats, setChatStats] = useState<{ conversations: number; memory: number }>({
    conversations: 0,
    memory: 0,
  });

  useEffect(() => {
    loadSettings();
    loadChatStats();
  }, []);

  const loadChatStats = async () => {
    if (!user) return;
    try {
      const [convRes, memRes] = await Promise.all([
        supabase
          .from('ai_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase
          .from('user_memory')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),
      ]);
      setChatStats({
        conversations: convRes.count ?? 0,
        memory: memRes.count ?? 0,
      });
    } catch (e) {
      // table may not exist yet on older deployments — silently ignore
    }
  };

  const handleDeleteChatHistory = () => {
    Alert.alert(
      'チャット履歴を削除',
      `保存されている ${chatStats.conversations} 件の会話をすべて削除します。記憶（メモリ）は残ります。よろしいですか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            const { error } = await supabase
              .from('ai_conversations')
              .delete()
              .eq('user_id', user.id);
            if (error) {
              Alert.alert('エラー', error.message);
            } else {
              setChatStats((s) => ({ ...s, conversations: 0 }));
              Alert.alert('削除しました', 'チャット履歴をすべて削除しました。');
            }
          },
        },
      ],
    );
  };

  const handleDeleteMemory = () => {
    Alert.alert(
      'AIの記憶を削除',
      `AIが覚えている ${chatStats.memory} 件のメモリをすべて削除します。次回以降はゼロから学習し直します。よろしいですか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            const { error } = await supabase
              .from('user_memory')
              .delete()
              .eq('user_id', user.id);
            if (error) {
              Alert.alert('エラー', error.message);
            } else {
              setChatStats((s) => ({ ...s, memory: 0 }));
              Alert.alert('削除しました', 'AIの記憶をすべてリセットしました。');
            }
          },
        },
      ],
    );
  };

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .limit(1)
        .maybeSingle() as { data: UserSettings | null; error: any };

      if (error) throw error;

      if (data) {
        setSettings(data);
        setSelectedType(data.default_workspace_type);
        setTodoSyncEnabled(data.todo_schedule_sync ?? true);
        setBorderColors(data.four_grid_todo_border_colors ?? DEFAULT_FOUR_GRID_TODO_BORDER_COLORS);
        setGoalRemindersEnabled(data.goal_reminders_enabled ?? true);
        setGoalReminderHour(data.goal_reminder_hour ?? 9);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const toggleTodoSync = async (value: boolean) => {
    if (!settings) return;
    try {
      const { error } = await supabase
        .from('user_settings')
        .update({ todo_schedule_sync: value })
        .eq('id', settings.id);
      if (error) throw error;
      setTodoSyncEnabled(value);
    } catch (error) {
      console.error('Error updating sync setting:', error);
      Alert.alert(t('common.error'), t('settings.settingUpdateError'));
    }
  };

  const showTodoSyncInfo = () => {
    Alert.alert(t('settings.todoSyncTitle'), t('settings.todoSyncBody'));
  };

  const toggleGoalReminders = async (value: boolean) => {
    if (!settings) return;
    try {
      const { error } = await supabase
        .from('user_settings')
        .update({ goal_reminders_enabled: value })
        .eq('id', settings.id);
      if (error) throw error;
      setGoalRemindersEnabled(value);
      // Reschedule (or cancel) immediately
      const { scheduleGoalReminders } = await import('@/lib/goalReminders');
      await scheduleGoalReminders({ enabled: value, hour: goalReminderHour });
    } catch (error) {
      console.error('Error updating goal reminder setting:', error);
      Alert.alert(t('common.error'), t('settings.settingUpdateError'));
    }
  };

  const handleGoalReminderHourChange = async (hour: number) => {
    if (!settings) return;
    try {
      const { error } = await supabase
        .from('user_settings')
        .update({ goal_reminder_hour: hour })
        .eq('id', settings.id);
      if (error) throw error;
      setGoalReminderHour(hour);
      const { scheduleGoalReminders } = await import('@/lib/goalReminders');
      await scheduleGoalReminders({ enabled: goalRemindersEnabled, hour });
    } catch (error) {
      console.error('Error updating reminder hour:', error);
      Alert.alert(t('common.error'), t('settings.settingUpdateError'));
    }
  };

  const showGoalReminderInfo = () => {
    Alert.alert(
      '目標リマインダーについて',
      [
        '以下のタイミングで通知が届きます：',
        '',
        '【月次】',
        '・毎月1日 — 今月の目標を立てる',
        '・毎月末 — 達成度の振り返り',
        '',
        '【半期】',
        '・1月1日・7月1日 — 新しい半期の目標を立てる',
        '・6月30日・12月31日 — 振り返り',
        '',
        '【年次・中長期】',
        '・年始 — 目標設定 / 年末 — 振り返り',
        '',
        '同じ日に複数のリマインドがある場合は1つにまとめて通知します。',
      ].join('\n'),
    );
  };

  const promptGoalReminderHour = () => {
    if (!goalRemindersEnabled) return;
    const options = [6, 7, 8, 9, 10, 12, 18, 20, 21];
    Alert.alert(
      '通知時刻を選択',
      `現在: ${goalReminderHour}:00`,
      [
        ...options.map((h) => ({
          text: `${h.toString().padStart(2, '0')}:00`,
          onPress: () => handleGoalReminderHourChange(h),
        })),
        { text: 'キャンセル', style: 'cancel' as const },
      ],
    );
  };

  const persistBorderColors = async (next: FourGridTodoBorderColors) => {
    if (!settings) return;
    setBorderColors(next);
    try {
      const { error } = await supabase
        .from('user_settings')
        .update({ four_grid_todo_border_colors: next })
        .eq('id', settings.id);
      if (error) throw error;
    } catch (error) {
      console.error('Error updating border colors:', error);
      Alert.alert(t('common.error'), t('settings.settingUpdateError'));
    }
  };

  const updateBorderColor = (area: GridArea, color: string) => {
    persistBorderColors({ ...borderColors, [area]: color });
  };

  const resetBorderColors = () => {
    persistBorderColors(DEFAULT_FOUR_GRID_TODO_BORDER_COLORS);
  };

  const updateWorkspaceType = async (type: WorkspaceType) => {
    if (!settings) return;

    try {
      const { error } = await supabase
        .from('user_settings')
        .update({ default_workspace_type: type })
        .eq('id', settings.id);

      if (error) throw error;

      setSelectedType(type);
      Alert.alert(t('common.success'), t('settings.workspaceTypeChanged'));
    } catch (error) {
      console.error('Error updating workspace type:', error);
      Alert.alert(t('common.error'), t('settings.workspaceTypeChangeError'));
    }
  };

  const exportData = async () => {
    try {
      setIsExporting(true);

      const { data: workspaces, error: workspacesError } = await supabase
        .from('workspaces')
        .select('*') as any;

      if (workspacesError) throw workspacesError;

      const { data: todos, error: todosError } = await supabase
        .from('todos')
        .select('*') as any;

      if (todosError) throw todosError;

      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        workspaces,
        todos,
      };

      const jsonString = JSON.stringify(exportData, null, 2);

      if (Platform.OS === 'web') {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `freetask_backup_${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert(t('common.success'), t('settings.exportSuccess'));
      } else {
        Alert.alert(
          t('settings.exportMobileWipTitle'),
          t('settings.exportMobileWip'),
          [{ text: t('common.ok') }]
        );
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      Alert.alert(t('common.error'), t('settings.exportError'));
    } finally {
      setIsExporting(false);
    }
  };

  const clearAllData = () => {
    Alert.alert(
      t('common.confirm'),
      t('settings.deleteAllDataConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('todos').delete().neq('id', '');
              await supabase.from('workspaces').delete().neq('id', '');
              Alert.alert(t('common.success'), t('settings.deleteAllDataSuccess'));
            } catch (error) {
              console.error('Error clearing data:', error);
              Alert.alert(t('common.error'), t('settings.deleteAllDataError'));
            }
          },
        },
      ]
    );
  };

  const handleChangePassword = async () => {
    setPasswordError(null);

    if (!newPassword.trim()) {
      setPasswordError(t('settings.errorNewPasswordRequired'));
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError(t('auth.errorPasswordTooShort'));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError(t('auth.errorPasswordsMismatch'));
      return;
    }

    setPasswordLoading(true);
    const { error: err } = await updatePassword(newPassword);
    setPasswordLoading(false);

    if (err) {
      setPasswordError(err);
      return;
    }

    Alert.alert(t('settings.passwordChangedTitle'), t('settings.passwordChangedSuccess'));
    setShowPasswordForm(false);
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordError(null);
  };

  const handleDeleteAccount = () => {
    setDeleteModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.languageSection')}</Text>
          <View style={styles.langRow}>
            {(['ja', 'en'] as Language[]).map(code => {
              const active = lang === code;
              const label = code === 'ja' ? t('settings.languageJapanese') : t('settings.languageEnglish');
              return (
                <TouchableOpacity
                  key={code}
                  style={[styles.langOption, active && styles.langOptionActive]}
                  onPress={() => setLang(code)}
                  activeOpacity={0.8}
                >
                  <Globe size={18} color={active ? '#3b82f6' : '#666'} />
                  <Text style={[styles.langLabel, active && styles.langLabelActive]}>{label}</Text>
                  {active && <CheckCircle2 size={18} color="#3b82f6" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.workspaceSettings')}</Text>
          <Text style={styles.sectionDescription}>
            {t('settings.workspaceSettingsDesc')}
          </Text>

          {WORKSPACE_TYPES.map((item) => (
            <TouchableOpacity
              key={item.type}
              style={[
                styles.typeCard,
                selectedType === item.type && styles.typeCardSelected,
              ]}
              onPress={() => updateWorkspaceType(item.type)}>
              <View style={styles.typeHeader}>
                <View>
                  <Text
                    style={[
                      styles.typeLabel,
                      selectedType === item.type && styles.typeLabelSelected,
                    ]}>
                    {item.label}
                  </Text>
                  <Text style={styles.typeDescription}>{item.description}</Text>
                </View>
                {selectedType === item.type && (
                  <CheckCircle2 size={20} color="#000" />
                )}
              </View>
            </TouchableOpacity>
          ))}

          {selectedType === 'four_grid' && (
            <View style={styles.skinSection}>
              <Text style={styles.skinSectionTitle}>{t('settings.fourGridSkin')}</Text>
              <Text style={styles.skinSectionDescription}>
                {t('settings.fourGridSkinDesc')}
              </Text>
              <View style={styles.skinRow}>
                {FOUR_GRID_SKINS.map((s) => {
                  const active = fourGridSkin === s.value;
                  return (
                    <TouchableOpacity
                      key={s.value}
                      style={[styles.skinCard, active && styles.skinCardActive]}
                      onPress={() => setFourGridSkin(s.value)}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          styles.skinPreview,
                          s.value === 'postit'
                            ? styles.skinPreviewPostit
                            : styles.skinPreviewWhiteboard,
                        ]}
                      >
                        <View
                          style={[
                            styles.skinPreviewCell,
                            s.value === 'postit'
                              ? styles.skinPreviewCellPostit
                              : styles.skinPreviewCellWhiteboard,
                          ]}
                        />
                        <View
                          style={[
                            styles.skinPreviewCell,
                            s.value === 'postit'
                              ? styles.skinPreviewCellPostit
                              : styles.skinPreviewCellWhiteboard,
                          ]}
                        />
                        <View
                          style={[
                            styles.skinPreviewCell,
                            s.value === 'postit'
                              ? styles.skinPreviewCellPostit
                              : styles.skinPreviewCellWhiteboard,
                          ]}
                        />
                        <View
                          style={[
                            styles.skinPreviewCell,
                            s.value === 'postit'
                              ? styles.skinPreviewCellPostit
                              : styles.skinPreviewCellWhiteboard,
                          ]}
                        />
                      </View>
                      <View style={styles.skinTextWrap}>
                        <Text style={[styles.skinLabel, active && styles.skinLabelActive]}>
                          {s.label}
                        </Text>
                        <Text style={styles.skinDescription}>{s.description}</Text>
                      </View>
                      {active && <CheckCircle2 size={18} color="#000" />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <FourGridColorEditor
                colors={borderColors}
                onChange={updateBorderColor}
                onResetAll={resetBorderColors}
              />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.scheduleSettings')}</Text>
          <View style={styles.syncCard}>
            <View style={styles.syncLeft}>
              <CalendarSync size={20} color="#333" />
              <View style={styles.syncTextWrap}>
                <View style={styles.syncLabelRow}>
                  <Text style={styles.syncLabel} numberOfLines={1}>
                    {t('settings.todoReminderSyncLabel')}
                  </Text>
                  <TouchableOpacity
                    style={styles.syncInfoBtn}
                    onPress={showTodoSyncInfo}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Info size={16} color="#777" />
                  </TouchableOpacity>
                  <View style={styles.syncInlineSwitch}>
                    <Switch
                      value={todoSyncEnabled}
                      onValueChange={toggleTodoSync}
                      trackColor={{ false: '#ddd', true: '#222' }}
                      thumbColor="#fff"
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Goal reminders */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>目標リマインダー</Text>

          <View style={styles.syncCard}>
            <View style={styles.syncLeft}>
              <Target size={20} color="#8B5CF6" />
              <View style={styles.syncTextWrap}>
                <View style={styles.syncLabelRow}>
                  <Text style={styles.syncLabel} numberOfLines={1}>
                    定期リマインドを受け取る
                  </Text>
                  <TouchableOpacity
                    style={styles.syncInfoBtn}
                    onPress={showGoalReminderInfo}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Info size={16} color="#777" />
                  </TouchableOpacity>
                  <View style={styles.syncInlineSwitch}>
                    <Switch
                      value={goalRemindersEnabled}
                      onValueChange={toggleGoalReminders}
                      trackColor={{ false: '#ddd', true: '#8B5CF6' }}
                      thumbColor="#fff"
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    />
                  </View>
                </View>
                <Text style={styles.syncSub}>
                  月初・月末・半期・年始年末に目標の設定/振り返りを通知
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.settingItem,
              !goalRemindersEnabled && { opacity: 0.4 },
            ]}
            onPress={promptGoalReminderHour}
            disabled={!goalRemindersEnabled}
          >
            <View style={styles.settingRowBetween}>
              <View style={styles.settingLeft}>
                <CalendarSync size={20} color="#475569" />
                <Text style={styles.settingText}>通知時刻</Text>
              </View>
              <Text style={styles.settingHourValue}>
                {goalReminderHour.toString().padStart(2, '0')}:00
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.data')}</Text>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/statistics')}
          >
            <View style={styles.settingRowBetween}>
              <View style={styles.settingLeft}>
                <BarChart3 size={20} color="#3B82F6" />
                <Text style={styles.settingText}>{t('tabs.statistics') || '統計'}</Text>
              </View>
              <ChevronRight size={18} color="#999" />
            </View>
          </TouchableOpacity>

          {/* データエクスポート —
              Web ではブラウザの Blob ダウンロードで動作するが、モバイル (iOS / Android)
              では現状 expo-sharing 未実装のため WIP アラートが出るだけ。"動かないボタンを
              見せる" のは Apple ガイドライン 2.3.0 リスクなので、モバイルでは非表示にする。
              v1.3 で expo-sharing 経由のネイティブ Export を実装したら Platform.OS === 'web'
              のチェックを外す。 */}
          {Platform.OS === 'web' && (
            <TouchableOpacity
              style={styles.settingItem}
              onPress={exportData}
              disabled={isExporting}>
              <View style={styles.settingLeft}>
                <Download size={20} color="#000" />
                <Text style={styles.settingText}>
                  {isExporting ? t('settings.exporting') : t('settings.exportData')}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.settingItem} onPress={clearAllData}>
            <View style={styles.settingLeft}>
              <Trash2 size={20} color="#ff3b30" />
              <Text style={[styles.settingText, styles.dangerText]}>
                {t('settings.deleteAllData')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.aiSection') || 'AI アシスタント'}</Text>

          {/*
            プロモコード入力 UI は App Store ガイドライン 3.1.1 に従い App Store 配布版から削除しました。
            (= IAP 以外で有料機能をアンロックする仕組みは禁止)
            Apple Offer Codes (= App Store Connect → 「Offer Codes」機能) で同等の機能を提供します。
            バックエンドの redeem-promo Edge Function は管理者用に残してあります。
          */}

          {/*
            プラン変更 (アップグレード / ダウングレード) のエントリ。
            paywall は context=settings で起動するとどのプラン入口にも紐づかず
            3 プランすべてを表示する。実際の解約は Apple サブスク設定 (Settings.app
            → Apple ID → サブスクリプション) からのみ可能なので、ペイウォール内で
            「現在のプランを変更する」リンクと一緒に解約導線を案内する。
          */}
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/paywall?context=settings')}
          >
            <View style={styles.settingRowBetween}>
              <View style={styles.settingLeft}>
                <Sparkles size={20} color="#6366F1" />
                <View>
                  <Text style={styles.settingText}>プランを変更する</Text>
                  <Text style={styles.settingSub}>アップグレード・ダウングレード・解約</Text>
                </View>
              </View>
              <ChevronRight size={18} color="#999" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/claude-integration')}
          >
            <View style={styles.settingRowBetween}>
              <View style={styles.settingLeft}>
                <KeyRound size={20} color="#6366F1" />
                <View>
                  <Text style={styles.settingText}>AI 連携 (Claude / ChatGPT)</Text>
                  <Text style={styles.settingSub}>外部のAIで目標を立てて ToSche に流し込む</Text>
                </View>
              </View>
              <ChevronRight size={18} color="#999" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleDeleteChatHistory}
            disabled={chatStats.conversations === 0}
          >
            <View style={styles.settingRowBetween}>
              <View style={styles.settingLeft}>
                <MessageSquare size={20} color={chatStats.conversations === 0 ? '#cbd5e1' : '#475569'} />
                <View>
                  <Text
                    style={[
                      styles.settingText,
                      chatStats.conversations === 0 && { color: '#94a3b8' },
                    ]}
                  >
                    チャット履歴を削除
                  </Text>
                  <Text style={styles.settingSub}>
                    {chatStats.conversations === 0
                      ? '履歴はまだありません'
                      : `${chatStats.conversations} 件の会話を保存中`}
                  </Text>
                </View>
              </View>
              {chatStats.conversations > 0 && <Trash2 size={18} color="#dc2626" />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleDeleteMemory}
            disabled={chatStats.memory === 0}
          >
            <View style={styles.settingRowBetween}>
              <View style={styles.settingLeft}>
                <Brain size={20} color={chatStats.memory === 0 ? '#cbd5e1' : '#475569'} />
                <View>
                  <Text
                    style={[
                      styles.settingText,
                      chatStats.memory === 0 && { color: '#94a3b8' },
                    ]}
                  >
                    AIの記憶をリセット
                  </Text>
                  <Text style={styles.settingSub}>
                    {chatStats.memory === 0
                      ? 'まだ何も覚えていません'
                      : `${chatStats.memory} 件の記憶を保持中`}
                  </Text>
                </View>
              </View>
              {chatStats.memory > 0 && <Trash2 size={18} color="#dc2626" />}
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoContent}>
              <Text style={styles.infoText}>{user?.email}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => {
              setShowPasswordForm(!showPasswordForm);
              setPasswordError(null);
              setNewPassword('');
              setConfirmNewPassword('');
            }}
          >
            <View style={styles.settingLeft}>
              <KeyRound size={20} color="#000" />
              <Text style={styles.settingText}>{t('settings.changePassword')}</Text>
            </View>
          </TouchableOpacity>

          {showPasswordForm && (
            <View style={styles.passwordForm}>
              {passwordError && (
                <View style={styles.passwordErrorContainer}>
                  <Text style={styles.passwordErrorText}>{passwordError}</Text>
                </View>
              )}
              <TextInput
                style={styles.passwordInput}
                placeholder={t('settings.newPasswordPlaceholder')}
                placeholderTextColor="#8a8a9a"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                editable={!passwordLoading}
              />
              <TextInput
                style={styles.passwordInput}
                placeholder={t('settings.newPasswordConfirmPlaceholder')}
                placeholderTextColor="#8a8a9a"
                value={confirmNewPassword}
                onChangeText={setConfirmNewPassword}
                secureTextEntry
                editable={!passwordLoading}
              />
              <TouchableOpacity
                style={[styles.passwordSubmitButton, passwordLoading && styles.passwordSubmitDisabled]}
                onPress={handleChangePassword}
                disabled={passwordLoading}
              >
                {passwordLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.passwordSubmitText}>{t('settings.passwordChangeButton')}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.logoutItem}
            onPress={() => {
              Alert.alert(t('settings.logoutConfirmTitle'), t('settings.logoutConfirmBody'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('settings.logout'), style: 'destructive', onPress: signOut },
              ]);
            }}
          >
            <View style={styles.settingLeft}>
              <LogOut size={20} color="#ff3b30" />
              <Text style={[styles.settingText, styles.dangerText]}>{t('settings.logout')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteAccountItem}
            onPress={handleDeleteAccount}
          >
            <View style={styles.settingLeft}>
              <UserX size={20} color="#ff3b30" />
              <Text style={[styles.settingText, styles.dangerText]}>
                {t('settings.deleteAccount')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.appInfo')}</Text>

          <View style={styles.infoCard}>
            <Info size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>{t('settings.appName')}</Text>
              <Text style={styles.infoText}>{t('settings.appVersion')}</Text>
              <Text style={styles.infoText}>
                {t('settings.appTagline')}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.support')}</Text>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/support/usage-guide')}
          >
            <View style={styles.settingRowBetween}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingTextNoIcon}>{t('settings.usageGuide')}</Text>
              </View>
              <ChevronRight size={18} color="#999" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/support/terms')}
          >
            <View style={styles.settingRowBetween}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingTextNoIcon}>{t('settings.termsOfService')}</Text>
              </View>
              <ChevronRight size={18} color="#999" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/support/privacy-policy')}
          >
            <View style={styles.settingRowBetween}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingTextNoIcon}>{t('settings.privacyPolicy')}</Text>
              </View>
              <ChevronRight size={18} color="#999" />
            </View>
          </TouchableOpacity>

          <View style={styles.legalWebHint}>
            <Text style={styles.legalWebHintTitle}>{t('settings.legalWebHint')}</Text>
            <TouchableOpacity
              style={styles.legalWebLinkWrap}
              onPress={() => Linking.openURL(getLegalDocumentsHubUrl())}
            >
              <Text style={styles.legalWebLink}>{getLegalDocumentsHubUrl()}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/support/faq')}
          >
            <View style={styles.settingRowBetween}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingTextNoIcon}>{t('settings.faq')}</Text>
              </View>
              <ChevronRight size={18} color="#999" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => Linking.openURL('https://www.synthera.jp/contact')}
          >
            <View style={styles.settingRowBetween}>
              <View style={styles.settingLeft}>
                <Text style={styles.settingTextNoIcon}>{t('settings.contact')}</Text>
              </View>
              <ChevronRight size={18} color="#999" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.howTo')}</Text>
          <View style={styles.helpCard}>
            <Text style={styles.helpTitle}>{t('settings.howToDailyTitle')}</Text>
            <Text style={styles.helpText}>
              {t('settings.howToDailyBody')}
            </Text>
          </View>
          <View style={styles.helpCard}>
            <Text style={styles.helpTitle}>{t('settings.howToFourGridTitle')}</Text>
            <Text style={styles.helpText}>
              {t('settings.howToFourGridBody')}
            </Text>
          </View>
          <View style={styles.helpCard}>
            <Text style={styles.helpTitle}>{t('settings.howToStatsTitle')}</Text>
            <Text style={styles.helpText}>
              {t('settings.howToStatsBody')}
            </Text>
          </View>
        </View>
      </ScrollView>

      <DeleteAccountModal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
        onDeleted={() => setDeleteModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  header: {
    padding: 20,
    paddingTop: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#000',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  typeCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
  },
  typeCardSelected: {
    borderColor: '#000',
    borderWidth: 2,
  },
  typeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  typeLabelSelected: {
    color: '#000',
  },
  typeDescription: {
    fontSize: 14,
    color: '#666',
  },
  skinSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  skinSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#222',
    marginBottom: 4,
  },
  skinSectionDescription: {
    fontSize: 12,
    color: '#777',
    marginBottom: 12,
  },
  skinRow: {
    gap: 8,
  },
  skinCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 12,
  },
  skinCardActive: {
    borderColor: '#000',
    borderWidth: 2,
  },
  skinPreview: {
    width: 56,
    height: 56,
    borderRadius: 6,
    padding: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  skinPreviewPostit: {
    backgroundColor: '#f5f5dc',
    borderWidth: 1,
    borderColor: '#e8d99a',
  },
  skinPreviewWhiteboard: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  skinPreviewCell: {
    width: '46%',
    height: '46%',
  },
  skinPreviewCellPostit: {
    backgroundColor: '#fffacd',
    borderWidth: 0.5,
    borderColor: '#f0e68c',
    borderRadius: 1,
  },
  skinPreviewCellWhiteboard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe2ea',
    borderRadius: 4,
  },
  skinTextWrap: {
    flex: 1,
  },
  skinLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
    marginBottom: 2,
  },
  skinLabelActive: {
    color: '#000',
  },
  skinDescription: {
    fontSize: 12,
    color: '#777',
  },
  settingItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingText: {
    fontSize: 16,
    color: '#000',
    marginLeft: 12,
  },
  settingSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginLeft: 12,
    marginTop: 2,
  },
  settingHourValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  syncSub: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 6,
    lineHeight: 16,
  },
  settingTextNoIcon: {
    fontSize: 16,
    color: '#000',
  },
  dangerText: {
    color: '#ff3b30',
  },
  logoutItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  deleteAccountItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    flexDirection: 'row',
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  helpCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
  },
  helpText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  legalWebHint: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  legalWebHintTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
    marginBottom: 8,
  },
  legalWebLinkWrap: {
    marginBottom: 8,
  },
  legalWebLink: {
    fontSize: 12,
    color: '#2563eb',
    lineHeight: 18,
  },
  syncCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  syncLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  syncTextWrap: {
    marginLeft: 10,
    flex: 1,
    minWidth: 0,
  },
  syncLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  syncLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    flexShrink: 1,
  },
  syncInfoBtn: {
    marginLeft: 6,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncInlineSwitch: {
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  passwordForm: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    gap: 10,
  },
  passwordErrorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 10,
  },
  passwordErrorText: {
    color: '#dc2626',
    fontSize: 13,
    textAlign: 'center',
  },
  passwordInput: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e2ea',
    paddingHorizontal: 14,
    height: 44,
    fontSize: 15,
    color: '#1a1a2e',
  },
  passwordSubmitButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  passwordSubmitDisabled: {
    opacity: 0.7,
  },
  passwordSubmitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  langRow: {
    flexDirection: 'row',
    gap: 10,
  },
  langOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  langOptionActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  langLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  langLabelActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },
});
