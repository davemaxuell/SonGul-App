// Typesets an AI-coach exercise as a printed "problem sheet" layered onto the
// writing canvas (pointer-events: none — ink passes straight through), so the
// learner answers by hand on the same page the exercise is printed on.
// Content comes from data/demo-coach.ts ([DEMO-DATA] until the backend lands).
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { useEntrance } from "@/components/motion";
import { colors, families, spacing } from "@/constants/theme";
import type { CoachExercise, WorksheetBlock } from "@/data/demo-coach";

// The canvas page is always light paper (even in dark mode), so the sheet is
// typeset in fixed warm-ink colors rather than the themed palette. Printed
// content uses the body/Korean faces — the contrast with the learner's
// handwriting is the point.
const SHEET = {
  ink: colors.ink,
  soft: colors.inkMuted,
  faint: colors.inkSoft,
  accent: colors.pen,
  rule: colors.grid,
  hint: "#8A5200", // dark amber, AA on the light page formats
};

const WRITE_LINE_HEIGHT = 54; // breathing room for handwriting on answer lines

function WriteLines({ n }: { n: number }) {
  return (
    <View>
      {Array.from({ length: n }, (_, i) => (
        <View
          key={i}
          style={{ height: WRITE_LINE_HEIGHT, borderBottomWidth: 1.5, borderStyle: "dashed", borderBottomColor: SHEET.rule }}
        />
      ))}
    </View>
  );
}

function Block({ block }: { block: WorksheetBlock }) {
  switch (block.kind) {
    case "heading":
      return (
        <View style={{ gap: 4 }}>
          <Text style={{ color: SHEET.ink, fontSize: 27, fontFamily: families.korean, lineHeight: 38 }}>{block.ko}</Text>
          <Text style={{ color: SHEET.soft, fontSize: 15, fontFamily: families.bodyMedium }}>{block.en}</Text>
        </View>
      );
    case "paragraph":
      return (
        <View style={{ gap: 6 }}>
          <Text style={{ color: SHEET.ink, fontSize: 20, fontFamily: families.korean, lineHeight: 36 }}>{block.ko}</Text>
          {block.en ? (
            <Text style={{ color: SHEET.soft, fontSize: 13.5, lineHeight: 19, fontFamily: families.bodyMedium, fontStyle: "italic" }}>
              {block.en}
            </Text>
          ) : null}
        </View>
      );
    case "question":
      return (
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "baseline" }}>
            <Text style={{ color: SHEET.accent, fontSize: 16, fontFamily: families.bodyExtra }}>{block.n}.</Text>
            <View style={{ flex: 1, gap: 2 }}>
              {block.ko ? <Text style={{ color: SHEET.ink, fontSize: 20, fontFamily: families.korean, lineHeight: 32 }}>{block.ko}</Text> : null}
              {block.en ? <Text style={{ color: SHEET.soft, fontSize: 13.5, fontFamily: families.bodyMedium, fontStyle: "italic" }}>{block.en}</Text> : null}
            </View>
          </View>
          {block.lines ? <View style={{ marginLeft: 22 }}><WriteLines n={block.lines} /></View> : null}
        </View>
      );
    case "dialogue":
      return (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: block.blank ? colors.gold50 : colors.pen50,
              borderWidth: 1,
              borderColor: block.blank ? `${colors.gold}55` : `${colors.pen}33`,
              alignItems: "center",
              justifyContent: "center",
              marginTop: 3,
            }}
          >
            <Text style={{ color: block.blank ? SHEET.hint : SHEET.accent, fontSize: 13, fontFamily: families.bodyExtra }}>{block.speaker}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            {block.blank ? (
              <>
                <View style={{ height: WRITE_LINE_HEIGHT - 12, borderBottomWidth: 1.5, borderStyle: "dashed", borderBottomColor: SHEET.rule }} />
                {block.en ? <Text style={{ color: SHEET.faint, fontSize: 12.5, fontFamily: families.bodyMedium, fontStyle: "italic" }}>{block.en}</Text> : null}
              </>
            ) : (
              <>
                <Text style={{ color: SHEET.ink, fontSize: 19, fontFamily: families.korean, lineHeight: 32 }}>{block.ko}</Text>
                {block.en ? <Text style={{ color: SHEET.soft, fontSize: 12.5, fontFamily: families.bodyMedium, fontStyle: "italic" }}>{block.en}</Text> : null}
              </>
            )}
          </View>
        </View>
      );
    case "cloze":
      return (
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end" }}>
            {block.segments.map((segment, i) =>
              segment.blank ? (
                // The answer is typeset invisibly so the gap is exactly the
                // right width for the learner to handwrite into.
                <View key={i} style={{ borderBottomWidth: 2, borderBottomColor: SHEET.faint, minWidth: 56, alignItems: "center", paddingHorizontal: 6 }}>
                  <Text style={{ color: "transparent", fontSize: 22, fontFamily: families.korean, lineHeight: 40 }}>{segment.t}</Text>
                </View>
              ) : (
                <Text key={i} style={{ color: SHEET.ink, fontSize: 22, fontFamily: families.korean, lineHeight: 40 }}>{segment.t}</Text>
              ),
            )}
          </View>
          {block.en ? <Text style={{ color: SHEET.soft, fontSize: 13, fontFamily: families.bodyMedium, fontStyle: "italic" }}>{block.en}</Text> : null}
        </View>
      );
    case "wordbank":
      return (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {block.words.map((word) => (
            <View
              key={word}
              style={{
                borderRadius: 999,
                backgroundColor: colors.pen50,
                borderWidth: 1,
                borderColor: `${colors.pen}33`,
                paddingHorizontal: 12,
                paddingVertical: 5,
              }}
            >
              <Text style={{ color: SHEET.accent, fontSize: 15, fontFamily: families.korean }}>{word}</Text>
            </View>
          ))}
        </View>
      );
    case "hint":
      return (
        <Text style={{ color: SHEET.hint, fontSize: 13.5, lineHeight: 20, fontFamily: families.bodyMedium, fontStyle: "italic" }}>
          <Text style={{ fontFamily: families.bodyBold, fontStyle: "normal" }}>Hint · </Text>
          {block.text}
        </Text>
      );
    case "lines":
      return <WriteLines n={block.n} />;
  }
}

/**
 * The printed sheet. Rendered inside WritingSurface above the ink layer with
 * pointer events disabled; `insetLeft` clears the floating tool rail.
 */
export function Worksheet({ exercise, insetLeft = 0 }: { exercise: CoachExercise; insetLeft?: number }) {
  const entrance = useEntrance(0);
  return (
    <View style={{ flex: 1, paddingLeft: Math.max(insetLeft, spacing.lg), paddingRight: spacing.lg, paddingTop: spacing.lg }}>
      <Animated.View style={[{ width: "100%", maxWidth: 720, alignSelf: "center", gap: spacing.md }, entrance]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text style={{ color: SHEET.accent, fontSize: 12, fontFamily: families.bodyBold, letterSpacing: 0.5 }}>
            SONGUL COACH · {exercise.title.toUpperCase()}
          </Text>
          {/* [DEMO-DATA] visible tag — remove with the demo bank */}
          <View style={{ borderRadius: 999, backgroundColor: `${colors.gold}1A`, borderWidth: 1, borderColor: `${colors.gold}55`, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: SHEET.hint, fontSize: 10, fontFamily: families.bodyBold, letterSpacing: 0.5 }}>SAMPLE</Text>
          </View>
        </View>
        <Text style={{ color: SHEET.soft, fontSize: 15, fontFamily: families.bodyBold, lineHeight: 22 }}>{exercise.instructions}</Text>
        <View style={{ height: 1, backgroundColor: SHEET.rule }} />
        <View style={{ gap: spacing.md }}>
          {exercise.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}
