import { Link, Stack } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <AppText variant="title">This screen does not exist.</AppText>
          <Link href="/" asChild>
            <Pressable style={{ borderRadius: 999, backgroundColor: colors.pen, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
              <AppText color={colors.white}>Go home</AppText>
            </Pressable>
          </Link>
        </View>
      </Screen>
    </>
  );
}
