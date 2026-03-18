import { Tabs } from 'expo-router';
import { BookOpen, ChartBar as BarChart3, Settings, Clock } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#000',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#e5e5e5',
        },
      }}>
      <Tabs.Screen
        name="workspace"
        options={{
          title: 'ワークスペース',
          tabBarIcon: ({ size, color }) => <BookOpen size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'スケジュール',
          tabBarIcon: ({ size, color }) => <Clock size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="statistics"
        options={{
          title: '統計',
          tabBarIcon: ({ size, color }) => <BarChart3 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '設定',
          tabBarIcon: ({ size, color }) => <Settings size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
