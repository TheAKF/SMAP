import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Alert } from 'react-native';
// Side-effect import: registers the background task definition at bundle load time.
// On web this resolves to the no-op stub; on native to the real implementation.
import '../services/teacherPoll';
import { dlog } from '../utils/debugLog';

// ── Global JS error handler ──────────────────────────────────────────────────
// Catches unhandled promise rejections and fatal JS errors before they silently
// terminate the app on release builds.
// NOTE: This does NOT catch native NSExceptions — those crash the process before JS runs.
if (typeof (global as any).ErrorUtils !== 'undefined') {
  const prevHandler = (global as any).ErrorUtils.getGlobalHandler?.();
  (global as any).ErrorUtils.setGlobalHandler?.((error: Error, isFatal?: boolean) => {
    const msg = error?.message ?? String(error);
    dlog(`[GLOBAL ERROR] fatal=${isFatal} ${msg}`, 'error');
    // Show alert so user can read the error before the app potentially closes
    if (isFatal) {
      Alert.alert(
        'App Error (JS)',
        msg,
        [{ text: 'OK' }],
        { cancelable: false },
      );
    }
    prevHandler?.(error, isFatal);
  });
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#07111f' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(app)" />
      </Stack>
    </SafeAreaProvider>
  );
}
