import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { AiThinkingOverlay } from "@/components/ai-loading";
import { PressableScale, ScreenTransition } from "@/components/motion";
import { SpeakButton } from "@/components/speak-button";
import { ActionButton, AppText, Pill, usePalette } from "@/components/ui";
import { Worksheet } from "@/components/worksheet";
import { WritingSurface, type WritingSurfaceHandle } from "@/components/writing-surface";
import { duration, easing } from "@/constants/motion";
import { colors, radii, spacing } from "@/constants/theme";
import { coachExerciseTypes, dealCoachExercise, type CoachExercise, type CoachExerciseType } from "@/data/demo-coach"; // [DEMO-DATA]
import { getCanvas, getRecentPracticeFeedbacks, saveCanvas, savePracticeAttempt } from "@/lib/database";
import { getSettings, updateSettings } from "@/lib/settings";
import { checkWriting, describeApiError, getOfflineDemoFeedback } from "@/services/check-writing";
import type { EraserMode, FeedbackHistoryItem, FeedbackResult, PageFormat, Stroke, WritingTool } from "@/types/songul";

type IconName = ComponentProps<typeof SymbolView>["name"];
type PracticePanel = "feedback" | "history" | "error" | "coach" | null;
type ToolPanel = "color" | "width" | "eraser" | "page" | null;

const freeWritingPrompt = "Practice note";
const inkColors = [colors.ink, colors.pen, colors.green, colors.gold, colors.pink];
const strokeWidths = [3, 5, 8];
const pageFormatOptions: { value: PageFormat; label: string; background: string; preview: PageFormat }[] = [
  { value: "blank", label: "Blank page", background: colors.white, preview: "blank" },
  { value: "lined", label: "Lined page", background: colors.paperWarm, preview: "lined" },
  { value: "grid", label: "Grid page", background: colors.surface, preview: "grid" },
  { value: "hangul", label: "Hangul guide", background: colors.white, preview: "hangul" },
];

const icons = {
  pen: { ios: "pencil", android: "edit", web: "edit" } as IconName,
  marker: { ios: "highlighter", android: "ink_highlighter", web: "ink_highlighter" } as IconName,
  eraser: { ios: "eraser", android: "ink_eraser", web: "ink_eraser" } as IconName,
  eraserStroke: { ios: "xmark.circle", android: "layers_clear", web: "layers_clear" } as IconName,
  palette: { ios: "paintpalette", android: "palette", web: "palette" } as IconName,
  width: { ios: "lineweight", android: "line_weight", web: "line_weight" } as IconName,
  page: { ios: "doc.text", android: "article", web: "article" } as IconName,
  undo: { ios: "arrow.uturn.backward", android: "undo", web: "undo" } as IconName,
  redo: { ios: "arrow.uturn.forward", android: "redo", web: "redo" } as IconName,
  clear: { ios: "trash", android: "delete", web: "delete" } as IconName,
  guide: { ios: "square.grid.3x3", android: "grid_on", web: "grid_on" } as IconName,
  history: { ios: "clock.arrow.circlepath", android: "history", web: "history" } as IconName,
  check: { ios: "checkmark.circle.fill", android: "check_circle", web: "check_circle" } as IconName,
  close: { ios: "xmark", android: "close", web: "close" } as IconName,
  coach: { ios: "sparkles", android: "auto_awesome", web: "auto_awesome" } as IconName,
  refresh: { ios: "arrow.clockwise", android: "refresh", web: "refresh" } as IconName,
  newPage: { ios: "plus", android: "add", web: "add" } as IconName,
};

// [DEMO-DATA] icons for the coach exercise menu.
const coachTypeIcons: Record<CoachExerciseType, IconName> = {
  topic: { ios: "lightbulb", android: "lightbulb", web: "lightbulb" } as IconName,
  reading: { ios: "book", android: "menu_book", web: "menu_book" } as IconName,
  dialogue: { ios: "bubble.left.and.bubble.right", android: "forum", web: "forum" } as IconName,
  fill_blank: { ios: "rectangle.and.pencil.and.ellipsis", android: "edit_note", web: "edit_note" } as IconName,
  transform: { ios: "arrow.triangle.2.circlepath", android: "autorenew", web: "autorenew" } as IconName,
  translate: { ios: "character.book.closed", android: "translate", web: "translate" } as IconName,
  dictation: { ios: "speaker.wave.2", android: "volume_up", web: "volume_up" } as IconName,
};

export default function PracticeScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Opened from Home's "Saved pages" (?canvas=<id>&t=<nonce>) or the New page
  // tile (?fresh=<nonce>). The nonce makes re-opening the same page re-fire.
  const params = useLocalSearchParams<{ canvas?: string; fresh?: string; t?: string }>();
  const railTop = Math.max(insets.top + 92, 88);
  const surfaceRef = useRef<WritingSurfaceHandle>(null);
  const [tool, setTool] = useState<WritingTool>("pen");
  const [strokeColor, setStrokeColor] = useState(colors.ink);
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null);
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackHistoryItem[]>([]);
  const [panel, setPanel] = useState<PracticePanel>(null);
  const [openToolPanel, setOpenToolPanel] = useState<ToolPanel>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [checking, setChecking] = useState(false);
  // [DEMO-DATA] the printed coach sheet currently on the page, if any.
  const [exercise, setExercise] = useState<CoachExercise | null>(null);

  // The coach rail slides along the right edge: drag anywhere on it to move
  // it, x stays locked. Clamped so it can't leave the screen.
  const coachDragY = useSharedValue(0);
  const coachDrag = useRef<{ id: number; startY: number; startOffset: number } | null>(null);
  const [coachRailHeight, setCoachRailHeight] = useState(0);
  const coachRailStyle = useAnimatedStyle(() => ({ transform: [{ translateY: coachDragY.value }] }));
  function pointerY(event: { nativeEvent: unknown }) {
    const native = event.nativeEvent as { clientY?: number; offsetY: number };
    return native.clientY ?? native.offsetY;
  }
  function coachDragMove(event: { nativeEvent: unknown }) {
    const drag = coachDrag.current;
    if (!drag || (event.nativeEvent as { pointerId: number }).pointerId !== drag.id) return;
    const min = -(railTop - insets.top - 10);
    const max = Math.max(min, windowHeight - railTop - coachRailHeight - 16);
    coachDragY.value = Math.min(max, Math.max(min, drag.startOffset + (pointerY(event) - drag.startY)));
  }

  // ---- The page persists itself (note-app behavior) ----
  // Refs, not state, so the debounced writer and the blur flush never act on a
  // stale page id or stale ink.
  const canvasIdRef = useRef<number | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistPage = useCallback(async () => {
    // Snapshot now; only adopt the returned id if the page wasn't swapped out
    // (New page / open-saved) while the write was in flight.
    const id = canvasIdRef.current;
    const ink = strokesRef.current;
    try {
      const saved = await saveCanvas(id, ink, getSettings().pageFormat);
      if (canvasIdRef.current === id && strokesRef.current === ink) {
        canvasIdRef.current = saved;
      }
    } catch (err) {
      console.warn("Could not auto-save the page", err);
    }
  }, []);

  const flushPendingSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      void persistPage();
    }
  }, [persistPage]);

  function handleStrokesChange(next: Stroke[]) {
    setStrokes(next);
    strokesRef.current = next;
    if (!palette.settings.saveWriting) return;
    if (!next.length && canvasIdRef.current === null) return; // nothing to save yet
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persistPage, 900);
  }

  // Leaving the tab flushes any pending ink immediately.
  useFocusEffect(
    useCallback(() => {
      return flushPendingSave;
    }, [flushPendingSave]),
  );

  // React to Home: open a saved page, or start a fresh one.
  useEffect(() => {
    const id = params.canvas ? Number(params.canvas) : null;
    if (id && Number.isFinite(id)) {
      flushPendingSave(); // the previous page's ink first
      getCanvas(id).then((page) => {
        if (!page) return;
        canvasIdRef.current = page.id;
        strokesRef.current = page.strokes;
        surfaceRef.current?.loadStrokes(page.strokes);
        setStrokes(page.strokes);
        setExercise(null);
        setFeedback(null);
        setError(null);
        if (page.pageFormat) updateSettings({ pageFormat: page.pageFormat as PageFormat });
      });
    } else if (params.fresh) {
      newPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.canvas, params.fresh, params.t]);

  function newPage() {
    flushPendingSave(); // persist the old page's last ink before swapping it out
    canvasIdRef.current = null;
    strokesRef.current = [];
    surfaceRef.current?.clear();
    setExercise(null);
    setFeedback(null);
    setError(null);
    haptic("selection");
  }

  async function haptic(kind: "selection" | "success" | "error") {
    if (process.env.EXPO_OS !== "ios") return;
    if (kind === "selection") await Haptics.selectionAsync();
    if (kind === "success") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (kind === "error") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  function toggleToolPanel(nextPanel: Exclude<ToolPanel, null>) {
    setOpenToolPanel((current) => (current === nextPanel ? null : nextPanel));
    haptic("selection");
  }

  function setEraserMode(mode: EraserMode) {
    updateSettings({ eraserMode: mode });
    setTool("eraser");
    haptic("selection");
  }

  function setPageFormat(pageFormat: PageFormat) {
    updateSettings({ pageFormat });
    haptic("selection");
  }

  function refreshHistory() {
    try {
      setFeedbackHistory(getRecentPracticeFeedbacks());
    } catch (err) {
      console.warn("Could not load previous feedback", err);
      setFeedbackHistory([]);
    }
  }

  async function persistResult(result: FeedbackResult) {
    try {
      savePracticeAttempt({
        prompt: freeWritingPrompt,
        feedback: result,
        strokes: palette.settings.saveWriting ? strokes : undefined,
      });
      refreshHistory();
    } catch (err) {
      console.warn("Could not save practice feedback", err);
    }
    setFeedback(result);
    setError(null);
    setPanel("feedback");
    await haptic("success");
  }

  async function runCheck() {
    if (!strokes.length) {
      setError({ title: "Canvas is empty", detail: "Write a short Korean note before checking your work." });
      setPanel("error");
      await haptic("error");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const image = await surfaceRef.current?.getImageBase64();
      if (!image) throw new Error("Could not capture the writing surface.");
      // Floor the wait so the Hangul thinking animation lands; real AI latency
      // will fill this naturally once the backend exists.
      const [outcome] = await Promise.allSettled([checkWriting(image)]);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (outcome.status === "rejected") throw outcome.reason;
      await persistResult(outcome.value);
    } catch (err) {
      setError(describeApiError(err));
      setPanel("error");
      await haptic("error");
    } finally {
      setChecking(false);
    }
  }

  async function useDemoFeedback() {
    await persistResult(getOfflineDemoFeedback());
  }

  function openHistory() {
    refreshHistory();
    setPanel("history");
    haptic("selection");
  }

  // [DEMO-DATA] deal a sheet from the demo bank; a real /api/coach call later.
  // The modal closes right away and the blurred thinking veil takes over (same
  // path whether picked from the menu or the rail's refresh button); real
  // generation latency will fill the pause once the backend exists.
  const [coachThinking, setCoachThinking] = useState(false);
  function pickExercise(type?: CoachExerciseType) {
    setPanel(null);
    setCoachThinking(true);
    haptic("selection");
    setTimeout(() => {
      setExercise(dealCoachExercise(type));
      setCoachThinking(false);
      haptic("success");
    }, 1300);
  }

  return (
    <ScreenTransition style={{ flex: 1, backgroundColor: colors.white }}>
      <WritingSurface
        ref={surfaceRef}
        tool={tool}
        penFocus={palette.settings.penFocus}
        tracingGuide={palette.settings.tracingGuide}
        eraserMode={palette.settings.eraserMode}
        pageFormat={palette.settings.pageFormat}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        worksheet={exercise ? <Worksheet exercise={exercise} insetLeft={spacing.md + 70 + spacing.md} /> : undefined}
        fullBleed
        style={{ flex: 1 }}
        onStrokesChange={handleStrokesChange}
        onBeginDrawing={() => setError(null)}
      />

      <View pointerEvents="box-none" style={{ position: "absolute", inset: 0 }}>
        {openToolPanel ? (
          <FloatingOptionsTray>
            {openToolPanel === "color"
              ? inkColors.map((color) => (
                  <AnimatedColorButton
                    key={color}
                    color={color}
                    active={strokeColor === color}
                    onPress={() => {
                      setStrokeColor(color);
                      setTool(tool === "eraser" ? "pen" : tool);
                      haptic("selection");
                    }}
                  />
                ))
              : null}
            {openToolPanel === "width"
              ? strokeWidths.map((size) => (
                  <AnimatedWidthButton
                    key={size}
                    width={size}
                    active={strokeWidth === size}
                    onPress={() => {
                      setStrokeWidth(size);
                      haptic("selection");
                    }}
                  />
                ))
              : null}
            {openToolPanel === "eraser" ? (
              <>
                <AnimatedIconButton label="Erase touched ink" icon={icons.eraser} active={palette.settings.eraserMode === "touch"} onPress={() => setEraserMode("touch")} />
                <AnimatedIconButton label="Erase whole stroke" icon={icons.eraserStroke} active={palette.settings.eraserMode === "stroke"} onPress={() => setEraserMode("stroke")} />
              </>
            ) : null}
            {openToolPanel === "page"
              ? pageFormatOptions.map((option) => (
                  <AnimatedPageFormatButton
                    key={option.value}
                    format={option.value}
                    active={palette.settings.pageFormat === option.value}
                    onPress={() => setPageFormat(option.value)}
                  />
                ))
              : null}
          </FloatingOptionsTray>
        ) : null}

        {/* Tool rail: vertically centered on the left edge. */}
        <View pointerEvents="box-none" style={{ position: "absolute", left: spacing.md, top: 0, bottom: 0, justifyContent: "center" }}>
        <View
          style={{
            // Short viewports: the rail scrolls inside its pill instead of
            // running off the screen.
            maxHeight: Math.max(260, windowHeight - spacing.lg * 2),
            borderRadius: 34,
            borderWidth: 1,
            borderColor: `${colors.pen}26`,
            backgroundColor: "rgba(255, 253, 246, 0.94)",
            overflow: "hidden",
            boxShadow: "0 18px 50px rgba(80, 66, 30, 0.18)",
          }}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 7, gap: 8, alignItems: "center" }}>
          <AnimatedIconButton label="Pen" icon={icons.pen} active={tool === "pen"} onPress={() => { setTool("pen"); haptic("selection"); }} large />
          <AnimatedIconButton label="Marker" icon={icons.marker} active={tool === "marker"} onPress={() => { setTool("marker"); haptic("selection"); }} large />
          <AnimatedIconButton label="Eraser" icon={icons.eraser} active={tool === "eraser"} onPress={() => { setTool("eraser"); haptic("selection"); }} large />
          <RailDivider />
          <AnimatedIconButton label="Ink colors" icon={icons.palette} active={openToolPanel === "color"} onPress={() => toggleToolPanel("color")} large />
          <AnimatedIconButton label="Stroke width" icon={icons.width} active={openToolPanel === "width"} onPress={() => toggleToolPanel("width")} large />
          <AnimatedIconButton label="Eraser mode" icon={icons.eraser} active={openToolPanel === "eraser"} onPress={() => toggleToolPanel("eraser")} large />
          <AnimatedIconButton label="Page format" icon={icons.page} active={openToolPanel === "page"} onPress={() => toggleToolPanel("page")} large />
          <RailDivider />
          <AnimatedIconButton
            label="Guide lines"
            icon={icons.guide}
            active={palette.settings.tracingGuide}
            onPress={() => { updateSettings({ tracingGuide: !palette.settings.tracingGuide }); haptic("selection"); }}
            large
          />
          <AnimatedIconButton label="Previous feedback" icon={icons.history} onPress={openHistory} large />
          <AnimatedIconButton label="Check writing" icon={icons.check} active onPress={runCheck} disabled={checking || !strokes.length} loading={checking} large />
          <RailDivider />
          <AnimatedIconButton label="Undo" icon={icons.undo} onPress={() => surfaceRef.current?.undo()} large />
          <AnimatedIconButton label="Redo" icon={icons.redo} onPress={() => surfaceRef.current?.redo()} large />
          <AnimatedIconButton label="New page" icon={icons.newPage} onPress={newPage} large />
          <AnimatedIconButton label="Clear" icon={icons.clear} danger onPress={() => { surfaceRef.current?.clear(); setFeedback(null); }} large />
          </ScrollView>
        </View>
        </View>

        {/* AI coach rail (right). Drag it up or down — it stays locked to the
            edge. [DEMO-DATA] exercises until the backend lands. */}
        <Reanimated.View
          onLayout={(event) => setCoachRailHeight(event.nativeEvent.layout.height)}
          onPointerDown={(event) => {
            coachDrag.current = {
              id: (event.nativeEvent as unknown as { pointerId: number }).pointerId,
              startY: pointerY(event),
              startOffset: coachDragY.value,
            };
          }}
          onPointerMove={coachDragMove}
          onPointerUp={() => { coachDrag.current = null; }}
          onPointerCancel={() => { coachDrag.current = null; }}
          style={[
            {
              position: "absolute",
              right: spacing.md,
              top: railTop,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: `${colors.pen}26`,
              backgroundColor: "rgba(255, 253, 246, 0.94)",
              padding: 7,
              gap: 8,
              alignItems: "center",
              boxShadow: "0 18px 50px rgba(80, 66, 30, 0.18)",
            },
            process.env.EXPO_OS === "web" ? ({ touchAction: "none" } as object) : null,
            coachRailStyle,
          ]}
        >
          {/* Grab handle */}
          <View
            accessible
            accessibilityLabel="AI coach tools. Drag to move along the edge."
            style={{ width: 48, height: 14, alignItems: "center", justifyContent: "center" }}
          >
            <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: `${colors.pen}40` }} />
          </View>
          <AnimatedIconButton
            label="AI coach"
            icon={icons.coach}
            active={panel === "coach" || exercise !== null}
            onPress={() => { setPanel("coach"); haptic("selection"); }}
            large
          />
          {exercise ? (
            <>
              <RailDivider />
              {exercise.audio ? (
                <SpeakButton
                  text={exercise.audio}
                  size={48}
                  accessibilityLabel="Play the dictation sentence"
                />
              ) : null}
              <AnimatedIconButton label="Another exercise" icon={icons.refresh} onPress={() => pickExercise(exercise.type)} large />
              <AnimatedIconButton label="Remove worksheet" icon={icons.close} onPress={() => { setExercise(null); haptic("selection"); }} large />
            </>
          ) : null}
        </Reanimated.View>
      </View>

      {/* Blurred AI veil: grading the page, or the coach writing a new sheet. */}
      <AiThinkingOverlay
        visible={checking || coachThinking}
        captionKo={checking ? "글씨를 읽는 중" : "문제를 만드는 중"}
        caption={checking ? "Reading your ink…" : "Writing your exercise…"}
      />

      <PracticeModal
        visible={panel !== null}
        panel={panel}
        feedback={feedback}
        history={feedbackHistory}
        error={error}
        checking={checking}
        onClose={() => setPanel(null)}
        onUseDemo={useDemoFeedback}
        onPickFeedback={(item) => {
          setFeedback(item.feedback);
          setPanel("feedback");
        }}
        onPickExercise={pickExercise}
      />
    </ScreenTransition>
  );
}

function FloatingOptionsTray({ children }: { children: React.ReactNode }) {
  // Centered beside the (vertically centered) tool rail.
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: spacing.md + 70, top: 0, bottom: 0, justifyContent: "center" }}>
      <View
        style={{
          borderRadius: 999,
          borderWidth: 1,
          borderColor: `${colors.pen}26`,
          backgroundColor: "rgba(255, 253, 246, 0.96)",
          padding: 6,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          boxShadow: "0 18px 50px rgba(80, 66, 30, 0.16)",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function RailDivider() {
  return <View style={{ width: 28, height: 1, backgroundColor: colors.line }} />;
}

function AnimatedIconButton({
  label,
  icon,
  active,
  danger,
  disabled,
  loading,
  large,
  onPress,
}: {
  label: string;
  icon: IconName;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  large?: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  const progress = useSelectionProgress(Boolean(active));
  const size = large ? 48 : 42;
  const tint = disabled ? palette.muted : active ? colors.white : danger ? colors.danger : palette.text;
  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [danger ? `${colors.danger}18` : palette.surface, colors.pen],
  });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: disabled ? 0.48 : pressed ? 0.72 : 1 })}
    >
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: disabled ? palette.border : backgroundColor,
          borderWidth: 1,
          borderColor: active ? colors.pen : danger ? `${colors.danger}55` : palette.border,
          transform: [{ scale }],
        }}
      >
        {loading ? <ActivityIndicator color={colors.white} /> : <SymbolView name={icon} tintColor={tint} size={large ? 24 : 21} />}
      </Animated.View>
    </Pressable>
  );
}

function AnimatedColorButton({ color, active, onPress }: { color: string; active: boolean; onPress: () => void }) {
  const palette = usePalette();
  const progress = useSelectionProgress(active);
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ink color ${color}`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.74 : 1 })}
    >
      <Animated.View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: palette.surface,
          borderWidth: active ? 2 : 1,
          borderColor: active ? colors.pen : palette.border,
          transform: [{ scale }],
        }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color }} />
      </Animated.View>
    </Pressable>
  );
}

function AnimatedWidthButton({ width, active, onPress }: { width: number; active: boolean; onPress: () => void }) {
  const palette = usePalette();
  const progress = useSelectionProgress(active);
  const backgroundColor = progress.interpolate({ inputRange: [0, 1], outputRange: [palette.surface, colors.pen] });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Stroke width ${width}`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.74 : 1 })}
    >
      <Animated.View
        style={{
          width: 38,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor,
          borderWidth: 1,
          borderColor: active ? colors.pen : palette.border,
          transform: [{ scale }],
        }}
      >
        <View style={{ width: 22, height: Math.max(2, width), borderRadius: 999, backgroundColor: active ? colors.white : palette.text }} />
      </Animated.View>
    </Pressable>
  );
}

function AnimatedPageFormatButton({ format, active, onPress }: { format: PageFormat; active: boolean; onPress: () => void }) {
  const palette = usePalette();
  const option = pageFormatOptions.find((item) => item.value === format) ?? pageFormatOptions[0];
  const progress = useSelectionProgress(active);
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={option.label}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.74 : 1 })}
    >
      <Animated.View
        style={{
          width: 40,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? `${colors.pen}16` : palette.surface,
          borderWidth: active ? 2 : 1,
          borderColor: active ? colors.pen : palette.border,
          transform: [{ scale }],
        }}
      >
        <PageFormatPreview format={format} />
      </Animated.View>
    </Pressable>
  );
}

function PageFormatPreview({ format }: { format: PageFormat }) {
  const option = pageFormatOptions.find((item) => item.value === format) ?? pageFormatOptions[0];
  const lineColor = format === "lined" ? colors.grid : colors.gridSoft;
  return (
    <View style={{ width: 24, height: 20, borderRadius: 5, overflow: "hidden", backgroundColor: option.background, borderWidth: 1, borderColor: colors.line }}>
      {format === "lined" ? [7, 13].map((top) => <View key={top} style={{ position: "absolute", left: 2, right: 2, top, height: 1, backgroundColor: lineColor }} />) : null}
      {format === "grid" || format === "hangul" ? [8, 16].map((left) => <View key={`x-${left}`} style={{ position: "absolute", top: 0, bottom: 0, left, width: 1, backgroundColor: lineColor, opacity: format === "hangul" && left === 8 ? 0.45 : 1 }} />) : null}
      {format === "grid" || format === "hangul" ? [7, 14].map((top) => <View key={`y-${top}`} style={{ position: "absolute", left: 0, right: 0, top, height: 1, backgroundColor: lineColor, opacity: format === "hangul" && top === 7 ? 0.45 : 1 }} />) : null}
    </View>
  );
}

function useSelectionProgress(active: boolean) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      progress.setValue(active ? 1 : 0);
      return;
    }
    Animated.spring(progress, {
      toValue: active ? 1 : 0,
      damping: 15,
      mass: 0.7,
      stiffness: 240,
      useNativeDriver: false,
    }).start();
  }, [active, progress, reduced]);
  return progress;
}

function PracticeModal({
  visible,
  panel,
  feedback,
  history,
  error,
  checking,
  onClose,
  onUseDemo,
  onPickFeedback,
  onPickExercise,
}: {
  visible: boolean;
  panel: PracticePanel;
  feedback: FeedbackResult | null;
  history: FeedbackHistoryItem[];
  error: { title: string; detail: string } | null;
  checking: boolean;
  onClose: () => void;
  onUseDemo: () => void;
  onPickFeedback: (item: FeedbackHistoryItem) => void;
  onPickExercise: (type?: CoachExerciseType) => void;
}) {
  const palette = usePalette();
  const reduced = useReducedMotion();
  const [rendered, setRendered] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      progress.value = reduced ? 1 : withTiming(1, { duration: duration.state, easing: easing.out });
    } else if (rendered) {
      if (reduced) {
        progress.value = 0;
        setRendered(false);
      } else {
        // Exit runs faster than the entrance, then the modal unmounts.
        progress.value = withTiming(0, { duration: duration.exit, easing: easing.standard }, (finished) => {
          if (finished) runOnJS(setRendered)(false);
        });
      }
    }
  }, [visible, rendered, reduced, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.96 + 0.04 * progress.value }, { translateY: (1 - progress.value) * 8 }],
  }));

  if (!rendered) return null;

  const title =
    panel === "history"
      ? "Previous feedback"
      : panel === "error"
        ? error?.title ?? "Check failed"
        : panel === "coach"
          ? "AI writing coach"
          : "Feedback";
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Reanimated.View
        style={[
          {
            flex: 1,
            backgroundColor: "rgba(35, 36, 77, 0.46)",
            alignItems: "center",
            justifyContent: "center",
            padding: spacing.lg,
          },
          backdropStyle,
        ]}
      >
        <Reanimated.View
          style={[
            {
              width: "100%",
              maxWidth: 760,
              maxHeight: "86%",
              backgroundColor: palette.surface,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: palette.border,
              padding: spacing.lg,
              gap: spacing.md,
              boxShadow: "0 24px 60px rgba(60, 48, 20, 0.26)",
            },
            cardStyle,
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
            <AppText variant="title">{title}</AppText>
            <AnimatedIconButton label="Close" icon={icons.close} onPress={onClose} />
          </View>

          {panel === "coach" ? (
            <CoachMenu onPick={onPickExercise} />
          ) : panel === "history" ? (
            <HistoryList history={history} onPickFeedback={onPickFeedback} />
          ) : panel === "error" ? (
            <View style={{ gap: spacing.md }}>
              <AppText color={palette.muted} selectable>{error?.detail ?? "Unexpected error."}</AppText>
              <ActionButton tone="ghost" onPress={onUseDemo} disabled={checking}>Use demo feedback</ActionButton>
            </View>
          ) : feedback ? (
            <FeedbackDetails feedback={feedback} />
          ) : (
            <AppText color={palette.muted}>Feedback will appear after a writing check.</AppText>
          )}
        </Reanimated.View>
      </Reanimated.View>
    </Modal>
  );
}

function FeedbackDetails({ feedback }: { feedback: FeedbackResult }) {
  const palette = usePalette();
  return (
    <ScrollView contentContainerStyle={{ gap: spacing.md }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="label" color={palette.penText}>Recognized</AppText>
          <AppText variant="korean" selectable>{feedback.recognized || "-"}</AppText>
        </View>
        <View style={{ alignItems: "center", minWidth: 90 }}>
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
            <AppText key={issue} color={palette.muted} selectable>- {issue}</AppText>
          ))}
        </View>
      ) : null}

      {feedback.recommendation ? <Pill tone="green">{feedback.recommendation}</Pill> : null}
    </ScrollView>
  );
}

// [DEMO-DATA] The coach menu. Exercises come from the demo bank; the rows and
// flow are exactly what the real AI coach will use.
function CoachMenu({ onPick }: { onPick: (type?: CoachExerciseType) => void }) {
  const palette = usePalette();
  return (
    <ScrollView contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
      <AppText color={palette.muted}>
        Pick an exercise and it&apos;s printed straight onto your page — write your answers by hand, right under the questions.
      </AppText>

      <PressableScale
        onPress={() => onPick()}
        accessibilityRole="button"
        accessibilityLabel="Surprise me with any exercise"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          backgroundColor: colors.pen,
          borderRadius: radii.md,
          padding: spacing.md,
          minHeight: 58,
        }}
      >
        <SymbolView name={icons.coach} tintColor={colors.white} size={22} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="subtitle" color={colors.white}>Surprise me</AppText>
          <AppText color="rgba(255,255,255,0.82)" style={{ fontSize: 13.5 }}>The coach picks what to practice next.</AppText>
        </View>
      </PressableScale>

      {coachExerciseTypes.map((entry) => (
        <PressableScale
          key={entry.type}
          onPress={() => onPick(entry.type)}
          accessibilityRole="button"
          accessibilityLabel={entry.title}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: radii.md,
            padding: spacing.md,
            minHeight: 58,
            backgroundColor: palette.surface,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: palette.settings.darkMode ? colors.darkPen50 : colors.pen50,
              borderWidth: 1,
              borderColor: `${colors.pen}26`,
            }}
          >
            <SymbolView name={coachTypeIcons[entry.type]} tintColor={palette.penText} size={20} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="subtitle">{entry.title}</AppText>
            <AppText color={palette.muted} style={{ fontSize: 13.5 }}>{entry.description}</AppText>
          </View>
        </PressableScale>
      ))}

    </ScrollView>
  );
}

function HistoryList({ history, onPickFeedback }: { history: FeedbackHistoryItem[]; onPickFeedback: (item: FeedbackHistoryItem) => void }) {
  const palette = usePalette();
  if (!history.length) {
    return <AppText color={palette.muted}>Previous feedback will appear after your first check.</AppText>;
  }
  return (
    <ScrollView contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
      {history.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`Open feedback from ${formatDate(item.createdAt)}`}
          onPress={() => onPickFeedback(item)}
          style={({ pressed }) => ({
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: radii.md,
            padding: spacing.md,
            gap: spacing.xs,
            backgroundColor: pressed ? palette.surfaceAlt : palette.surface,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
            <AppText variant="subtitle" selectable>{item.correction || item.feedback.correction || item.feedback.recognized || freeWritingPrompt}</AppText>
            <Pill tone={item.score >= 75 ? "green" : "gold"}>{item.score}/100</Pill>
          </View>
          <AppText color={palette.muted}>{formatDate(item.createdAt)}</AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
