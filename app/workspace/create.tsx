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
import { formatDate } from '@/lib/scheduleUtils';
import { useLanguage } from '@/contexts/LanguageContext';
import { checkWorkspaceCreationAccess, FREE_WORKSPACE_LIMIT } from '@/lib/aiAccess';

export default function CreateWorkspaceScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [selectedType, setSelectedType] = useState<WorkspaceType>('four_grid');
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));

  const workspaceTypes = [
    {
      type: 'four_grid' as WorkspaceType,
      label: t('workspace.fourGridLabel'),
      description: t('workspace.fourGridDescriptionShort'),
    },
  ];

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert(t('common.error'), t('workspace.errorRequiredTitle'));
      return;
    }

    if (!user) return;

    // 100 ページ制限: 未契約ユーザーは workspaces 数が 100 以上だと作成不可。
    // サブスク (basic/standard/pro 何でも) 契約者は無制限。
    try {
      const access = await checkWorkspaceCreationAccess(user.id);
      if (!access.allowed) {
        Alert.alert(
          t('workspace.limitReachedTitle') || 'ワークスペースの上限に達しました',
          t('workspace.limitReachedMessage') ||
            `無料枠は ${FREE_WORKSPACE_LIMIT} ページまでです。プランに加入すると無制限に作成できます。`,
          [
            { text: t('common.cancel') || 'キャンセル', style: 'cancel' },
            {
              text: t('workspace.viewPlans') || 'プランを見る',
              onPress: () => router.push('/paywall'),
            },
          ],
        );
        return;
      }
    } catch (e) {
      console.warn('[CreateWorkspace] access check threw, allowing create as fallback', e);
    }

    try {
      const { data: latestWs } = await supabase
        .from('workspaces')
        .select('area_titles')
        .eq('user_id', user.id)
        .eq('type', selectedType)
        .not('area_titles', 'is', null)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle() as { data: { area_titles: any } | null; error: any };

      const inheritedTitles = {
        top_left: latestWs?.area_titles?.top_left || t('workspace.areaTopLeft'),
        top_right: latestWs?.area_titles?.top_right || t('workspace.areaTopRight'),
        bottom_left: latestWs?.area_titles?.bottom_left || t('workspace.areaBottomLeft'),
        bottom_right: latestWs?.area_titles?.bottom_right || t('workspace.areaBottomRight'),
      };

      const { data, error } = await supabase
        .from('workspaces')
        .insert({
          title: title.trim(),
          type: selectedType,
          date: selectedDate,
          user_id: user.id,
          area_titles: inheritedTitles,
        })
        .select()
        .single() as { data: { id: string } | null; error: any };

      if (error) {
        Alert.alert(t('common.error'), `${t('workspace.errorCreateFailed')}: ${error.message}`);
        return;
      }

      if (!data) {
        Alert.alert(t('common.error'), t('workspace.errorReturnedNoData'));
        return;
      }

      router.replace(`/workspace/${data.id}`);
    } catch (error) {
      Alert.alert(t('common.error'), `${t('workspace.errorCreateFailed')}: ${String(error)}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('workspace.newWorkspaceTitle')}</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>{t('workspace.workspaceName')}</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={t('workspace.workspaceNamePlaceholder')}
          placeholderTextColor="#999"
          autoFocus
        />

        <Text style={styles.label}>{t('workspace.datePickerLabel')}</Text>
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

        <Text style={styles.label}>{t('workspace.selectTypeLabel')}</Text>
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
          <Text style={styles.createButtonText}>{t('workspace.createButton')}</Text>
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
