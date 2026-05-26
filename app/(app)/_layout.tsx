import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { View, ActivityIndicator } from 'react-native';
import { colors } from '../../constants/theme';

export default function AppLayout() {
  const { firebaseUser, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!firebaseUser) {
    return <Redirect href="/" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="map" />
    </Stack>
  );
}
