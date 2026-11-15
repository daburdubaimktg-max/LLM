import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/lib/auth';
import { queryClient } from '@/lib/query';
import { theme } from '@/ui';

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerStyle: { backgroundColor: theme.color.bg }, headerShadowVisible: false, headerTintColor: theme.color.ink,
          headerTitleStyle: { fontWeight: '600' }, headerBackTitle: 'Back', contentStyle: { backgroundColor: theme.color.bg } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
