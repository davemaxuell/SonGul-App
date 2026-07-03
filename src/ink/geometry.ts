// Stroke geometry: smoothing, variable-width outline building, hit tests.
import type { BBox, Stroke, StrokePoint } from '../types';

export interface Pt {
  x: number;
  y: number;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** squared distance from point to segment */
export function pointSegDist2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

/** drop points that are closer together than minDist (keeps ends) */
export function resample(points: StrokePoint[], minDist = 1.1): StrokePoint[] {
  if (points.length <= 2) return points;
  const out: StrokePoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    if (dist(prev.x, prev.y, points[i].x, points[i].y) >= minDist) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Chaikin corner-cutting; interpolates pressure too */
export function chaikin(points: StrokePoint[], iterations = 2): StrokePoint[] {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) return pts;
    const out: StrokePoint[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      out.push(
        { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25, p: a.p * 0.75 + b.p * 0.25, t: a.t },
        { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75, p: a.p * 0.25 + b.p * 0.75, t: b.t }
      );
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

function radiusFor(p: number, baseWidth: number, pressureOn: boolean, gain: number): number {
  if (!pressureOn) return baseWidth / 2;
  const f = Math.max(0.28, Math.min(1.9, 0.42 + 1.05 * p * gain));
  return (baseWidth / 2) * f;
}

/**
 * Build a closed outline polygon for a variable-width pen stroke.
 * Returns page-space points ready to fill.
 */
export function buildOutline(
  rawPoints: StrokePoint[],
  baseWidth: number,
  pressureOn: boolean,
  gain: number
): Pt[] {
  const points = chaikin(resample(rawPoints), 2);
  if (points.length === 0) return [];
  if (points.length === 1) {
    const r = Math.max(0.6, radiusFor(points[0].p, baseWidth, pressureOn, gain));
    return circlePolygon(points[0].x, points[0].y, r, 12);
  }
  // smooth pressure with a small moving average
  const radii: number[] = points.map((pt, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - 3); j <= Math.min(points.length - 1, i + 3); j++) {
      sum += points[j].p;
      n++;
    }
    return Math.max(0.5, radiusFor(sum / n, baseWidth, pressureOn, gain));
  });

  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    const r = radii[i];
    left.push({ x: points[i].x + nx * r, y: points[i].y + ny * r });
    right.push({ x: points[i].x - nx * r, y: points[i].y - ny * r });
  }

  // round caps
  const startCap = capArc(points[0], points[1], radii[0]);
  const endCap = capArc(points[points.length - 1], points[points.length - 2], radii[radii.length - 1]);

  return [...left, ...endCap, ...right.reverse(), ...startCap];
}

function capArc(tip: StrokePoint, inner: StrokePoint, r: number): Pt[] {
  let dx = tip.x - inner.x;
  let dy = tip.y - inner.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const base = Math.atan2(dy, dx);
  const out: Pt[] = [];
  const SEGS = 7;
  for (let i = 1; i < SEGS; i++) {
    // sweep from +90° to -90° relative to travel direction, around the tip
    const a = base + Math.PI / 2 - (Math.PI * i) / SEGS;
    out.push({ x: tip.x + Math.cos(a) * r, y: tip.y + Math.sin(a) * r });
  }
  return out;
}

export function circlePolygon(cx: number, cy: number, r: number, segs: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (Math.PI * 2 * i) / segs;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

export function strokeBBox(stroke: Stroke, pad = 0): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of stroke.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const r = stroke.width;
  return {
    x: minX - r - pad,
    y: minY - r - pad,
    w: maxX - minX + 2 * (r + pad),
    h: maxY - minY + 2 * (r + pad),
  };
}

export function bboxOfStrokes(strokes: Stroke[], pad = 8): BBox | null {
  if (strokes.length === 0) return null;
  let box: BBox | null = null;
  for (const s of strokes) {
    const b = strokeBBox(s);
    box = box ? bboxUnion(box, b) : b;
  }
  if (!box) return null;
  return { x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad };
}

export function bboxUnion(a: BBox, b: BBox): BBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

export function pointInBBox(x: number, y: number, b: BBox): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

export function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y,
      xj = poly[j].x,
      yj = poly[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** true if point (x,y) is within `radius` of the stroke's polyline */
export function strokeHit(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const r = radius + stroke.width / 2;
  const r2 = r * r;
  const pts = stroke.points;
  if (pts.length === 1) {
    const dx = pts[0].x - x;
    const dy = pts[0].y - y;
    return dx * dx + dy * dy <= r2;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    if (pointSegDist2(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= r2) return true;
  }
  return false;
}

/** portion (0..1) of stroke points inside the lasso polygon */
export function strokeInPolygonRatio(stroke: Stroke, poly: Pt[]): number {
  if (stroke.points.length === 0) return 0;
  let inside = 0;
  for (const p of stroke.points) {
    if (pointInPolygon(p.x, p.y, poly)) inside++;
  }
  return inside / stroke.points.length;
}
