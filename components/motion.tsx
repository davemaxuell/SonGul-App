// Shared motion primitives, built on react-native-reanimated (UI thread on
// native, CSS-backed on web). Every primitive honors the OS "reduce motion"
// setting via useReducedMotion(): when on, large motion is replaced by an
// instant/visible state so the interface stays usable and WCAG-compliant.
import { useFocusEffect } from "expo-router";
import { forwardRef, useCallback, useEffect, type ReactNode } from "react";
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { duration, easing, press, spring, stagger, staggerDelay } from "@/constants/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Resting -> pressed scale. Defaults to a button-sized 0.96. */
  scaleTo?: number;
  /** Resting -> pressed opacity. */
  dimTo?: number;
};

/**
 * A Pressable with a spring scale + dim on press. Drop-in for Pressable; works
 * with expo-router <Link asChild> because it forwards all Pressable props.
 */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { children, style, scaleTo = press.scale, dimTo = press.dim, onPressIn, onPressOut, ...rest },
  ref,
) {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : 1 - (1 - scaleTo) * pressed.value }],
    opacity: 1 - (1 - dimTo) * pressed.value,
  }));
  return (
    <AnimatedPressable
      ref={ref}
      {...rest}
      onPressIn={(event) => {
        pressed.value = withTiming(1, { duration: duration.press });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.value = withSpring(0, spring.selection);
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
});

/**
 * Mount entrance: fade + small rise, optionally staggered by `index`. Returns an
 * animated style to merge onto an Animated.View. When `enabled` is false or the
 * user prefers reduced motion, the element is simply visible (no motion).
 */
export function useEntrance(index = 0, enabled = true) {
  const reduced = useReducedMotion();
  const active = enabled && !reduced;
  const progress = useSharedValue(active ? 0 : 1);
  useEffect(() => {
    if (active) {
      progress.value = 0;
      progress.value = withDelay(
        staggerDelay(index),
        withTiming(1, { duration: duration.enter, easing: easing.out }),
      );
    } else {
      progress.value = 1;
    }
  }, [active, index, progress]);
  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * stagger.rise }],
  }));
}

export function Entrance({
  index = 0,
  enabled = true,
  style,
  children,
}: {
  index?: number;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const entrance = useEntrance(index, enabled);
  return <Animated.View style={[style, entrance]}>{children}</Animated.View>;
}

// One-shot directional intent for the next screen focus. Swipes and dock taps
// declare which side the incoming menu should slide in from; the next
// ScreenTransition to gain focus consumes it (then it resets, so unrelated
// navigations fall back to the neutral fade + rise).
type SlideDirection = "fromRight" | "fromLeft";
let pendingDirection: SlideDirection | null = null;

export function setScreenTransitionDirection(direction: SlideDirection) {
  pendingDirection = direction;
}

const SLIDE_DISTANCE = 64;

/**
 * Screen-switch transition: a soft fade + rise on ordinary focus, or a
 * directional slide when the navigation was a swipe / dock hop (see
 * setScreenTransitionDirection). Resets on blur (invisible —
 * react-navigation hides blurred screens), so re-entering a tab animates
 * again. `nativeStackHandles` opts the wrapper out on native, where the stack
 * navigator already slides the screen — without it the two animations double up.
 */
export function ScreenTransition({
  children,
  style,
  nativeStackHandles = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  nativeStackHandles?: boolean;
}) {
  const reduced = useReducedMotion();
  const skip = reduced || (nativeStackHandles && process.env.EXPO_OS !== "web");
  const progress = useSharedValue(skip ? 1 : 0);
  const slideFrom = useSharedValue(0); // px the screen starts offset by; 0 = fade+rise

  useFocusEffect(
    useCallback(() => {
      const direction = pendingDirection;
      pendingDirection = null;
      if (skip) {
        progress.value = 1;
        return;
      }
      slideFrom.value = direction === "fromRight" ? SLIDE_DISTANCE : direction === "fromLeft" ? -SLIDE_DISTANCE : 0;
      progress.value = 0;
      progress.value = withTiming(1, { duration: duration.screen, easing: easing.out });
      return () => {
        progress.value = 0;
      };
    }, [skip, progress, slideFrom]),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: (1 - progress.value) * slideFrom.value },
      { translateY: slideFrom.value === 0 ? (1 - progress.value) * 14 : 0 },
    ],
  }));

  return <Animated.View style={[{ flex: 1 }, style, animatedStyle]}>{children}</Animated.View>;
}

/**
 * A two-faced rotateY flip. Faces are stacked and cross-faded at the 90deg
 * midpoint, so it reads as a flip without relying on backfaceVisibility (which
 * is inconsistent on react-native-web). `flipped` is controlled by the parent.
 */
export function FlipCard({
  flipped,
  front,
  back,
  style,
  faceStyle,
  onPress,
  accessibilityLabel,
}: {
  flipped: boolean;
  front: ReactNode;
  back: ReactNode;
  style?: StyleProp<ViewStyle>;
  faceStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const reduced = useReducedMotion();
  const rot = useSharedValue(flipped ? 1 : 0);
  useEffect(() => {
    rot.value = reduced
      ? flipped
        ? 1
        : 0
      : withTiming(flipped ? 1 : 0, { duration: duration.state, easing: easing.standard });
  }, [flipped, reduced, rot]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${interpolate(rot.value, [0, 1], [0, 180])}deg` }],
    opacity: rot.value <= 0.5 ? 1 : 0,
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${interpolate(rot.value, [0, 1], [180, 360])}deg` }],
    opacity: rot.value > 0.5 ? 1 : 0,
  }));

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={press.cardScale}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: flipped }}
      style={style}
    >
      <Animated.View style={[StyleSheetAbsoluteFill, faceStyle, frontStyle]}>{front}</Animated.View>
      <Animated.View style={[StyleSheetAbsoluteFill, faceStyle, backStyle]}>{back}</Animated.View>
    </PressableScale>
  );
}

const StyleSheetAbsoluteFill: ViewStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

/**
 * A horizontal progress track whose fill wipes in from the left on mount
 * (scaleX, so no layout reflow). `fraction` is clamped to [0, 1]. Static under
 * reduce-motion.
 */
export function ProgressBar({
  fraction,
  trackColor,
  fillColor,
  height = 12,
  style,
}: {
  fraction: number;
  trackColor: string;
  fillColor: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const grow = useSharedValue(reduced ? clamped : 0);
  useEffect(() => {
    grow.value = reduced ? clamped : withTiming(clamped, { duration: duration.enter, easing: easing.out });
  }, [reduced, clamped, grow]);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value }] }));
  return (
    <View style={[{ height, borderRadius: 999, backgroundColor: trackColor, overflow: "hidden" }, style]}>
      <Animated.View
        style={[
          { width: "100%", height: "100%", borderRadius: 999, backgroundColor: fillColor, transformOrigin: "left center" },
          fillStyle,
        ]}
      />
    </View>
  );
}
