// Must be first — ensures Firebase web SDK is initialized before any component
// renders. In Hermes release builds the evaluation order is not guaranteed
// through the import graph alone, so we pin it here explicitly.
import '../services/firebase';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
// Side-effect import: registers the background task definition at bundle load time.
// On web this resolves to the no-op stub; on native to the real implementation.
import '../services/teacherPoll';

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
