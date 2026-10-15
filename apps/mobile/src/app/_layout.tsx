import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { usePrefs } from '@/lib/prefs';
import { colors } from '@/lib/theme';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } });

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, GeistMono_400Regular, GeistMono_500Medium });
  const ready = useAuth((s) => s.ready);
  const signedIn = useAuth((s) => !!s.user);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    void useAuth.getState().hydrate();
    void usePrefs.getState().hydrate().finally(() => setPrefsLoaded(true));
  }, []);

  if (!fontsLoaded || !ready || !prefsLoaded) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(app)" />
            <Stack.Screen name="permission" options={{ gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
