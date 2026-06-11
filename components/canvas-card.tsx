// Saved-page tiles for Home: each card renders the page's actual ink through
// the same renderer as the live canvas (pressure-shaped outlines included), so
// the shelf shows real previous work — like a note app's note previews.
import { Canvas } from "@shopify/react-native-skia";
import { SymbolView } from "expo-symbols";
import { useMemo, type ComponentProps } from "react";
import { Text, View } from "react-native";

import { PressableScale } from "@/components/motion";
import { usePalette } from "@/components/ui";
import { InkPath } from "@/components/writing-surface";
import { renderStroke } from "@/lib/ink";
import { colors, families, radii, spacing } from "@/constants/theme";
import type { DemoPage } from "@/data/demo-pages"; // [DEMO-DATA]
import type { SavedCanvas } from "@/lib/database";
import type { Stroke } from "@/types/songul";

type IconName = ComponentProps<typeof SymbolView>["name"];
const plusIcon = { ios: "plus", android: "add", web: "add" } as IconName;

export const CANVAS_CARD = { width: 156, height: 196, thumbHeight: 132 } as const;

/** Fit the ink's bounding box into the thumbnail, rendered with the live-canvas renderer. */
function StrokesThumbnail({ strokes, width, height }: { strokes: Stroke[]; width: number; height: number }) {
  const scaled = useMemo(() => {
    // Eraser strokes are page-colored masks: render them, but size the view
    // box around real ink only.
    const inkPoints = strokes.filter((s) => s.tool !== "eraser").flatMap((s) => s.points);
    if (!inkPoints.length) return [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of inkPoints) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = 10;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    // Never blow tiny scribbles up past readable size; ink stays ink-like.
    const scale = Math.min((width - pad * 2) / w, (height - pad * 2) / h, 0.6);
    const transform = {
      scale,
      dx: (width - w * scale) / 2 - minX * scale,
      dy: (height - h * scale) / 2 - minY * scale,
    };
    return strokes
      .filter((s) => s.points.length)
      .map((s) => ({ id: s.id, ink: renderStroke(s, { complete: true, transform }) }));
  }, [strokes, width, height]);

  return (
    <Canvas style={{ width, height }}>
      {scaled.map(({ id, ink }) => (
        <InkPath key={id} ink={ink} />
      ))}
    </Canvas>
  );
}

function formatStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** A saved page. The paper face stays light in dark mode — it's a document. */
export function CanvasCard({ page, onPress }: { page: SavedCanvas; onPress: () => void }) {
  const stamp = formatStamp(page.updatedAt);
  const paper = page.pageFormat === "lined" ? colors.paperWarm : page.pageFormat === "blank" ? colors.white : colors.surface;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open your page from ${stamp}`}
      scaleTo={0.97}
      style={{
        width: CANVAS_CARD.width,
        height: CANVAS_CARD.height,
        borderRadius: radii.md,
        backgroundColor: paper,
        borderWidth: 1,
        borderColor: colors.line,
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(80, 66, 30, 0.07)",
      }}
    >
      <View pointerEvents="none" style={{ height: CANVAS_CARD.thumbHeight }}>
        {page.pageFormat === "lined" || page.pageFormat === "hangul" ? (
          <View style={{ position: "absolute", inset: 0 }}>
            {[34, 68, 102].map((top) => (
              <View key={top} style={{ position: "absolute", left: 0, right: 0, top, height: 1, backgroundColor: colors.gridSoft }} />
            ))}
          </View>
        ) : null}
        <StrokesThumbnail strokes={page.strokes} width={CANVAS_CARD.width} height={CANVAS_CARD.thumbHeight} />
      </View>
      <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: spacing.sm, justifyContent: "center", gap: 1, backgroundColor: colors.surface }}>
        <Text style={{ color: colors.ink, fontSize: 12.5, fontFamily: families.bodyBold }}>{stamp}</Text>
        <Text style={{ color: colors.inkSoft, fontSize: 11, fontFamily: families.bodyMedium }}>
          {page.strokes.length} {page.strokes.length === 1 ? "stroke" : "strokes"}
        </Text>
      </View>
    </PressableScale>
  );
}

/**
 * [DEMO-DATA] A mock saved page: typeset Korean in the handwriting face on the
 * same paper card, shown until real pages take its slot.
 */
export function MockPageCard({ page, onPress }: { page: DemoPage; onPress: () => void }) {
  const stamp = formatStamp(page.date.toISOString());
  const paper = page.pageFormat === "lined" ? colors.paperWarm : page.pageFormat === "blank" ? colors.white : colors.surface;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Sample page from ${stamp}. Opens a fresh page.`}
      scaleTo={0.97}
      style={{
        width: CANVAS_CARD.width,
        height: CANVAS_CARD.height,
        borderRadius: radii.md,
        backgroundColor: paper,
        borderWidth: 1,
        borderColor: colors.line,
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(80, 66, 30, 0.07)",
      }}
    >
      <View pointerEvents="none" style={{ height: CANVAS_CARD.thumbHeight, padding: spacing.sm, justifyContent: "center" }}>
        {page.pageFormat === "lined" || page.pageFormat === "hangul" ? (
          <View style={{ position: "absolute", inset: 0 }}>
            {[34, 68, 102].map((top) => (
              <View key={top} style={{ position: "absolute", left: 0, right: 0, top, height: 1, backgroundColor: colors.gridSoft }} />
            ))}
          </View>
        ) : null}
        <Text
          style={{
            fontFamily: families.handBold,
            fontSize: 21,
            lineHeight: 30,
            color: page.ink,
            transform: [{ rotate: "-1.2deg" }],
          }}
          numberOfLines={3}
        >
          {page.korean}
        </Text>
      </View>
      <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: spacing.sm, justifyContent: "center", gap: 1, backgroundColor: colors.surface }}>
        <Text style={{ color: colors.ink, fontSize: 12.5, fontFamily: families.bodyBold }}>{stamp}</Text>
        <Text style={{ color: "#8A5200", fontSize: 11, fontFamily: families.bodyBold }}>Sample page</Text>
      </View>
    </PressableScale>
  );
}

/** Leading tile: start a fresh page (mirrors a note app's "new note"). */
export function NewPageTile({ onPress }: { onPress: () => void }) {
  const palette = usePalette();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Start a new page"
      scaleTo={0.97}
      style={{
        width: CANVAS_CARD.width,
        height: CANVAS_CARD.height,
        borderRadius: radii.md,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: `${colors.pen}55`,
        backgroundColor: palette.settings.darkMode ? colors.darkPen50 : colors.pen50,
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.sm,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.pen,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SymbolView name={plusIcon} tintColor={colors.white} size={22} />
      </View>
      <Text style={{ color: palette.penText, fontSize: 13.5, fontFamily: families.bodyExtra }}>New page</Text>
    </PressableScale>
  );
}
