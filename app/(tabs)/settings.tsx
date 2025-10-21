import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { Download, Trash2, Info, CheckCircle2 } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
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
    description: '自由に配置できる付箋型タスク管理（未実装）',
  },
  {
    type: 'note' as WorkspaceType,
    label: 'ノート',
    description: '自由なキャンバス型タスク管理（未実装）',
  },
];

export default function SettingsScreen() {
  const [isExporting, setIsExporting] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [selectedType, setSelectedType] = useState<WorkspaceType>('four_grid');

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
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const updateWorkspaceType = async (type: WorkspaceType) => {
    if (!settings) return;

    if (type !== 'four_grid') {
      Alert.alert('未実装', 'この機能は現在開発中です。Phase 2で実装予定です。');
      return;
    }

    try {
      const { error } = await supabase
        .from('user_settings')
        .update({ default_workspace_type: type } as any)
        .eq('id', settings.id);

      if (error) throw error;

      setSelectedType(type);
      Alert.alert('成功', 'ワークスペースタイプを変更しました。新しい日付から適用されます。');
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>設定</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ワークスペース設定</Text>
          <Text style={styles.sectionDescription}>
            新しく作成される日次ワークスペースのタイプを選択できます
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
});
