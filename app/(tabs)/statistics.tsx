import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle2, Calendar, TrendingUp } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { Todo, UserSettings } from '@/types/database';

interface StatsSummary {
  todayCompleted: number;
  weekCompleted: number;
  monthCompleted: number;
  totalCompleted: number;
  totalPending: number;
  completionRate: number;
}

export default function StatisticsScreen() {
  const [stats, setStats] = useState<StatsSummary>({
    todayCompleted: 0,
    weekCompleted: 0,
    monthCompleted: 0,
    totalCompleted: 0,
    totalPending: 0,
    completionRate: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (settings) {
      loadStatistics();
    }
  }, [settings]);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .limit(1)
        .maybeSingle() as { data: UserSettings | null; error: any };

      if (error) throw error;
      setSettings(data);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadStatistics = async () => {
    try {
      const currentType = settings?.default_workspace_type || 'four_grid';
      
      // 選択中のタイプのワークスペースのみを取得
      const { data: workspaces, error: workspacesError } = await supabase
        .from('workspaces')
        .select('id')
        .eq('type', currentType) as { data: Array<{ id: string }> | null; error: any };

      if (workspacesError) throw workspacesError;
      if (!workspaces) return;

      const workspaceIds = workspaces.map(w => w.id);

      // 選択中のタイプのワークスペースに紐づくToDoのみを取得
      const { data: todos, error } = await supabase
        .from('todos')
        .select('*')
        .in('workspace_id', workspaceIds) as { data: Todo[] | null; error: any };

      if (error) throw error;
      if (!todos) return;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const todayCompleted = todos.filter(
        (t) =>
          t.is_completed &&
          t.completed_at &&
          new Date(t.completed_at) >= todayStart
      ).length;

      const weekCompleted = todos.filter(
        (t) =>
          t.is_completed &&
          t.completed_at &&
          new Date(t.completed_at) >= weekStart
      ).length;

      const monthCompleted = todos.filter(
        (t) =>
          t.is_completed &&
          t.completed_at &&
          new Date(t.completed_at) >= monthStart
      ).length;

      const totalCompleted = todos.filter((t) => t.is_completed).length;
      const totalPending = todos.filter((t) => !t.is_completed).length;
      const total = todos.length;
      const completionRate = total > 0 ? (totalCompleted / total) * 100 : 0;

      setStats({
        todayCompleted,
        weekCompleted,
        monthCompleted,
        totalCompleted,
        totalPending,
        completionRate,
      });
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStatistics();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>統計</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <CheckCircle2 size={24} color="#000" />
            <Text style={styles.summaryTitle}>達成率</Text>
          </View>
          <Text style={styles.summaryValue}>
            {Math.round(stats.completionRate)}%
          </Text>
          <Text style={styles.summarySubtext}>
            {stats.totalCompleted} / {stats.totalCompleted + stats.totalPending}{' '}
            完了
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>今日</Text>
            <Text style={styles.statValue}>{stats.todayCompleted}</Text>
            <Text style={styles.statUnit}>完了</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>今週</Text>
            <Text style={styles.statValue}>{stats.weekCompleted}</Text>
            <Text style={styles.statUnit}>完了</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>今月</Text>
            <Text style={styles.statValue}>{stats.monthCompleted}</Text>
            <Text style={styles.statUnit}>完了</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>合計</Text>
            <Text style={styles.statValue}>{stats.totalCompleted}</Text>
            <Text style={styles.statUnit}>完了</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <TrendingUp size={20} color="#000" />
            <Text style={styles.cardTitle}>現在の状況</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>完了済み</Text>
            <Text style={styles.statusValue}>{stats.totalCompleted}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>未完了</Text>
            <Text style={styles.statusValue}>{stats.totalPending}</Text>
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
  summaryCard: {
    backgroundColor: '#000',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  summaryValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  summarySubtext: {
    fontSize: 14,
    color: '#ccc',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  statUnit: {
    fontSize: 12,
    color: '#999',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginLeft: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
});
