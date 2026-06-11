import { Gaegu_400Regular, Gaegu_700Bold } from '@expo-google-fonts/gaegu';
import { Inter_500Medium, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { NotoSansKR_700Bold } from '@expo-google-fonts/noto-sans-kr';
import { Poppins_800ExtraBold } from '@expo-google-fonts/poppins';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-gesture-handler';
import 'react-native-reanimated';

import { colors } from '@/constants/theme';
import { prepareDatabase } from '@/lib/database';
import { useSettings } from '@/lib/settings';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

const LightNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.paper,
    card: colors.surface,
    text: colors.ink,
    border: colors.line,
    primary: colors.pen,
  },
};

const DarkNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.darkBg,
    card: colors.darkSurface,
    text: colors.darkText,
    border: colors.darkBorder,
    primary: colors.pen,
  },
};

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    // The DESIGN.md families, finally real: Poppins display, Inter body,
    // Noto Sans KR for Hangul, Gaegu for handwritten ink (journal, tutor notes).
    Poppins_800ExtraBold,
    Inter_500Medium,
    Inter_700Bold,
    Inter_800ExtraBold,
    NotoSansKR_700Bold,
    Gaegu_400Regular,
    Gaegu_700Bold,
  });
  const [ready, setReady] = useState(false);

  // A failed font download (flaky network/tunnel) must not brick the boot:
  // text simply falls back to the system face for this run.
  useEffect(() => {
    if (error) console.warn('Font loading failed; falling back to system fonts.', error);
  }, [error]);

  // Open (and on web, warm up) the SQLite worker before rendering any screen, so
  // the first synchronous read (e.g. the dashboard snapshot) can't lose the
  // worker warm-up race. See prepareDatabase() in lib/database.ts. (Skia's
  // CanvasKit is loaded earlier still, in the web entry point — see index.js.)
  useEffect(() => {
    prepareDatabase()
      .catch((e) => console.error('Database initialization failed', e))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (loaded && ready) {
      SplashScreen.hideAsync();
    }
  }, [loaded, ready]);

  // Wait for fonts unless they errored (then ship with system fonts).
  if ((!loaded && !error) || !ready) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const settings = useSettings();

  return (
    <ThemeProvider value={settings.darkMode ? DarkNavTheme : LightNavTheme}>
      {/* Native gets react-native-screens transitions; web pops instantly, so
          each stack screen also wraps itself in <ScreenTransition nativeStackHandles>. */}
      <Stack screenOptions={{ animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="session" options={{ headerShown: false, animation: 'fade_from_bottom' }} />
      </Stack>
    </ThemeProvider>
  );
}
