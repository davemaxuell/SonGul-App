import {
  Canvas,
  ImageFormat,
  Line,
  Path,
  Rect,
  useCanvasRef,
} from "@shopify/react-native-skia";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Text, View, type LayoutChangeEvent, type PointerEvent, type StyleProp, type ViewStyle } from "react-native";

import { renderStroke, type RenderedInk } from "@/lib/ink";
import { colors, families, radii, spacing } from "@/constants/theme";
import { useSettings } from "@/lib/settings";
import type { EraserMode, PageFormat, Stroke, StrokePoint, WritingTool } from "@/types/songul";

export type WritingSurfaceHandle = {
  clear: () => void;
  undo: () => void;
  redo: () => void;
  /** Replace the page contents (e.g. reopening a saved canvas). Resets redo. */
  loadStrokes: (strokes: Stroke[]) => void;
  getImageBase64: () => Promise<string | null>;
};

type Props = {
  tool: WritingTool;
  /**
   * true (default UX): only the stylus or a mouse can draw — fingers and palms
   * never leave marks. false: fingertip writing is allowed too, still shielded
   * for 1.5s around any pen activity so a resting palm can't scribble.
   */
  penFocus: boolean;
  tracingGuide: boolean;
  eraserMode: EraserMode;
  pageFormat: PageFormat;
  strokeColor: string;
  strokeWidth: number;
  correctionOverlay?: string | null;
  /** Typeset content (e.g. an AI-coach problem sheet) printed onto the page.
      Pointer events pass through, so the learner handwrites on the same canvas. */
  worksheet?: ReactNode;
  fullBleed?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Fires when a stroke completes (or on clear/undo/redo/load) — never per
      pointer sample, so parents don't re-render while the pen is moving. */
  onStrokesChange?: (strokes: Stroke[]) => void;
  onBeginDrawing?: () => void;
};

type SurfaceSize = { width: number; height: number };

const PEN_SHIELD_MS = 1500; // how long after pen activity a fingertip stays ignored
const MIN_POINT_DISTANCE = 0.35; // drop sub-pixel jitter samples

function clampValue(value: number, max: number) {
  return Math.max(0, Math.min(max, value));
}

function makePoint(x: number, y: number, pressure: number | undefined, size: SurfaceSize): StrokePoint {
  return {
    x: clampValue(x, size.width),
    y: clampValue(y, size.height),
    t: Date.now(),
    pressure: pressure || undefined,
  };
}

function pointFromEvent(event: PointerEvent, size: SurfaceSize): StrokePoint {
  const native = event.nativeEvent;
  return makePoint(native.offsetX, native.offsetY, native.pressure, size);
}

function alphaColor(color: string, alpha: string) {
  return color.startsWith("#") && color.length === 7 ? `${color}${alpha}` : color;
}

function getPageStyle(pageFormat: PageFormat) {
  if (pageFormat === "lined") return { background: colors.paperWarm, line: colors.grid, softLine: colors.gridSoft };
  if (pageFormat === "grid") return { background: colors.surface, line: colors.grid, softLine: colors.gridSoft };
  if (pageFormat === "hangul") return { background: colors.surface, line: colors.grid, softLine: colors.gridSoft };
  return { background: colors.surface, line: colors.gridSoft, softLine: colors.gridSoft };
}

function getStrokeStyle(tool: WritingTool, strokeColor: string, strokeWidth: number, backgroundColor: string) {
  if (tool === "eraser") {
    return { color: backgroundColor, width: Math.max(22, strokeWidth * 5) };
  }
  if (tool === "marker") {
    return { color: alphaColor(strokeColor, "78"), width: Math.max(10, strokeWidth * 2.8) };
  }
  // Nib diameter; per-point pressure shapes the line in the renderer.
  return { color: strokeColor, width: Math.max(2, strokeWidth + 1) };
}

function rangeEvery(limit: number, step: number, offset = step) {
  const values: number[] = [];
  for (let value = offset; value < limit; value += step) values.push(value);
  return values;
}

function distanceToSegment(point: StrokePoint, start: StrokePoint, end: StrokePoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const x = start.x + t * dx;
  const y = start.y + t * dy;
  return Math.hypot(point.x - x, point.y - y);
}

function strokeTouchesPoint(stroke: Stroke, point: StrokePoint, radius: number) {
  if (stroke.tool === "eraser" || !stroke.points.length) return false;
  const threshold = radius + stroke.width / 2;
  if (stroke.points.length === 1) return Math.hypot(point.x - stroke.points[0].x, point.y - stroke.points[0].y) <= threshold;
  for (let i = 1; i < stroke.points.length; i += 1) {
    if (distanceToSegment(point, stroke.points[i - 1], stroke.points[i]) <= threshold) return true;
  }
  return false;
}

function PageFormatGuide({ pageFormat, size }: { pageFormat: PageFormat; size: SurfaceSize }) {
  const page = getPageStyle(pageFormat);
  if (pageFormat === "blank") return null;

  if (pageFormat === "lined") {
    return (
      <>
        {rangeEvery(size.height, 54, 48).map((y) => (
          <Line key={`lined-${y}`} p1={{ x: 0, y }} p2={{ x: size.width, y }} color={page.line} strokeWidth={1} />
        ))}
      </>
    );
  }

  if (pageFormat === "grid") {
    const step = 46;
    return (
      <>
        {rangeEvery(size.width, step).map((x) => (
          <Line key={`grid-x-${x}`} p1={{ x, y: 0 }} p2={{ x, y: size.height }} color={page.softLine} strokeWidth={1} />
        ))}
        {rangeEvery(size.height, step).map((y) => (
          <Line key={`grid-y-${y}`} p1={{ x: 0, y }} p2={{ x: size.width, y }} color={page.softLine} strokeWidth={1} />
        ))}
      </>
    );
  }

  const step = 92;
  const half = step / 2;
  return (
    <>
      {rangeEvery(size.width, step).map((x) => (
        <Line key={`hangul-x-${x}`} p1={{ x, y: 0 }} p2={{ x, y: size.height }} color={page.line} strokeWidth={1.2} />
      ))}
      {rangeEvery(size.height, step).map((y) => (
        <Line key={`hangul-y-${y}`} p1={{ x: 0, y }} p2={{ x: size.width, y }} color={page.line} strokeWidth={1.2} />
      ))}
      {rangeEvery(size.width, step, half).map((x) => (
        <Line key={`hangul-mid-x-${x}`} p1={{ x, y: 0 }} p2={{ x, y: size.height }} color={page.softLine} strokeWidth={1} />
      ))}
      {rangeEvery(size.height, step, half).map((y) => (
        <Line key={`hangul-mid-y-${y}`} p1={{ x: 0, y }} p2={{ x: size.width, y }} color={page.softLine} strokeWidth={1} />
      ))}
    </>
  );
}

export function InkPath({ ink }: { ink: RenderedInk }) {
  if (ink.kind === "fill") {
    return <Path path={ink.path} color={ink.color} style="fill" />;
  }
  return <Path path={ink.path} color={ink.color} style="stroke" strokeWidth={ink.width} strokeCap="round" strokeJoin="round" />;
}

// ---- Empty-page greeting -----------------------------------------------------
// A warm, time-aware caption instead of an instruction. Picked once per mount.

const GREETING_TITLES: Record<"morning" | "afternoon" | "evening" | "night", ((name: string) => string)[]> = {
  morning: [
    (name) => `Good morning, ${name}.`,
    () => "The morning is yours.",
    () => "A fresh page before the day gets loud.",
  ],
  afternoon: [
    (name) => `Good afternoon, ${name}.`,
    () => "A small pause in the middle of the day.",
    () => "The page is quiet. Join it for a minute.",
  ],
  evening: [
    (name) => `Good evening, ${name}.`,
    () => "The day is winding down.",
    () => "Evening ink flows slower. That's fine.",
  ],
  night: [
    (name) => `Quiet hours, ${name}.`,
    () => "Still up? So is the paper.",
    () => "The quietest hours make the calmest strokes.",
  ],
};

const GREETING_SUBS = [
  "There are no mistakes here, only practice.",
  "One small line is enough to begin.",
  "Breathe in, write out.",
  "Slow strokes count double.",
  "The paper is patient. Take your time.",
  "Whatever you write today is progress.",
];

function pickGreeting(name: string) {
  const hour = new Date().getHours();
  const bucket = hour < 5 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 22 ? "evening" : "night";
  const titles = GREETING_TITLES[bucket];
  const title = titles[Math.floor(Math.random() * titles.length)](name);
  const sub = GREETING_SUBS[Math.floor(Math.random() * GREETING_SUBS.length)];
  return { title, sub };
}

// ---- The surface ---------------------------------------------------------------

export const WritingSurface = forwardRef<WritingSurfaceHandle, Props>(function WritingSurface(
  {
    tool,
    penFocus,
    tracingGuide,
    eraserMode,
    pageFormat,
    strokeColor,
    strokeWidth,
    correctionOverlay,
    worksheet,
    fullBleed,
    style,
    onStrokesChange,
    onBeginDrawing,
  },
  ref,
) {
  const canvasRef = useCanvasRef();
  const settings = useSettings();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [size, setSize] = useState<SurfaceSize>({ width: 1, height: 1 });
  // Bumped once per animation frame while the pen is down; the only state that
  // changes during a stroke, so React work stays tiny and bounded at 60Hz no
  // matter how fast the stylus reports (120-240Hz samples land via refs).
  const [, setDrawTick] = useState(0);

  const activePointer = useRef<number | null>(null);
  const activePointerType = useRef<string | null>(null);
  const lastPenAt = useRef(0);
  const liveStroke = useRef<Stroke | null>(null);
  const liveInk = useRef<RenderedInk | null>(null);
  const rafHandle = useRef<number | null>(null);
  // Mirror of the committed strokes for event handlers: several pointer events
  // can land between React renders, and stale closures over `strokes` would
  // resurrect just-erased ink during an eraser drag.
  const strokesRef = useRef<Stroke[]>([]);
  // Completed strokes render once and are cached by id (undo/redo/load rebuild lazily).
  const inkCache = useRef(new Map<string, RenderedInk>());

  const page = getPageStyle(pageFormat);
  const greeting = useMemo(() => pickGreeting(settings.name), [settings.name]);

  const completedInk = useMemo(
    () =>
      strokes.map((stroke) => {
        let ink = inkCache.current.get(stroke.id);
        if (!ink) {
          ink = renderStroke(stroke, { complete: true });
          inkCache.current.set(stroke.id, ink);
        }
        return { id: stroke.id, ink };
      }),
    [strokes],
  );

  useEffect(
    () => () => {
      if (rafHandle.current !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafHandle.current);
      }
    },
    [],
  );

  const commitStrokes = useCallback(
    (next: Stroke[]) => {
      strokesRef.current = next;
      setStrokes(next);
      onStrokesChange?.(next);
    },
    [onStrokesChange],
  );

  /** Drop an in-flight stroke without committing (palm preemption, self-heal). */
  const discardLiveStroke = useCallback(() => {
    activePointer.current = null;
    activePointerType.current = null;
    liveStroke.current = null;
    liveInk.current = null;
    if (rafHandle.current !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafHandle.current);
      rafHandle.current = null;
    }
    setDrawTick((tick) => tick + 1);
  }, []);

  const clear = useCallback(() => {
    inkCache.current.clear();
    liveStroke.current = null;
    liveInk.current = null;
    commitStrokes([]);
    setRedoStack([]);
  }, [commitStrokes]);

  const undo = useCallback(() => {
    if (!strokes.length) return;
    const next = strokes.slice(0, -1);
    const removed = strokes[strokes.length - 1];
    setRedoStack((current) => [removed, ...current]);
    commitStrokes(next);
  }, [commitStrokes, strokes]);

  const redo = useCallback(() => {
    if (!redoStack.length) return;
    const [restored, ...rest] = redoStack;
    setRedoStack(rest);
    commitStrokes([...strokes, restored]);
  }, [commitStrokes, redoStack, strokes]);

  const eraseIntersectingStroke = useCallback(
    (point: StrokePoint) => {
      const current = strokesRef.current; // ref, not state: erase drags outpace renders
      const radius = Math.max(18, strokeWidth * 4);
      const next = current.filter((stroke) => !strokeTouchesPoint(stroke, point, radius));
      if (next.length === current.length) return false;
      setRedoStack([]);
      commitStrokes(next);
      return true;
    },
    [commitStrokes, strokeWidth],
  );

  useImperativeHandle(ref, () => ({
    clear,
    undo,
    redo,
    loadStrokes(next: Stroke[]) {
      inkCache.current.clear();
      liveStroke.current = null;
      liveInk.current = null;
      setRedoStack([]);
      commitStrokes(next);
    },
    async getImageBase64() {
      const image = await canvasRef.current?.makeImageSnapshotAsync();
      return image?.encodeToBase64(ImageFormat.JPEG, 88) ?? null;
    },
  }), [canvasRef, clear, commitStrokes, redo, undo]);

  /** Stylus and mouse always draw; fingertips only when explicitly allowed. */
  function canDraw(event: PointerEvent): boolean {
    const type = event.nativeEvent.pointerType;
    if (type === "pen") {
      lastPenAt.current = Date.now();
      return true;
    }
    if (type === "touch") {
      if (penFocus) return false;
      return Date.now() - lastPenAt.current > PEN_SHIELD_MS;
    }
    return true; // mouse / unknown precision pointers
  }

  // Without capture, a pen stroke wandering past the canvas edge (or over the
  // floating tool rail) loses its events mid-word.
  function capturePointer(event: PointerEvent) {
    const native = event.nativeEvent as unknown as { target?: { setPointerCapture?: (id: number) => void }; pointerId: number };
    try {
      native.target?.setPointerCapture?.(native.pointerId);
    } catch {
      // older engines without capture still work, just without edge tracking
    }
  }

  function scheduleFlush() {
    if (rafHandle.current !== null) return;
    const schedule =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (cb: () => void) => setTimeout(cb, 16) as unknown as number;
    rafHandle.current = schedule(() => {
      rafHandle.current = null;
      if (liveStroke.current) {
        liveInk.current = renderStroke(liveStroke.current, { complete: false });
      }
      setDrawTick((tick) => tick + 1);
    });
  }

  function appendLivePoint(point: StrokePoint) {
    const live = liveStroke.current;
    if (!live) return;
    const last = live.points[live.points.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_POINT_DISTANCE) return;
    live.points.push(point);
  }

  function handleLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width: Math.max(1, width), height: Math.max(1, height) });
  }

  function handlePointerDown(event: PointerEvent) {
    const native = event.nativeEvent;
    if (activePointer.current !== null) {
      // One pointer owns the page — with two exceptions, both of which discard
      // the in-flight (uncommitted) ink and let this pointer take over:
      // the same id arriving again (stale lock after a lost pointerup), and a
      // pen touching down while a palm/finger stroke is in progress.
      const samePointer = native.pointerId === activePointer.current;
      const penTakesOver = native.pointerType === "pen" && activePointerType.current === "touch";
      if (!samePointer && !penTakesOver) return;
      discardLiveStroke();
    }
    if (!canDraw(event)) return;
    activePointer.current = native.pointerId;
    activePointerType.current = native.pointerType ?? "mouse";
    capturePointer(event);
    onBeginDrawing?.();
    const point = pointFromEvent(event, size);

    if (tool === "eraser" && eraserMode === "stroke") {
      eraseIntersectingStroke(point);
      return;
    }

    const inkStyle = getStrokeStyle(tool, strokeColor, strokeWidth, page.background);
    liveStroke.current = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      tool,
      color: inkStyle.color,
      width: inkStyle.width,
      points: [point],
    };
    liveInk.current = renderStroke(liveStroke.current, { complete: false });
    setRedoStack([]);
    setDrawTick((tick) => tick + 1); // immediate: hides the greeting, shows the dot
  }

  function handlePointerMove(event: PointerEvent) {
    const native = event.nativeEvent;
    if (native.pointerType === "pen") {
      // A hovering pen keeps the palm shield up even before it touches down —
      // and instantly evicts any palm/finger ink already in progress.
      lastPenAt.current = Date.now();
      if (activePointer.current !== null && activePointerType.current === "touch" && native.pointerId !== activePointer.current) {
        discardLiveStroke();
      }
    }
    if (activePointer.current !== native.pointerId) return;

    if (tool === "eraser" && eraserMode === "stroke") {
      eraseIntersectingStroke(pointFromEvent(event, size));
      return;
    }
    if (!liveStroke.current) return;

    // Browsers batch pointermove to the frame rate; coalesced events restore
    // the stylus's full 120-240Hz sample trail for faithful curves.
    const coalesced =
      typeof (native as { getCoalescedEvents?: () => { clientX: number; clientY: number; pressure?: number }[] })
        .getCoalescedEvents === "function"
        ? (native as unknown as { getCoalescedEvents: () => { clientX: number; clientY: number; pressure?: number }[] })
            .getCoalescedEvents()
        : null;

    if (coalesced && coalesced.length) {
      const originX = (native as unknown as { clientX: number }).clientX - native.offsetX;
      const originY = (native as unknown as { clientY: number }).clientY - native.offsetY;
      for (const sample of coalesced) {
        appendLivePoint(makePoint(sample.clientX - originX, sample.clientY - originY, sample.pressure, size));
      }
    } else {
      appendLivePoint(pointFromEvent(event, size));
    }
    scheduleFlush();
  }

  function finishPointer(event: PointerEvent) {
    if (activePointer.current !== event.nativeEvent.pointerId) return;
    activePointer.current = null;
    activePointerType.current = null;

    const live = liveStroke.current;
    liveStroke.current = null;
    liveInk.current = null;
    if (rafHandle.current !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafHandle.current);
      rafHandle.current = null;
    }
    if (live) {
      inkCache.current.set(live.id, renderStroke(live, { complete: true }));
      commitStrokes([...strokesRef.current, live]); // parents hear about ink once per stroke
    } else {
      setDrawTick((tick) => tick + 1);
    }
  }

  const showGreeting = !strokes.length && !liveStroke.current && !worksheet && !correctionOverlay;

  return (
    <View
      onLayout={handleLayout}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      style={[
        {
          flex: 1,
          minHeight: fullBleed ? 0 : 420,
          overflow: "hidden",
          borderRadius: fullBleed ? 0 : radii.lg,
          borderWidth: fullBleed ? 0 : 1,
          borderColor: colors.line,
          backgroundColor: page.background,
        },
        // Stop the browser from treating pen/touch drags as scroll or
        // pull-to-refresh (which fires pointercancel and kills the stroke).
        process.env.EXPO_OS === "web"
          ? ({ touchAction: "none", userSelect: "none" } as unknown as ViewStyle)
          : null,
        style,
      ]}
    >
      {tracingGuide ? (
        <View style={{ pointerEvents: "none", position: "absolute", inset: 0, padding: spacing.lg, gap: spacing.lg }}>
          {[0, 1, 2, 3, 4].map((line) => (
            <View key={line} style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: colors.gridSoft }} />
          ))}
        </View>
      ) : null}
      <Canvas
        ref={canvasRef}
        opaque
        style={{ position: "absolute", inset: 0 }}
      >
        <Rect x={0} y={0} width={size.width} height={size.height} color={page.background} />
        {completedInk.map(({ id, ink }) => (
          <InkPath key={id} ink={ink} />
        ))}
        {liveInk.current ? <InkPath ink={liveInk.current} /> : null}
        <PageFormatGuide pageFormat={pageFormat} size={size} />
      </Canvas>
      {worksheet ? (
        <View style={{ pointerEvents: "none", position: "absolute", inset: 0 }}>{worksheet}</View>
      ) : null}
      {correctionOverlay ? (
        <View style={{ pointerEvents: "none", position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
          <Text
            style={{
              color: colors.pen,
              opacity: 0.1,
              fontSize: Math.min(92, Math.max(46, size.width / Math.max(5, correctionOverlay.length))),
              fontWeight: "900",
            }}
          >
            {correctionOverlay}
          </Text>
        </View>
      ) : null}
      {showGreeting ? (
        <View style={{ pointerEvents: "none", position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg }}>
          <Text style={{ color: colors.inkSoft, fontSize: 19, fontFamily: families.bodyExtra, textAlign: "center" }}>
            {greeting.title}
          </Text>
          <Text style={{ color: colors.inkSoft, fontSize: 15, fontFamily: families.bodyMedium, textAlign: "center" }}>
            {greeting.sub}
          </Text>
        </View>
      ) : null}
    </View>
  );
});
