import { SymbolView } from "expo-symbols";
import { useState, type ComponentProps } from "react";
import { TextInput, useWindowDimensions, View } from "react-native";

import { PressableScale, ScreenTransition } from "@/components/motion";
import { TabSwipe } from "@/components/tab-swipe";
import { ActionButton, AppText, AssetImage, Card, LanguagePicker, Pill, Screen, ToggleRow, usePalette } from "@/components/ui";
import { colors, families, spacing } from "@/constants/theme";
import { updateSettings } from "@/lib/settings";

const avatar = require("@/assets/songul/mascot-wave.png");
const logo = require("@/assets/songul/SonGul-LOGO.png");

type IconName = ComponentProps<typeof SymbolView>["name"];
const minusIcon = { ios: "minus", android: "remove", web: "remove" } as IconName;
const plusIcon = { ios: "plus", android: "add", web: "add" } as IconName;

const GOAL_PRESETS = [5, 10, 15, 20];
const GOAL_MIN = 1;
const GOAL_MAX = 30;

function StepperButton({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  const palette = usePalette();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: disabled ? palette.border : `${colors.pen}40`,
        backgroundColor: disabled ? "transparent" : palette.settings.darkMode ? colors.darkPen50 : colors.pen50,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <SymbolView name={icon} tintColor={disabled ? palette.muted : palette.penText} size={20} />
    </PressableScale>
  );
}

/** The goal ladder: one rising bar per sentence, filled up to the goal. */
function GoalLadder({ goal }: { goal: number }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 34 }}>
      {Array.from({ length: GOAL_MAX }, (_, i) => {
        const filled = i < goal;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: 10 + (i / (GOAL_MAX - 1)) * 24,
              borderRadius: 3,
              backgroundColor: filled ? colors.teal : palette.track,
            }}
          />
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const palette = usePalette();
  const settings = palette.settings;
  const { width } = useWindowDimensions();
  const wide = width >= 900; // language + goal share a row on tablets
  const [nameDraft, setNameDraft] = useState(settings.name);

  function setGoal(value: number) {
    updateSettings({ dailyGoal: Math.max(GOAL_MIN, Math.min(GOAL_MAX, Math.round(value))) });
  }

  return (
    <ScreenTransition>
    <TabSwipe swipeRightTo="/practice">
    <Screen>
      <AppText variant="title" style={{ fontSize: 28 }}>Settings</AppText>

      {/* Profile. Name and goal are real device settings; the account details
          are [DEMO-DATA] dressing until the backend brings real sign-in. */}
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: settings.darkMode ? colors.darkPen50 : colors.pen50,
              borderWidth: 1,
              borderColor: `${colors.pen}33`,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <AssetImage source={avatar} decorative contentFit="cover" style={{ width: 64, height: 64 }} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <TextInput
              value={nameDraft}
              onChangeText={(value) => {
                setNameDraft(value);
                if (value.trim()) updateSettings({ name: value.trim() });
              }}
              accessibilityLabel="Display name"
              style={{
                fontFamily: families.bodyExtra,
                fontSize: 19,
                color: palette.text,
                paddingVertical: 2,
                borderBottomWidth: 1,
                borderBottomColor: palette.border,
              }}
            />
            <AppText color={palette.muted}>dave@songul.app</AppText>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
              <Pill tone="green">Member since May 2026</Pill>
              <Pill tone="gold">Sample</Pill>
            </View>
          </View>
        </View>
        <ActionButton tone="ghost" disabled>Sign out</ActionButton>
        <AppText variant="label" color={palette.muted}>
          Local profile · sign-in and sync arrive with the backend
        </AppText>
      </Card>

      {/* Language and daily goal share a row on wide screens. */}
      <View style={{ flexDirection: wide ? "row" : "column", gap: spacing.lg, alignItems: "stretch" }}>
        <Card style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
          <AppText variant="title">Language</AppText>
          <LanguagePicker />
        </Card>

        {/* Daily goal: pick a preset or dial in your own. */}
        <Card style={{ flex: wide ? 1 : undefined, minWidth: 0, gap: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <AppText variant="title">Daily goal</AppText>
            <AppText color={palette.muted}>{`about ${Math.round(settings.dailyGoal * 1.5)} min a day`}</AppText>
          </View>

          <GoalLadder goal={settings.dailyGoal} />

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.lg }}>
            <StepperButton icon={minusIcon} label="Lower the daily goal" onPress={() => setGoal(settings.dailyGoal - 1)} disabled={settings.dailyGoal <= GOAL_MIN} />
            <View style={{ alignItems: "center", minWidth: 130 }}>
              <AppText variant="metric" color={colors.teal} style={{ fontVariant: ["tabular-nums"] }}>
                {settings.dailyGoal}
              </AppText>
              <AppText color={palette.muted}>{settings.dailyGoal === 1 ? "sentence a day" : "sentences a day"}</AppText>
            </View>
            <StepperButton icon={plusIcon} label="Raise the daily goal" onPress={() => setGoal(settings.dailyGoal + 1)} disabled={settings.dailyGoal >= GOAL_MAX} />
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center" }}>
            {GOAL_PRESETS.map((preset) => {
              const active = preset === settings.dailyGoal;
              return (
                <PressableScale
                  key={preset}
                  onPress={() => setGoal(preset)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Pill tone={active ? "blue" : "green"}>{`${preset} sentences`}</Pill>
                </PressableScale>
              );
            })}
          </View>
        </Card>
      </View>

      <Card>
        <ToggleRow title="Reminders" detail="Daily practice reminder preference." value={settings.reminders} onValueChange={(reminders) => updateSettings({ reminders })} />
        <ToggleRow title="Tracing guide" detail="Show guide lines on the writing pad." value={settings.tracingGuide} onValueChange={(tracingGuide) => updateSettings({ tracingGuide })} />
        <ToggleRow title="Save my writing" detail="Persist stroke arrays with scores and feedback." value={settings.saveWriting} onValueChange={(saveWriting) => updateSettings({ saveWriting })} />
        <ToggleRow title="Stylus-only writing" detail="Only the pen (or a mouse) draws; fingers and palms never leave marks. Turn off to write with a fingertip." value={settings.penFocus} onValueChange={(penFocus) => updateSettings({ penFocus })} />
        <ToggleRow title="Dark mode" detail="Dim the interface for evening practice." value={settings.darkMode} onValueChange={(darkMode) => updateSettings({ darkMode })} />
      </Card>

      <Card>
        <AppText variant="title">Backend</AppText>
        <AppText color={palette.muted} selectable>EXPO_PUBLIC_SONGUL_API_BASE_URL must point to the server hosting /api/check. Gemini keys stay server-side.</AppText>
        <Pill tone="gold">Internal test build</Pill>
      </Card>

      {/* Brand + legal footer */}
      <View style={{ alignItems: "center", gap: spacing.xs, paddingVertical: spacing.md }}>
        <AssetImage
          source={logo}
          accessibilityLabel="SonGul"
          tintColor={settings.darkMode ? colors.darkText : undefined}
          style={{ width: 118, height: 42, opacity: 0.92 }}
        />
        <AppText variant="label" color={palette.muted}>손글 · Write Korean by hand</AppText>
        <AppText color={palette.muted} style={{ fontSize: 12.5, marginTop: spacing.xs }}>
          © 2026 SonGul. All rights reserved.
        </AppText>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <AppText color={palette.muted} style={{ fontSize: 12 }}>Terms of Service</AppText>
          <AppText color={palette.muted} style={{ fontSize: 12 }}>·</AppText>
          <AppText color={palette.muted} style={{ fontSize: 12 }}>Privacy Policy</AppText>
          <AppText color={palette.muted} style={{ fontSize: 12 }}>·</AppText>
          <AppText color={palette.muted} style={{ fontSize: 12 }}>Open-source licenses</AppText>
        </View>
        <AppText color={palette.muted} style={{ fontSize: 11.5 }}>Version 1.0.0 · internal test build</AppText>
      </View>
    </Screen>
    </TabSwipe>
    </ScreenTransition>
  );
}
