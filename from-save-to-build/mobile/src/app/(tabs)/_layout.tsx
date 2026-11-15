import { useQuery } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { keys } from '@/lib/query';
import { theme } from '@/ui';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ fontSize: 18, color }}>{glyph}</Text>;

export default function TabsLayout() {
  const { userId } = useAuth();
  const notifications = useQuery({ queryKey: keys.notifications, queryFn: api.notifications, enabled: !!userId, refetchInterval: 30_000 });
  const unread = notifications.data?.filter((n) => !n.read_at).length ?? 0;
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: theme.color.accent, tabBarInactiveTintColor: theme.color.muted,
      headerStyle: { backgroundColor: theme.color.bg }, headerShadowVisible: false, headerTitleStyle: { fontWeight: '600' },
      tabBarStyle: { backgroundColor: theme.color.surface, borderTopColor: theme.color.line }, sceneStyle: { backgroundColor: theme.color.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Discover', tabBarIcon: icon('◎') }} />
      <Tabs.Screen name="tests" options={{ title: 'My tests', tabBarIcon: icon('✓') }} />
      <Tabs.Screen name="creator" options={{ title: 'Create', tabBarIcon: icon('＋') }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarIcon: icon('✉'), tabBarBadge: unread || undefined }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('☺') }} />
    </Tabs>
  );
}
