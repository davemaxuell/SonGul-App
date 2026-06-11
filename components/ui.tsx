import { Image } from "expo-image";
import type { ImageStyle } from "expo-image";
import { Link } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState, type ComponentProps, type PropsWithChildren, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { PressableScale, useEntrance } from "@/components/motion";
import { duration, easing } from "@/constants/motion";
import { colors, families, radii, shadow, spacing } from "@/constants/theme";
import { languageFlags, languageNames, translate } from "@/i18n";
import { updateSettings, useSettings } from "@/lib/settings";
import type { FeedbackResult, LanguageCode } from "@/types/songul";

export function usePalette() {
  const settings = useSettings();
  return {
    settings,
    bg: settings.darkMode ? colors.darkBg : colors.paper,
    surface: settings.darkMode ? colors.darkSurface : colors.surface,
    surfaceAlt: settings.darkMode ? colors.darkSurfaceAlt : colors.surfaceAlt,
    text: settings.darkMode ? colors.darkText : colors.ink,
    muted: settings.darkMode ? colors.darkMuted : colors.inkMuted,
    border: settings.darkMode ? colors.darkBorder : colors.border,
    // Inactive fill for charts / progress tracks (web --pen-100, themed per scheme).
    track: settings.darkMode ? colors.darkPen100 : colors.pen100,
    // Pen used as FOREGROUND (text/number/icon). Lightened on dark so it clears
    // AA contrast; the raw colors.pen is only safe as a fill (white-on-pen).
    penText: settings.darkMode ? colors.penOnDark : colors.pen,
  };
}

export function Screen({
  children,
  contentStyle,
}: PropsWithChildren<{ contentStyle?: ViewStyle }>) {
  const palette = usePalette();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={[
        { flex: 1, backgroundColor: palette.bg },
        // pan-y on the scroll container itself: vertical scrolling stays
        // native, while horizontal drags keep their pointer stream so the
        // tab-swipe gesture can complete (nested horizontal scrollers still
        // pan natively; the touch-action walk stops at them).
        process.env.EXPO_OS === "web" ? ({ touchAction: "pan-y" } as object) : null,
      ]}
      // Extra bottom padding keeps the last row clear of the floating dock.
      contentContainerStyle={[{ padding: spacing.lg, paddingBottom: 110, gap: spacing.lg }, contentStyle]}
    >
      {children}
    </ScrollView>
  );
}

export function AppText({
  children,
  variant = "body",
  color,
  selectable,
  style,
}: PropsWithChildren<{
  variant?: "hero" | "title" | "subtitle" | "body" | "label" | "metric" | "korean";
  color?: string;
  selectable?: boolean;
  style?: StyleProp<TextStyle>;
}>) {
  const palette = usePalette();
  const size =
    variant === "hero" ? 42 :
    variant === "title" ? 25 :
    variant === "subtitle" ? 18 :
    variant === "metric" ? 34 :
    variant === "label" ? 12 :
    variant === "korean" ? 28 :
    15;
  // Weight lives in the loaded family file (DESIGN.md: Poppins for display
  // levels, Inter for everything else, Noto Sans KR for Hangul). No fontWeight
  // on top — that would make browsers synthesize bold over an already-bold file.
  const fontFamily =
    variant === "hero" || variant === "title" ? families.display :
    variant === "body" ? families.bodyMedium :
    variant === "label" ? families.bodyBold :
    variant === "korean" ? families.korean :
    families.bodyExtra;
  return (
    <Text
      selectable={selectable}
      style={[
        {
          color: color ?? palette.text,
          fontSize: size,
          fontFamily,
          lineHeight: Math.round(size * (variant === "korean" ? 1.45 : 1.28)),
          letterSpacing: variant === "label" ? 0.5 : 0,
        },
        variant === "label" ? { textTransform: "uppercase" } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function TText({
  k,
  fallback,
  variant,
  style,
}: {
  k: string;
  fallback: string;
  variant?: Parameters<typeof AppText>[0]["variant"];
  style?: StyleProp<TextStyle>;
}) {
  const { settings } = usePalette();
  return <AppText variant={variant} style={style}>{translate(settings.language, k, fallback)}</AppText>;
}

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: ViewStyle | ViewStyle[] }>) {
  const palette = usePalette();
  return (
    <View
      style={[
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          borderWidth: 1,
          borderRadius: radii.lg,
          padding: spacing.lg,
          gap: spacing.md,
          ...shadow.sm,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// AA-safe label colors for light mode (the bright tones below ~3:1 on a near-white
// tint at 12px). The bright tone still drives the pill's tint + border.
const pillLabelLight: Record<"blue" | "gold" | "green" | "pink", string> = {
  blue: colors.pen, // #3F51D6 ~5.9:1 on the light tint
  gold: "#8A5200", // dark amber
  green: "#2C7A4E", // dark green
  pink: "#A23D67", // dark rose
};

export function Pill({ children, tone = "blue" }: PropsWithChildren<{ tone?: "blue" | "gold" | "green" | "pink" }>) {
  const { settings } = usePalette();
  const toneColor = tone === "gold" ? colors.gold : tone === "green" ? colors.green : tone === "pink" ? colors.pink : colors.pen;
  // On dark, the warm tones clear AA on the dark tint, but pen must lighten; on
  // light, the warm tones must darken (see pillLabelLight).
  const labelColor = settings.darkMode ? (tone === "blue" ? colors.penOnDark : toneColor) : pillLabelLight[tone];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 999,
        backgroundColor: `${toneColor}1A`,
        borderColor: `${toneColor}55`,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 7,
      }}
    >
      <AppText variant="label" color={labelColor}>{children}</AppText>
    </View>
  );
}

export function ActionButton({
  children,
  href,
  onPress,
  tone = "primary",
  disabled,
}: PropsWithChildren<{
  href?: string;
  onPress?: () => void;
  tone?: "primary" | "ghost" | "danger";
  disabled?: boolean;
}>) {
  const palette = usePalette();
  const bg = tone === "primary" ? colors.pen : tone === "danger" ? colors.danger : "transparent";
  const border = tone === "ghost" ? palette.border : bg;
  const body = (
    <PressableScale
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={disabled ? { disabled: true } : {}}
      style={{
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        paddingHorizontal: spacing.lg,
        backgroundColor: disabled ? palette.border : bg,
        borderColor: border,
        borderWidth: 1,
      }}
    >
      <AppText color={tone === "ghost" ? palette.text : colors.white} style={{ fontFamily: families.bodyExtra }}>{children}</AppText>
    </PressableScale>
  );
  return href ? <Link href={href as never} asChild>{body}</Link> : body;
}

export function SectionHeader({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }) {
  const palette = usePalette();
  return (
    <View style={{ gap: spacing.sm, maxWidth: 820 }}>
      {eyebrow ? <Pill>{eyebrow}</Pill> : null}
      <AppText variant="title">{title}</AppText>
      {body ? <AppText color={palette.muted}>{body}</AppText> : null}
    </View>
  );
}

export function MetricCard({
  label,
  value,
  tone = colors.pen,
  index,
  icon,
  iconTint,
  onPress,
}: {
  label: string;
  value: string;
  tone?: string;
  index?: number;
  /** Decorative symbol next to the value (e.g. the streak flame). */
  icon?: ComponentProps<typeof SymbolView>["name"];
  iconTint?: string;
  /** Makes the tile tappable (opens its detail view). */
  onPress?: () => void;
}) {
  const palette = usePalette();
  // Mirrors the web .stat card (pen-50 fill / pen-100 border / pen value),
  // generalized so each metric tints its surface to match its accent.
  // Passing `index` opts the tile into a staggered mount entrance.
  const entrance = useEntrance(index ?? 0, index !== undefined);
  // The pen tone is too dark as text on a dark tile; lift it to penOnDark.
  const valueColor = palette.settings.darkMode && tone === colors.pen ? colors.penOnDark : tone;
  return (
    <Animated.View style={[{ flex: 1, minWidth: 145 }, entrance]}>
      <PressableScale
        disabled={!onPress}
        onPress={onPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={onPress ? `${label}: ${value}` : undefined}
        accessibilityHint={onPress ? "Shows the detailed breakdown" : undefined}
        scaleTo={0.98}
        style={{
          flex: 1,
          backgroundColor: `${tone}14`,
          borderColor: `${tone}33`,
          borderWidth: 1,
          borderRadius: radii.md,
          padding: spacing.md,
          gap: spacing.xs,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm }}>
          <AppText variant="metric" color={valueColor} style={{ fontVariant: ["tabular-nums"] }}>{value}</AppText>
          {icon ? <SymbolView name={icon} tintColor={iconTint ?? valueColor} size={26} /> : null}
        </View>
        <AppText color={palette.muted}>{label}</AppText>
      </PressableScale>
    </Animated.View>
  );
}

export function FeedbackCard({ feedback }: { feedback: FeedbackResult | null }) {
  const palette = usePalette();
  if (!feedback) {
    return (
      <Card>
        <AppText variant="title">AI Tutor Feedback</AppText>
        <AppText color={palette.muted}>Write a sentence in Practice to see live AI feedback here.</AppText>
      </Card>
    );
  }
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md, alignItems: "center" }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="label" color={palette.penText}>AI recognized</AppText>
          <AppText variant="korean" selectable>{feedback.recognized || "-"}</AppText>
        </View>
        <View style={{ alignItems: "center" }}>
          <AppText variant="metric" color={feedback.score >= 75 ? colors.green : colors.gold}>{String(feedback.score)}</AppText>
          <AppText color={palette.muted}>/100</AppText>
        </View>
      </View>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" color={colors.green}>Correction</AppText>
        <AppText variant="subtitle" selectable>{feedback.correction || "-"}</AppText>
      </View>
      {feedback.grammar_tip ? <AppText color={palette.muted} selectable>{feedback.grammar_tip}</AppText> : null}
      {feedback.issues.length ? (
        <View style={{ gap: spacing.xs }}>
          {feedback.issues.map((issue) => (
            <AppText key={issue} color={palette.muted}>- {issue}</AppText>
          ))}
        </View>
      ) : null}
      {feedback.recommendation ? <Pill tone="green">{feedback.recommendation}</Pill> : null}
    </Card>
  );
}

// Collapsed by default: the current language with a chevron; expands to the
// full flag list only while choosing.
export function LanguagePicker() {
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const codes = Object.keys(languageNames) as LanguageCode[];
  const current = palette.settings.language;
  const chevron = (
    open
      ? { ios: "chevron.up", android: "expand_less", web: "expand_less" }
      : { ios: "chevron.down", android: "expand_more", web: "expand_more" }
  ) as ComponentProps<typeof SymbolView>["name"];

  return (
    <View style={{ gap: spacing.sm }}>
      <PressableScale
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={`App language: ${languageNames[current]}`}
        accessibilityState={{ expanded: open }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: open ? colors.pen : palette.border,
          backgroundColor: palette.surface,
          paddingHorizontal: spacing.md,
          minHeight: 54,
        }}
      >
        <Text style={{ fontSize: 20, lineHeight: 24 }} accessible={false}>{languageFlags[current]}</Text>
        <AppText style={{ flex: 1 }}>{languageNames[current]}</AppText>
        <SymbolView name={chevron} tintColor={palette.muted} size={20} />
      </PressableScale>

      {open ? (
        // A real dropdown: a bounded, scrollable list rather than a chip cloud.
        <View
          style={{
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: radii.md,
            backgroundColor: palette.surface,
            overflow: "hidden",
            maxHeight: 248,
          }}
        >
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {codes.map((code, i) => {
              const active = current === code;
              const activeColor = palette.settings.darkMode ? colors.penOnDark : colors.pen;
              return (
                <PressableScale
                  key={code}
                  onPress={() => {
                    updateSettings({ language: code });
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={languageNames[code]}
                  accessibilityState={{ selected: active }}
                  scaleTo={0.99}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                    minHeight: 50,
                    paddingHorizontal: spacing.md,
                    backgroundColor: active ? `${colors.pen}14` : "transparent",
                    borderBottomWidth: i === codes.length - 1 ? 0 : 1,
                    borderBottomColor: palette.border,
                  }}
                >
                  <Text style={{ fontSize: 18, lineHeight: 22 }} accessible={false}>
                    {languageFlags[code]}
                  </Text>
                  <AppText style={{ flex: 1 }} color={active ? activeColor : palette.text}>
                    {languageNames[code]}
                  </AppText>
                  {active ? (
                    <SymbolView
                      name={{ ios: "checkmark", android: "check", web: "check" } as ComponentProps<typeof SymbolView>["name"]}
                      tintColor={activeColor}
                      size={18}
                    />
                  ) : null}
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export function ToggleRow({
  title,
  detail,
  value,
  onValueChange,
}: {
  title: string;
  detail: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const palette = usePalette();
  const reduced = useReducedMotion();
  const on = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    on.value = reduced
      ? value
        ? 1
        : 0
      : withTiming(value ? 1 : 0, { duration: duration.state, easing: easing.standard });
  }, [value, reduced, on]);
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [palette.border, colors.pen]),
  }));
  const knobStyle = useAnimatedStyle(() => ({
    // Track is 56 wide with 3px padding and a 26px knob: travel = 56 - 3*2 - 26.
    transform: [{ translateX: on.value * 24 }],
  }));
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={{
        minHeight: 68,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: palette.border,
      }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="subtitle">{title}</AppText>
        <AppText color={palette.muted}>{detail}</AppText>
      </View>
      <Animated.View
        style={[
          { width: 56, height: 32, borderRadius: 999, padding: 3, justifyContent: "center" },
          trackStyle,
        ]}
      >
        <Animated.View style={[{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.white }, knobStyle]} />
      </Animated.View>
    </Pressable>
  );
}

export function AssetImage({
  source,
  style,
  contentFit = "contain",
  accessibilityLabel,
  decorative,
  tintColor,
}: {
  source: number;
  style?: StyleProp<ImageStyle>;
  contentFit?: "contain" | "cover";
  accessibilityLabel?: string;
  decorative?: boolean;
  /** Recolor a transparent-background asset (e.g. the wordmark on navy). */
  tintColor?: string;
}) {
  return (
    <Image
      source={source}
      contentFit={contentFit}
      style={style}
      tintColor={tintColor}
      accessible={decorative ? false : accessibilityLabel ? true : undefined}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      alt={decorative ? "" : accessibilityLabel}
    />
  );
}

export function HorizontalScroller({ children, contentStyle }: { children: ReactNode; contentStyle?: ViewStyle }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: spacing.md }, contentStyle]}>
      {children}
    </ScrollView>
  );
}
