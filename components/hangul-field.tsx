// The "living Hangul" background from the promotional site (script.js
// buildHangul + styles.css .glyph), rebuilt with Reanimated: low-alpha Gaegu
// glyphs and words drift slowly around the surface, and every so often one
// swaps its character with a small pop. Decorative only — pointer events pass
// through, alphas stay low enough to never fight foreground text, and reduced
// motion renders a calm static scatter.
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { easing } from "@/constants/motion";
import { families } from "@/constants/theme";

const GLYPHS = ["가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "한", "글", "쓰", "기", "배", "우", "말", "씨", "책", "펜", "노", "트", "꿈", "빛", "봄", "ㄱ", "ㄴ", "ㄷ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅏ", "ㅓ", "ㅗ", "ㅎ"];
const WORDS = ["안녕하세요", "감사합니다", "사랑해요", "반가워요", "화이팅", "잘했어요", "좋아요", "한국어", "공부", "글쓰기", "천천히", "또 만나요", "행복", "꿈을 적다", "맛있어요", "멋지다", "책 한 권", "오늘도 한 줄", "빛나다", "함께 배워요"];

// Site palette translated for the navy hero: warm-white, lifted pen, gold.
const TINTS = ["rgba(236, 234, 246, 0.11)", "rgba(154, 164, 236, 0.16)", "rgba(224, 146, 43, 0.15)"];

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function randomSpot() {
  return { left: `${Math.random() * 92}%`, top: `${Math.random() * 86}%` };
}

type GlyphSeed = {
  key: number;
  kind: "word" | "glyph";
  text: string;
  left: string;
  top: string;
  size: number;
  color: string;
  dx: number;
  dy: number;
  r1: number;
  r2: number;
  driftMs: number;
  swapMs: number;
};

function makeSeeds(count: number): GlyphSeed[] {
  return Array.from({ length: count }, (_, i) => {
    const isWord = Math.random() < 0.4;
    return {
      key: i,
      kind: isWord ? "word" : "glyph",
      text: isWord ? pick(WORDS) : pick(GLYPHS),
      ...randomSpot(),
      size: isWord ? 15 + Math.random() * 12 : 30 + Math.random() * 46,
      color: i % 5 === 0 ? TINTS[2] : i % 3 === 0 ? TINTS[1] : TINTS[0],
      dx: Math.random() * 90 - 45,
      dy: Math.random() * 70 - 35,
      r1: Math.random() * 10 - 5,
      r2: Math.random() * 10 - 5,
      driftMs: 18000 + Math.random() * 22000,
      swapMs: 6000 + Math.random() * 8000,
    };
  });
}

function DriftingGlyph({ seed }: { seed: GlyphSeed }) {
  const reduced = useReducedMotion();
  const [text, setText] = useState(seed.text);
  // Every swap relocates the glyph: it fades out where it was and reappears
  // somewhere else in the ticket, so the field never reads as a fixed layout.
  const [spot, setSpot] = useState({ left: seed.left, top: seed.top });
  // Random starting phase so the field never moves in unison (the site uses
  // negative animation-delay for the same trick).
  const drift = useSharedValue(Math.random());
  // 1 = settled. A swap breathes the glyph out (→0), changes the character
  // while it's invisible, then eases it back in — no hard snap anywhere.
  const presence = useSharedValue(1);

  useEffect(() => {
    if (reduced) return;
    drift.value = withRepeat(withTiming(1, { duration: seed.driftMs, easing: Easing.inOut(Easing.sin) }), -1, true);

    const refresh = () => {
      setText(seed.kind === "word" ? pick(WORDS) : pick(GLYPHS));
      setSpot(randomSpot()); // teleport happens while fully invisible
      presence.value = withTiming(1, { duration: 900, easing: easing.out });
    };
    const timer = setInterval(() => {
      presence.value = withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) }, (finished) => {
        if (finished) runOnJS(refresh)();
      });
    }, seed.swapMs);
    return () => clearInterval(timer);
  }, [reduced, drift, presence, seed]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: presence.value,
    transform: [
      { translateX: drift.value * seed.dx },
      { translateY: drift.value * seed.dy + (1 - presence.value) * 5 },
      { rotate: `${seed.r1 + drift.value * (seed.r2 - seed.r1)}deg` },
      { scale: interpolate(presence.value, [0, 1], [0.88, 1]) },
    ],
  }));

  return (
    <Animated.View style={[{ position: "absolute", left: spot.left as never, top: spot.top as never }, animatedStyle]}>
      <Text style={{ fontFamily: families.handBold, fontSize: seed.size, color: seed.color }} numberOfLines={1}>
        {text}
      </Text>
    </Animated.View>
  );
}

export function HangulField({ count = 9 }: { count?: number }) {
  const seeds = useMemo(() => makeSeeds(count), [count]);
  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {seeds.map((seed) => (
        <DriftingGlyph key={seed.key} seed={seed} />
      ))}
    </View>
  );
}
