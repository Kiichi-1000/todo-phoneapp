import { useState, useEffect } from 'react';
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
} from 'react-native';
import { Download, Trash2, Info, CircleCheck as CheckCircle2, LogOut, CalendarSync, KeyRound } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { WorkspaceType, UserSettings } from '@/types/database';

const WORKSPACE_TYPES = [
  {
    type: 'four_grid' as WorkspaceType,
    label: '4分割ポストイット',
    description: '画面を4つに分けてタスクを整理',
  },
  {
    type: 'individual' as WorkspaceType,
    label: 'ポストイット個別',
    description: '自由に配置できる付箋型タスク管理',
  },
  {
    type: 'note' as WorkspaceType,
    label: 'ノート',
    description: '自由なキャンバス型タスク管理（未実装）',
  },
];

export default function SettingsScreen() {
  const { user, signOut, updatePassword } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [selectedType, setSelectedType] = useState<WorkspaceType>('four_grid');
  const [todoSyncEnabled, setTodoSyncEnabled] = useState(true);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

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
        .update({ todo_schedule_sync: value } as any)
        .eq('id', settings.id);
      if (error) throw error;
      setTodoSyncEnabled(value);
    } catch (error) {
      console.error('Error updating sync setting:', error);
      Alert.alert('エラー', '設定の更新に失敗しました');
    }
  };

  const showTodoSyncInfo = () => {
    Alert.alert(
      'ToDoリマインダー同期',
      'リマインダー付きのToDoをスケジュール画面へ自動反映します。\n\nオフにすると、新規同期は行われません。既に登録済みのスケジュールはそのまま残ります。'
    );
  };

  const updateWorkspaceType = async (type: WorkspaceType) => {
    if (!settings) return;

    try {
      const { error } = await supabase
        .from('user_settings')
        .update({ default_workspace_type: type } as any)
        .eq('id', settings.id);

      if (error) throw error;

      setSelectedType(type);
      Alert.alert('成功', 'ワークスペースタイプを変更しました。今日の日付から新しいワークスペースが作成されます。');
    } catch (error) {
      console.error('Error updating workspace type:', error);
      Alert.alert('エラー', 'ワークスペースタイプの変更に失敗しました');
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
        Alert.alert('成功', 'データをエクスポートしました');
      } else {
        Alert.alert(
          'データエクスポート',
          'モバイルでのエクスポート機能は開発中です',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      Alert.alert('エラー', 'データのエクスポートに失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  const clearAllData = () => {
    Alert.alert(
      '確認',
      '全てのデータを削除しますか？この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('todos').delete().neq('id', '');
              await supabase.from('workspaces').delete().neq('id', '');
              Alert.alert('成功', 'データを削除しました');
            } catch (error) {
              console.error('Error clearing data:', error);
              Alert.alert('エラー', 'データの削除に失敗しました');
            }
          },
        },
      ]
    );
  };

  const handleChangePassword = async () => {
    setPasswordError(null);

    if (!newPassword.trim()) {
      setPasswordError('新しいパスワードを入力してください');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('パスワードは6文字以上で入力してください');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('パスワードが一致しません');
      return;
    }

    setPasswordLoading(true);
    const { error: err } = await updatePassword(newPassword);
    setPasswordLoading(false);

    if (err) {
      setPasswordError(err);
      return;
    }

    Alert.alert('完了', 'パスワードを変更しました');
    setShowPasswordForm(false);
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordError(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>設定</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ワークスペース設定</Text>
          <Text style={styles.sectionDescription}>
            設定変更後、新しい日付のワークスペースが選択したタイプで作成されます。既存の日付のワークスペースはそのまま残ります。
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
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>スケジュール設定</Text>
          <View style={styles.syncCard}>
            <View style={styles.syncLeft}>
              <CalendarSync size={20} color="#333" />
              <View style={styles.syncTextWrap}>
                <View style={styles.syncLabelRow}>
                  <Text style={styles.syncLabel} numberOfLines={1}>
                    ToDo リマインダー同期
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>データ管理</Text>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={exportData}
            disabled={isExporting}>
            <View style={styles.settingLeft}>
              <Download size={20} color="#000" />
              <Text style={styles.settingText}>
                {isExporting ? 'エクスポート中...' : 'データをエクスポート'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={clearAllData}>
            <View style={styles.settingLeft}>
              <Trash2 size={20} color="#ff3b30" />
              <Text style={[styles.settingText, styles.dangerText]}>
                全データを削除
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>アカウント</Text>
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
              <Text style={styles.settingText}>パスワードを変更</Text>
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
                placeholder="新しいパスワード"
                placeholderTextColor="#8a8a9a"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                editable={!passwordLoading}
              />
              <TextInput
                style={styles.passwordInput}
                placeholder="新しいパスワード（確認）"
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
                  <Text style={styles.passwordSubmitText}>変更する</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.logoutItem}
            onPress={() => {
              Alert.alert('確認', 'ログアウトしますか？', [
                { text: 'キャンセル', style: 'cancel' },
                { text: 'ログアウト', style: 'destructive', onPress: signOut },
              ]);
            }}
          >
            <View style={styles.settingLeft}>
              <LogOut size={20} color="#ff3b30" />
              <Text style={[styles.settingText, styles.dangerText]}>ログアウト</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>アプリ情報</Text>

          <View style={styles.infoCard}>
            <Info size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>FreeTask</Text>
              <Text style={styles.infoText}>Version 1.0.0 (Phase 1 MVP)</Text>
              <Text style={styles.infoText}>
                ノートのように使える日次ToDoアプリ
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>使い方</Text>
          <View style={styles.helpCard}>
            <Text style={styles.helpTitle}>日次ワークスペース</Text>
            <Text style={styles.helpText}>
              毎日0:00に新しいワークスペースが自動的に作成されます。左右の矢印で過去のページを閲覧できます。
            </Text>
          </View>
          <View style={styles.helpCard}>
            <Text style={styles.helpTitle}>4分割モード</Text>
            <Text style={styles.helpText}>
              画面を4つのエリアに分けてタスクを整理します。各エリアにタスクを追加し、チェックボックスで完了管理できます。
            </Text>
          </View>
          <View style={styles.helpCard}>
            <Text style={styles.helpTitle}>統計</Text>
            <Text style={styles.helpText}>
              統計画面で今日、今週、今月の達成状況を確認できます。
            </Text>
          </View>
        </View>
      </ScrollView>
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
  settingText: {
    fontSize: 16,
    color: '#000',
    marginLeft: 12,
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
});
