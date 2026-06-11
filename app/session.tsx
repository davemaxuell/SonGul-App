import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AiThinkingOverlay } from "@/components/ai-loading";
import { PressableScale, ScreenTransition } from "@/components/motion";
import { SpeakButton } from "@/components/speak-button";
import { ActionButton, AppText, AssetImage, Card, Pill, usePalette } from "@/components/ui";
import { WritingSurface, type WritingSurfaceHandle } from "@/components/writing-surface";
import { colors, families, radii, spacing } from "@/constants/theme";
import { recordWriteAttempt } from "@/lib/database";
import { buildQueue } from "@/lib/learning";
import { useSettings } from "@/lib/settings";
import { gradeWriting, SKILL_TIP } from "@/services/grading";
import type { GradeResult, QueueEntry, SkillKey, Stroke } from "@/types/songul";

const mascot = require("@/assets/songul/mascot-tutor.png");

const KIND_LABEL = { new: "New", due: "Review", drill: "Drill" } as const;
const TYPE_LABEL = { jamo: "Letter", syllable: "Syllable", word: "Word", sentence: "Sentence" } as const;
const SKILL_LABEL: Record<SkillKey, string> = {
  shape: "Shape",
  stroke_order: "Stroke order",
  spacing: "Spacing",
  grammar: "Grammar",
};

export default function SessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const settings = useSettings();
  const surfaceRef = useRef<WritingSurfaceHandle>(null);

  const [queue] = useState<QueueEntry[]>(() => buildQueue());
  const [index, setIndex] = useState(0);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [selectedChar, setSelectedChar] = useState<number | null>(null);

  const entry = queue[index];
  const done = index >= queue.length;

  function reset() {
    surfaceRef.current?.clear();
    setStrokes([]);
    setGrade(null);
    setSelectedChar(null);
  }

  async function check() {
    if (!entry || !strokes.length) return;
    setChecking(true);
    try {
      const image = (await surfaceRef.current?.getImageBase64()) ?? "";
      // Floor the wait so the Hangul thinking animation lands; real AI latency
      // will fill this naturally once the backend exists.
      const [outcome] = await Promise.allSettled([
        gradeWriting({ image, target: entry.item.content, itemType: entry.item.type }),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (outcome.status === "rejected") throw outcome.reason;
      recordWriteAttempt(entry.item, outcome.value, entry.scaffold, settings.saveWriting ? strokes : undefined);
      setGrade(outcome.value);
    } catch {
      // The mock never throws; a real endpoint failure leaves the user on the canvas to retry.
    } finally {
      setChecking(false);
    }
  }

  function next() {
    setIndex((i) => i + 1);
    reset();
  }

  if (done) {
    return (
      <ScreenTransition nativeStackHandles style={{ flex: 1, backgroundColor: palette.bg, paddingTop: insets.top }}>
        <SessionHeader index={queue.length} total={queue.length} onClose={() => router.back()} palette={palette} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.md }}>
          <AssetImage source={mascot} decorative style={{ width: 110, height: 110 }} />
          <AppText variant="hero" color={palette.penText}>완료!</AppText>
          <AppText variant="title">Session complete</AppText>
          <Text
            style={{
              fontFamily: families.hand,
              fontSize: 19,
              lineHeight: 25,
              color: palette.penText,
              transform: [{ rotate: "-0.5deg" }],
            }}
          >
            오늘도 잘했어요! — Great work today.
          </Text>
          <AppText color={palette.muted} style={{ textAlign: "center", maxWidth: 360 }}>
            You practiced {queue.length} {queue.length === 1 ? "item" : "items"}. Come back when reviews are due to keep them.
          </AppText>
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
            <ActionButton tone="ghost" onPress={() => { setIndex(0); reset(); }}>Practice again</ActionButton>
            <ActionButton onPress={() => router.back()}>Done</ActionButton>
          </View>
        </View>
      </ScreenTransition>
    );
  }

  const { item, kind, scaffold } = entry;
  const showModel = scaffold !== "memory";
  const chars = grade ? grade.perCharacter : [];

  return (
    <ScreenTransition nativeStackHandles style={{ flex: 1, backgroundColor: palette.bg, paddingTop: insets.top }}>
      <SessionHeader index={index} total={queue.length} onClose={() => router.back()} palette={palette} />

      {/* Prompt / scaffold */}
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" }}>
        <Pill tone={kind === "due" ? "green" : kind === "drill" ? "gold" : "blue"}>
          {`${KIND_LABEL[kind]} · ${TYPE_LABEL[item.type]}`}
        </Pill>
        {showModel ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <AppText variant="korean" style={{ fontSize: item.type === "sentence" ? 30 : 44 }}>{item.content}</AppText>
            <SpeakButton text={item.content} size={34} tint={palette.penText} />
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <AppText variant="title" color={palette.muted}>Write it from memory</AppText>
            <SpeakButton text={item.content} size={34} tint={palette.penText} accessibilityLabel="Hear the target you should write" />
          </View>
        )}
        {item.romanization ? <AppText color={palette.muted}>{item.romanization}{item.meaning ? ` · ${item.meaning}` : ""}</AppText> : null}
      </View>

      {/* Canvas */}
      <WritingSurface
        ref={surfaceRef}
        tool="pen"
        penFocus={settings.penFocus}
        tracingGuide={false}
        eraserMode={settings.eraserMode}
        pageFormat="hangul"
        strokeColor={colors.ink}
        strokeWidth={6}
        correctionOverlay={scaffold === "trace" ? item.content : undefined}
        style={{ flex: 1, margin: spacing.lg, marginBottom: spacing.sm }}
        onStrokesChange={setStrokes}
        onBeginDrawing={() => setSelectedChar(null)}
      />

      {/* Result */}
      {grade ? (
        <Card style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm, gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {chars.map((c, i) => {
                const tone = c.ok ? colors.green : colors.gold;
                return (
                  <PressableScale
                    key={`${c.char}-${i}`}
                    onPress={() => setSelectedChar(selectedChar === i ? null : i)}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.char}: ${c.ok ? "good" : c.issues.map((s) => SKILL_LABEL[s]).join(", ")}`}
                    style={{
                      minHeight: 44,
                      minWidth: 40,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: radii.sm,
                      backgroundColor: `${tone}1A`,
                      borderWidth: selectedChar === i ? 2 : 1,
                      borderColor: tone,
                      paddingHorizontal: 8,
                    }}
                  >
                    <AppText variant="korean" style={{ fontSize: 22 }}>{c.char}</AppText>
                  </PressableScale>
                );
              })}
            </View>
            <AppText variant="metric" color={grade.score >= 85 ? colors.green : grade.score >= 75 ? palette.penText : colors.gold}>
              {grade.score}
            </AppText>
          </View>

          {selectedChar !== null && chars[selectedChar] ? (
            // The tutor's margin note: handwritten, green for praise, red ink
            // only when something needs correcting.
            <Text
              style={{
                fontFamily: families.hand,
                fontSize: 17,
                lineHeight: 23,
                color: chars[selectedChar].ok ? colors.green : colors.danger,
                transform: [{ rotate: "-0.5deg" }],
              }}
            >
              {chars[selectedChar].ok
                ? `${chars[selectedChar].char} — looks good. Nice strokes!`
                : `${chars[selectedChar].char} — ${SKILL_TIP[chars[selectedChar].issues[0]]}`}
            </Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {item.skillTags.map((skill) => (
                <Pill key={skill} tone={grade.perSkill[skill] >= 75 ? "green" : "gold"}>
                  {`${SKILL_LABEL[skill]} ${grade.perSkill[skill]}`}
                </Pill>
              ))}
            </View>
          )}

          {grade.recommendation ? <AppText color={palette.muted}>{grade.recommendation}</AppText> : null}
        </Card>
      ) : null}

      {/* Controls */}
      <View style={{ flexDirection: "row", gap: spacing.md, padding: spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.lg) }}>
        {grade ? (
          <>
            <View style={{ flex: 1 }}>
              <ActionButton tone="ghost" onPress={reset}>Retry</ActionButton>
            </View>
            <View style={{ flex: 1 }}>
              <ActionButton onPress={next}>{index === queue.length - 1 ? "Finish" : "Next"}</ActionButton>
            </View>
          </>
        ) : (
          <>
            <View style={{ flex: 1 }}>
              <ActionButton tone="ghost" onPress={reset} disabled={!strokes.length}>Clear</ActionButton>
            </View>
            <View style={{ flex: 1 }}>
              <ActionButton onPress={check} disabled={!strokes.length || checking}>{checking ? "Checking…" : "Check"}</ActionButton>
            </View>
          </>
        )}
      </View>

      {/* AI grading veil while the strokes are checked. */}
      <AiThinkingOverlay visible={checking} captionKo="글씨를 읽는 중" caption="Checking your strokes…" />
    </ScreenTransition>
  );
}

function SessionHeader({
  index,
  total,
  onClose,
  palette,
}: {
  index: number;
  total: number;
  onClose: () => void;
  palette: ReturnType<typeof usePalette>;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
      <AppText variant="label" color={palette.muted}>{Math.min(index + 1, total)} / {total}</AppText>
      <PressableScale onPress={onClose} accessibilityRole="button" accessibilityLabel="Close session" hitSlop={12} style={{ minHeight: 44, justifyContent: "center" }}>
        <AppText color={palette.penText} style={{ fontFamily: families.bodyExtra }}>Close</AppText>
      </PressableScale>
    </View>
  );
}
