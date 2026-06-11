// The ink renderer, shared by the live writing surface and saved-page
// thumbnails so previews match the page exactly.
//
// Pen and marker strokes render as pressure-sensitive variable-width outlines
// (perfect-freehand): real stylus pressure when the hardware reports it,
// velocity-simulated weight otherwise, so even mouse ink looks alive. Eraser
// strokes stay simple round lines painted in the page color.
//
// Stored stroke data is unchanged (points keep per-sample pressure; `width` is
// the nib diameter with tool multipliers already baked in), so pages saved
// before this renderer existed re-render correctly.
import { Skia, type SkPath } from "@shopify/react-native-skia";
import { getStroke } from "perfect-freehand";

import type { Stroke, StrokePoint } from "@/types/songul";

export type InkTransform = { scale: number; dx: number; dy: number };

export type RenderedInk =
  | { kind: "fill"; path: SkPath; color: string }
  | { kind: "line"; path: SkPath; color: string; width: number };

function tx(p: StrokePoint, t?: InkTransform) {
  return t ? { x: p.x * t.scale + t.dx, y: p.y * t.scale + t.dy } : p;
}

/** Quad-midpoint smoothed open path: eraser strokes and legacy line rendering. */
export function buildLinePath(points: StrokePoint[], t?: InkTransform): SkPath {
  const path = Skia.Path.Make();
  if (!points.length) return path;
  const first = tx(points[0], t);
  path.moveTo(first.x, first.y);
  if (points.length === 1) {
    path.lineTo(first.x + 0.1, first.y + 0.1);
    return path;
  }
  for (let i = 1; i < points.length; i += 1) {
    const prev = tx(points[i - 1], t);
    const point = tx(points[i], t);
    path.quadTo(prev.x, prev.y, (prev.x + point.x) / 2, (prev.y + point.y) / 2);
  }
  return path;
}

/** Closed, quad-smoothed path around a perfect-freehand outline. */
function outlineToPath(outline: number[][]): SkPath {
  const path = Skia.Path.Make();
  if (outline.length < 3) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i += 1) {
    const p = outline[i];
    const n = outline[(i + 1) % outline.length];
    path.quadTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2);
  }
  path.close();
  return path;
}

// Real hardware pressure varies sample to sample; browsers report a constant
// 0.5 for devices without it (and mice). Only trust pressure that moves.
function hasRealPressure(points: StrokePoint[]): boolean {
  let seen: number | null = null;
  for (const p of points) {
    if (p.pressure === undefined || p.pressure <= 0) continue;
    if (seen === null) seen = p.pressure;
    else if (Math.abs(p.pressure - seen) > 0.01) return true;
  }
  return seen !== null && Math.abs(seen - 0.5) > 0.01;
}

/**
 * Render one stroke. `complete` adds the end cap (false while the stroke is
 * still under the pen). `transform` lets thumbnails scale into a card.
 */
export function renderStroke(
  stroke: Stroke,
  options: { complete: boolean; transform?: InkTransform },
): RenderedInk {
  const scale = options.transform?.scale ?? 1;

  if (stroke.tool === "eraser") {
    return {
      kind: "line",
      path: buildLinePath(stroke.points, options.transform),
      color: stroke.color,
      width: Math.max(1, stroke.width * scale),
    };
  }

  const marker = stroke.tool === "marker";
  const input = stroke.points.map((p) => {
    const { x, y } = tx(p, options.transform);
    return [x, y, p.pressure ?? 0.5] as [number, number, number];
  });

  const outline = getStroke(input, {
    // pf "size" is the full nib diameter at max pressure; with thinning the
    // average pen line lands close to the stored width.
    size: Math.max(2, stroke.width * (marker ? 1 : 2)) * scale,
    thinning: marker ? 0.12 : 0.62,
    smoothing: 0.55,
    streamline: marker ? 0.35 : 0.5,
    simulatePressure: marker ? false : !hasRealPressure(stroke.points),
    last: options.complete,
  });

  return { kind: "fill", path: outlineToPath(outline), color: stroke.color };
}
