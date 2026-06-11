// The AI "thinking" animation: a 3×3 grid of cells rippling diagonally (the
// classic cell-ripple loader), recolored to the app's pen→teal ramp, with a
// Korean syllable living in every cell. The wave lights each diagonal in turn,
// and the nine syllables reshuffle on every loop. One master clock drives all
// cells (pure worklet math, no per-cell timers), so the ripple stays seamless.
// Used wherever the app waits on AI (grading, coach generation). Reduced
// motion shows a calm static lockup instead.
import { BlurView } from "expo-blur";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { usePalette } from "@/components/ui";
import { duration, easing } from "@/constants/motion";
import { colors, families, spacing } from "@/constants/theme";

const LOOP_MS = 1500;
const CELL = 46;
const GAP = 3;

// Every expression is exactly nine units (spaces count as one cell), so each
// loop the 3×3 grid spells a complete little message, read left-to-right.
const EXPRESSIONS = [
  "한글은 아름다워!", // Hangul is beautiful!
  "오늘도 잘했어요!", // great work today!
  "천천히 꾸준하게!", // slowly and steadily!
  "손글씨가 최고예요", // handwriting is the best
  "잠시만 기다려요~", // just a moment~
  "생각하는 중이에요", // thinking it over
  "글쓰기는 즐거워요", // writing is a joy
  "꿈은 이루어진다!", // dreams come true!
  "마음을 담아 써요", // write with heart
  "재미있게 배워요!", // learn with fun!
  "좋은 하루 보내요", // have a good day
  "차근차근 해봐요!", // step by step!
  "포기하지 마세요!", // don't give up!
  "한 줄씩 써봐요~", // one line at a time~
  "정말 멋진 글씨!", // truly great handwriting!
  "준비하고 있어요~", // getting it ready~
  "곧 만나요 친구야", // see you soon, friend
  "쓸수록 늘어나요!", // the more you write, the better
  "마법을 부리는 중", // casting a little magic
  "거의 다 됐어요~", // almost done~
  "기대해도 좋아요!", // it's worth the wait!
  "배움은 즐거움이다", // learning is joy
  "함께 배워 봐요!", // let's learn together!
  "잉크가 마르는 중", // the ink is drying
  "종이가 기다려요!", // the paper is waiting!
  "천재가 되는 중~", // becoming a genius~
];

function pickExpression(previous?: string[]): string[] {
  const candidates = EXPRESSIONS.filter((e) => [...e].join("") !== previous?.join(""));
  const choice = candidates[Math.floor(Math.random() * candidates.length)];
  // Spread handles Hangul/punctuation; pad defensively so the grid never breaks.
  const cells = [...choice].slice(0, 9);
  while (cells.length < 9) cells.push(" ");
  return cells;
}

// The reference loader's mint→cyan ramp, translated to our accents: pen → teal.
function lerpHex(a: string, b: string, t: number) {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ch = [16, 8, 0].map((shift) => {
    const av = (ah >> shift) & 0xff;
    const bv = (bh >> shift) & 0xff;
    return Math.round(av + (bv - av) * t);
  });
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
const RAMP_LIGHT = Array.from({ length: 9 }, (_, i) => lerpHex(colors.pen, colors.teal, i / 8));
const RAMP_DARK = Array.from({ length: 9 }, (_, i) => lerpHex(colors.penOnDark, colors.teal, i / 8));

// Diagonal wave order (row + col), matching the reference's d-0..d-4 delays.
const DIAGONAL = [0, 1, 2, 1, 2, 3, 2, 3, 4];

function RippleCell({
  syllable,
  diagonal,
  color,
  clock,
}: {
  syllable: string;
  diagonal: number;
  color: string;
  clock: SharedValue<number>;
}) {
  const fillStyle = useAnimatedStyle(() => {
    // Reference keyframes: transparent → lit at 30% → transparent at 60%.
    // A half-sine over that window keeps the rise and fall perfectly smooth.
    const phase = (clock.value - diagonal * 0.0667 + 1) % 1;
    const alpha = phase < 0.6 ? Math.sin(Math.PI * (phase / 0.6)) : 0;
    return { opacity: alpha };
  });
  // A space still gets its tile — the box ripples with the wave, just blank.
  const blank = syllable.trim() === "";
  return (
    <View
      style={{
        width: CELL,
        height: CELL,
        margin: GAP / 2,
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Animated.View style={[{ position: "absolute", inset: 0, backgroundColor: color, borderRadius: 6 }, fillStyle]} />
      {blank ? null : (
        <Animated.View style={fillStyle}>
          <Text style={{ fontFamily: families.korean, fontSize: 24, color: colors.white, lineHeight: 32 }}>{syllable}</Text>
        </Animated.View>
      )}
    </View>
  );
}

export function HangulThinking({ captionKo = "생각하는 중", caption = "Thinking it over…" }: { captionKo?: string; caption?: string }) {
  const palette = usePalette();
  const reduced = useReducedMotion();
  const clock = useSharedValue(0);
  const [grid, setGrid] = useState<string[]>(() => pickExpression());

  useEffect(() => {
    if (reduced) return;
    clock.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false);
    // A fresh expression each ripple, swapped at the loop boundary.
    const timer = setInterval(() => setGrid((prev) => pickExpression(prev)), LOOP_MS);
    return () => clearInterval(timer);
  }, [reduced, clock]);

  const ramp = palette.settings.darkMode ? RAMP_DARK : RAMP_LIGHT;

  if (reduced) {
    return (
      <View style={{ alignItems: "center", gap: spacing.sm }}>
        <Text style={{ fontFamily: families.korean, fontSize: 52, color: palette.penText, lineHeight: 68 }}>한글</Text>
        <Text style={{ fontFamily: families.hand, fontSize: 17, color: palette.penText }}>{captionKo}…</Text>
        <Text style={{ fontFamily: families.bodyMedium, fontSize: 13.5, color: palette.muted }}>{caption}</Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: "center", gap: spacing.sm }}>
      <View style={{ width: (CELL + GAP) * 3, flexDirection: "row", flexWrap: "wrap" }}>
        {grid.map((syllable, i) => (
          <RippleCell key={i} syllable={syllable} diagonal={DIAGONAL[i]} color={ramp[i]} clock={clock} />
        ))}
      </View>
      <Text style={{ fontFamily: families.hand, fontSize: 17, color: palette.penText, marginTop: spacing.xs }}>
        {captionKo}…
      </Text>
      <Text style={{ fontFamily: families.bodyMedium, fontSize: 13.5, color: palette.muted }}>{caption}</Text>
    </View>
  );
}

/**
 * Full-surface veil while the AI works: the screen behind blurs, the loader
 * floats free (no box), and the whole thing breathes in and out instead of
 * popping. Blocks input under it while visible.
 * (Native Android blur needs BlurTargetView wiring — web/iOS blur natively;
 * the warm wash keeps Android legible until then.)
 */
export function AiThinkingOverlay({ visible, captionKo, caption }: { visible: boolean; captionKo?: string; caption?: string }) {
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
        progress.value = withTiming(0, { duration: duration.exit, easing: easing.standard }, (finished) => {
          if (finished) runOnJS(setRendered)(false);
        });
      }
    }
  }, [visible, rendered, reduced, progress]);

  const veilStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const loaderStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.94 + 0.06 * progress.value }, { translateY: (1 - progress.value) * 8 }],
  }));

  if (!rendered) return null;
  const dark = palette.settings.darkMode;

  return (
    <Animated.View style={[{ position: "absolute", inset: 0 }, veilStyle]} accessibilityLabel={caption ?? "Working"}>
      <BlurView intensity={28} tint={dark ? "dark" : "light"} style={{ position: "absolute", inset: 0 }} />
      {/* A light warm wash on top of the blur keeps the loader AA-legible. */}
      <View
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: dark ? "rgba(21, 22, 43, 0.38)" : "rgba(251, 246, 233, 0.42)",
        }}
      />
      <Animated.View style={[{ flex: 1, alignItems: "center", justifyContent: "center" }, loaderStyle]}>
        <HangulThinking captionKo={captionKo} caption={caption} />
      </Animated.View>
    </Animated.View>
  );
}
