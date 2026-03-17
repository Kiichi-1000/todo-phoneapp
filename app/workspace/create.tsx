import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Calendar } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { WorkspaceType } from '@/types/database';

export default function CreateWorkspaceScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [selectedType, setSelectedType] = useState<WorkspaceType>('four_grid');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const workspaceTypes = [
    {
      type: 'four_grid' as WorkspaceType,
      label: '4分割ポストイット',
      description: '画面を4つに分けてタスクを整理',
    },
  ];

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('エラー', 'ワークスペース名を入力してください');
      return;
    }

    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('workspaces')
        .insert({
          title: title.trim(),
          type: selectedType,
          date: selectedDate,
          user_id: user.id,
        } as any)
        .select()
        .single() as any;

      if (error) {
        Alert.alert('エラー', `ワークスペースの作成に失敗しました: ${error.message}`);
        return;
      }

      if (!data) {
        Alert.alert('エラー', 'データが返されませんでした');
        return;
      }

      router.replace(`/workspace/${data.id}`);
    } catch (error) {
      Alert.alert('エラー', `ワークスペースの作成に失敗しました: ${String(error)}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>新規ワークスペース</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>ワークスペース名</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="例: 今週のタスク"
          placeholderTextColor="#999"
          autoFocus
        />

        <Text style={styles.label}>日付</Text>
        <View style={styles.dateInputContainer}>
          <Calendar size={20} color="#666" style={styles.calendarIcon} />
          <TextInput
            style={styles.dateInput}
            value={selectedDate}
            onChangeText={setSelectedDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#999"
          />
        </View>

        <Text style={styles.label}>タイプを選択</Text>
        {workspaceTypes.map((item) => (
          <TouchableOpacity
            key={item.type}
            style={[
              styles.typeCard,
              selectedType === item.type && styles.typeCardSelected,
            ]}
            onPress={() => setSelectedType(item.type)}>
            <View style={styles.typeHeader}>
              <Text
                style={[
                  styles.typeLabel,
                  selectedType === item.type && styles.typeLabelSelected,
                ]}>
                {item.label}
              </Text>
              {selectedType === item.type && (
                <View style={styles.selectedIndicator} />
              )}
            </View>
            <Text style={styles.typeDescription}>{item.description}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.createButton} onPress={handleCreate}>
          <Text style={styles.createButtonText}>作成</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  placeholder: {
    width: 32,
  },
  content: {
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
    marginTop: 20,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#000',
  },
  typeCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  typeCardSelected: {
    borderColor: '#000',
    borderWidth: 2,
  },
  typeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  typeLabelSelected: {
    color: '#000',
  },
  typeDescription: {
    fontSize: 14,
    color: '#666',
  },
  selectedIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#000',
  },
  createButton: {
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  calendarIcon: {
    marginRight: 8,
  },
  dateInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: '#000',
  },
});
