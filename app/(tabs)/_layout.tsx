import { Tabs } from 'expo-router';
import { BookOpen, Settings, Clock, ListChecks, Sparkles } from 'lucide-react-native';
import { useT } from '@/contexts/LanguageContext';

export default function TabLayout() {
  const t = useT();
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
          title: t('tabs.workspace'),
          tabBarIcon: ({ size, color }) => <BookOpen size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t('tabs.schedule'),
          tabBarIcon: ({ size, color }) => <Clock size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="routine"
        options={{
          title: t('tabs.routine'),
          tabBarIcon: ({ size, color }) => <ListChecks size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: t('tabs.ai'),
          tabBarIcon: ({ size, color }) => <Sparkles size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
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
