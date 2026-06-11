import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { Animated, Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";

import { setScreenTransitionDirection } from "@/components/motion";
import { colors, spacing } from "@/constants/theme";

type IconName = ComponentProps<typeof SymbolView>["name"];

const TAB_BAR_PADDING = 6;

const tabLabels: Record<string, string> = {
  index: "Today",
  practice: "Write",
  settings: "Settings",
};

const tabIcons: Record<string, IconName> = {
  index: { ios: "sun.max.fill", android: "today", web: "today" } as IconName,
  practice: { ios: "pencil", android: "edit", web: "edit" } as IconName,
  settings: { ios: "gearshape.fill", android: "settings", web: "settings" } as IconName,
};

// The dock order. `practice` is the free-write canvas, reachable in one tap.
// Progress was merged into Today, so it is no longer a tab.
const VISIBLE_TABS = ["index", "practice", "settings"];

type TabBarProps = {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  descriptors: Record<string, { options: { title?: string; tabBarLabel?: string | ((props: never) => unknown) } }>;
  navigation: {
    emit: (event: { type: "tabPress"; target: string; canPreventDefault: true }) => { defaultPrevented?: boolean };
    navigate: (name: string) => void;
  };
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}
      tabBar={(props) => <BottomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="practice" options={{ title: "Practice" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}

function BottomTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [barWidth, setBarWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const compact = width < 430;
  const barHeight = compact ? 48 : 52;
  const indicatorInset = compact ? 5 : 6;
  // The pill's 1px border eats into the absolute-positioning area (child top/left
  // insets are measured from inside the border), so subtract it on both axes —
  // otherwise the circle sits ~2px low and the icon row crowds the right edge.
  const BORDER = 1;
  const indicatorSize = barHeight - BORDER * 2 - indicatorInset * 2;
  const travel = barWidth ? Math.max(0, barWidth - BORDER * 2 - indicatorInset * 2 - indicatorSize) : 0;
  const visibleRoutes = VISIBLE_TABS.map((name) => state.routes.find((route) => route.name === name)).filter(
    (route): route is { key: string; name: string } => Boolean(route),
  );
  const activeName = state.routes[state.index]?.name;
  // -1 when on a non-tab route (e.g. free-write practice): no tab is highlighted.
  const activeIndex = visibleRoutes.findIndex((route) => route.name === activeName);
  const step = visibleRoutes.length > 1 ? travel / (visibleRoutes.length - 1) : 0;

  useEffect(() => {
    if (!barWidth || activeIndex < 0) return;
    const toValue = activeIndex * step;
    if (reduced) {
      indicatorX.setValue(toValue);
      return;
    }
    Animated.spring(indicatorX, {
      toValue,
      damping: 21,
      mass: 0.8,
      stiffness: 230,
      useNativeDriver: process.env.EXPO_OS !== "web",
    }).start();
  }, [barWidth, indicatorX, reduced, activeIndex, step]);

  return (
    // A floating dock, not a bar: transparent overlay so screen content runs
    // beneath it (scroll surfaces pad their own bottoms to stay reachable).
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: compact ? spacing.sm : spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: Math.max(insets.bottom, spacing.sm),
      }}
    >
      <View
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        style={{
          alignSelf: "center",
          width: "100%",
          maxWidth: 200,
          height: barHeight,
          borderRadius: 999,
          backgroundColor: colors.navy,
          borderColor: "rgba(255, 253, 246, 0.16)",
          borderWidth: BORDER,
          overflow: "hidden",
          boxShadow: "0 16px 36px rgba(35, 36, 77, 0.30)",
        }}
      >
        {barWidth && activeIndex >= 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: indicatorInset,
              top: indicatorInset,
              width: indicatorSize,
              height: indicatorSize,
              borderRadius: 999,
              backgroundColor: colors.pen,
              transform: [{ translateX: indicatorX }],
            }}
          />
        ) : null}
        {visibleRoutes.map((route, index) => {
          const options = descriptors[route.key]?.options;
          const label =
            typeof options?.tabBarLabel === "string"
              ? options.tabBarLabel
              : options?.title ?? tabLabels[route.name] ?? route.name;
          const isFocused = activeIndex === index;

          return (
            <TabBarButton
              key={route.key}
              label={label}
              icon={tabIcons[route.name] ?? tabIcons.index}
              isFocused={isFocused}
              left={indicatorInset + index * step}
              top={indicatorInset}
              size={indicatorSize}
              compact={compact}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!isFocused && !event.defaultPrevented) {
                  // Dock hops slide the same way swipes do: toward the tab's side.
                  if (activeIndex >= 0 && index !== activeIndex) {
                    setScreenTransitionDirection(index > activeIndex ? "fromRight" : "fromLeft");
                  }
                  navigation.navigate(route.name);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabBarButton({
  label,
  icon,
  isFocused,
  left,
  top,
  size,
  compact,
  onPress,
}: {
  label: string;
  icon: IconName;
  isFocused: boolean;
  left: number;
  top: number;
  size: number;
  compact: boolean;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(isFocused ? 1 : 0);
      return;
    }
    Animated.timing(progress, {
      toValue: isFocused ? 1 : 0,
      duration: 190,
      useNativeDriver: false,
    }).start();
  }, [isFocused, progress, reduced]);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={onPress}
      style={({ pressed }) => ({
        position: "absolute",
        left,
        top,
        width: size,
        height: size,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.78 : 1,
        zIndex: 1,
      })}
    >
      <Animated.View
        style={{
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.74, 1] }),
          transform: [
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.12],
              }),
            },
          ],
        }}
      >
        <SymbolView name={icon} tintColor={isFocused ? colors.white : colors.darkMuted} size={compact ? 21 : 23} />
      </Animated.View>
    </Pressable>
  );
}
