// The writing surface. Stylus/mouse draws; fingers pan and pinch-zoom
// (palm rejection by pointer type); S Pen barrel button erases.
// Two layers: a static canvas (paper + committed ink) and a live canvas
// (active stroke + predicted tail, lasso, selection, feedback highlights).
import { useEffect, useRef, useState } from 'react';
import type { BBox, Page, Settings, Stroke, StrokePoint, Tool } from '../types';
import { uid, deviceId } from '../ids';
import {
  bboxOfStrokes,
  pointInBBox,
  strokeHit,
  strokeInPolygonRatio,
  type Pt,
} from '../ink/geometry';
import { drawLiveStroke, drawPageBackground, drawStroke, drawStrokes, PAPER } from '../ink/render';

export interface SelectionState {
  ids: string[];
  bbox: BBox;
}

export interface TransformSnap {
  id: string;
  points: StrokePoint[];
  width: number;
}

export type SelectionAction = 'copy' | 'duplicate' | 'delete' | 'analyze';

interface Props {
  page: Page;
  strokes: Stroke[];
  bgBitmap: ImageBitmap | null;
  tool: Tool;
  color: string;
  width: number;
  opacity: number;
  settings: Settings;
  selection: SelectionState | null;
  highlights: BBox[];
  renderVersion: number;
  onCommitStroke: (s: Stroke) => void;
  onEraseCommit: (ids: string[]) => void;
  onSelectionChange: (sel: SelectionState | null) => void;
  onTransformCommit: (before: TransformSnap[], after: TransformSnap[]) => void;
  onSelectionAction: (a: SelectionAction) => void;
}

interface View {
  scale: number;
  tx: number;
  ty: number;
}

type Gesture =
  | { type: 'none' }
  | { type: 'draw'; pointerId: number; stroke: Stroke; predicted: StrokePoint[]; started: number }
  | { type: 'erase'; pointerId: number; erased: Set<string>; cursor: Pt | null }
  | { type: 'lasso'; pointerId: number; pts: Pt[] }
  | { type: 'pan'; pointerId: number; startX: number; startY: number; startView: View }
  | {
      type: 'pinch';
      startDist: number;
      anchorPage: Pt;
      startView: View;
    }
  | {
      type: 'moveSel';
      pointerId: number;
      startPage: Pt;
      before: TransformSnap[];
      base: Map<string, StrokePoint[]>;
      bbox0: BBox;
    }
  | {
      type: 'scaleSel';
      pointerId: number;
      before: TransformSnap[];
      base: Map<string, StrokePoint[]>;
      baseWidths: Map<string, number>;
      bbox0: BBox;
    };

export default function CanvasSurface(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const staticRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  const propsRef = useRef(props);
  propsRef.current = props;

  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 });
  const gestureRef = useRef<Gesture>({ type: 'none' });
  const touchesRef = useRef<Map<number, Pt>>(new Map());
  const rafRef = useRef<{ pending: boolean; statics: boolean }>({ pending: false, statics: false });
  const [viewTick, setViewTick] = useState(0);

  // ---------- coordinate helpers ----------

  function toCss(e: { clientX: number; clientY: number }): Pt {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function toPage(e: { clientX: number; clientY: number }): Pt {
    const css = toCss(e);
    const v = viewRef.current;
    return { x: (css.x - v.tx) / v.scale, y: (css.y - v.ty) / v.scale };
  }

  function applyView(ctx: CanvasRenderingContext2D) {
    const dpr = window.devicePixelRatio || 1;
    const v = viewRef.current;
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.tx, dpr * v.ty);
  }

  // ---------- rendering ----------

  function redrawStatic() {
    const canvas = staticRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { page, strokes, bgBitmap, settings } = propsRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    applyView(ctx);
    // paper shadow
    ctx.save();
    ctx.shadowColor = 'rgba(59, 50, 32, 0.25)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, page.w, page.h);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, page.w, page.h);
    ctx.clip();
    drawPageBackground(ctx, page, bgBitmap);
    drawStrokes(ctx, strokes, settings);
    ctx.restore();
  }

  /** static redraw during selection drag: cached backdrop + moving strokes */
  function redrawStaticWithMovingSelection(ids: string[]) {
    const canvas = staticRef.current;
    const ctx = canvas?.getContext('2d');
    const off = offscreenRef.current;
    if (!canvas || !ctx || !off) return;
    const { strokes, settings, page } = propsRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0);
    applyView(ctx);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, page.w, page.h);
    ctx.clip();
    const idSet = new Set(ids);
    for (const s of strokes) {
      if (!s.deleted && idSet.has(s.id)) drawStroke(ctx, s, settings);
    }
    ctx.restore();
  }

  function redrawLive() {
    const canvas = liveRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { settings, selection, highlights } = propsRef.current;
    const v = viewRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    applyView(ctx);

    // feedback highlights — the "red pen" layer
    for (const b of highlights) {
      ctx.save();
      ctx.strokeStyle = 'rgba(196, 71, 43, 0.85)';
      ctx.fillStyle = 'rgba(196, 71, 43, 0.07)';
      ctx.lineWidth = 2 / v.scale;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 6 / v.scale);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    const g = gestureRef.current;
    if (g.type === 'draw') {
      drawLiveStroke(ctx, g.stroke, g.predicted, settings);
    } else if (g.type === 'lasso' && g.pts.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(63, 114, 97, 0.9)';
      ctx.fillStyle = 'rgba(63, 114, 97, 0.08)';
      ctx.lineWidth = 1.5 / v.scale;
      ctx.setLineDash([6 / v.scale, 5 / v.scale]);
      ctx.beginPath();
      ctx.moveTo(g.pts[0].x, g.pts[0].y);
      for (const p of g.pts) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (g.type === 'erase' && g.cursor) {
      ctx.save();
      ctx.strokeStyle = 'rgba(38, 33, 25, 0.55)';
      ctx.lineWidth = 1.5 / v.scale;
      ctx.beginPath();
      ctx.arc(g.cursor.x, g.cursor.y, 12 / v.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (selection) {
      const b = selection.bbox;
      ctx.save();
      ctx.strokeStyle = 'rgba(63, 114, 97, 1)';
      ctx.lineWidth = 1.5 / v.scale;
      ctx.setLineDash([7 / v.scale, 5 / v.scale]);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.setLineDash([]);
      const hs = 12 / v.scale;
      ctx.fillStyle = '#3F7261';
      ctx.fillRect(b.x + b.w - hs / 2, b.y + b.h - hs / 2, hs, hs);
      ctx.restore();
    }
  }

  function scheduleRedraw(statics: boolean) {
    const r = rafRef.current;
    r.statics = r.statics || statics;
    if (r.pending) return;
    r.pending = true;
    requestAnimationFrame(() => {
      const g = gestureRef.current;
      if (r.statics) {
        if (g.type === 'moveSel' || g.type === 'scaleSel') {
          redrawStaticWithMovingSelection(g.before.map((s) => s.id));
        } else {
          redrawStatic();
        }
      }
      redrawLive();
      r.pending = false;
      r.statics = false;
    });
  }

  function setView(next: View) {
    viewRef.current = {
      scale: Math.max(0.2, Math.min(6, next.scale)),
      tx: next.tx,
      ty: next.ty,
    };
    scheduleRedraw(true);
    setViewTick((t) => t + 1);
  }

  function fitView() {
    const el = containerRef.current;
    if (!el) return;
    const { page } = propsRef.current;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const scale = Math.min((cw - 48) / page.w, (ch - 48) / page.h);
    const s = Math.max(0.15, Math.min(2.5, scale));
    setView({
      scale: s,
      tx: (cw - page.w * s) / 2,
      ty: Math.max(20, (ch - page.h * s) / 2),
    });
  }

  // ---------- selection drag helpers ----------

  function snapshotSelection(ids: string[]): {
    before: TransformSnap[];
    base: Map<string, StrokePoint[]>;
    widths: Map<string, number>;
  } {
    const { strokes } = propsRef.current;
    const before: TransformSnap[] = [];
    const base = new Map<string, StrokePoint[]>();
    const widths = new Map<string, number>();
    for (const s of strokes) {
      if (!ids.includes(s.id)) continue;
      const copy = s.points.map((p) => ({ ...p }));
      before.push({ id: s.id, points: copy.map((p) => ({ ...p })), width: s.width });
      base.set(s.id, copy);
      widths.set(s.id, s.width);
    }
    return { before, base, widths };
  }

  function buildOffscreenWithout(ids: string[]) {
    const canvas = staticRef.current;
    if (!canvas) return;
    let off = offscreenRef.current;
    if (!off) {
      off = document.createElement('canvas');
      offscreenRef.current = off;
    }
    off.width = canvas.width;
    off.height = canvas.height;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    const { page, strokes, bgBitmap, settings } = propsRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, off.width, off.height);
    applyView(ctx);
    ctx.save();
    ctx.shadowColor = 'rgba(59, 50, 32, 0.25)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, page.w, page.h);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, page.w, page.h);
    ctx.clip();
    drawPageBackground(ctx, page, bgBitmap);
    drawStrokes(ctx, strokes, settings, new Set(ids));
    ctx.restore();
  }

  function endTransform(g: Extract<Gesture, { type: 'moveSel' } | { type: 'scaleSel' }>) {
    const { strokes, onTransformCommit, onSelectionChange } = propsRef.current;
    const ids = g.before.map((s) => s.id);
    const after: TransformSnap[] = [];
    const selected: Stroke[] = [];
    for (const s of strokes) {
      if (!ids.includes(s.id)) continue;
      after.push({ id: s.id, points: s.points.map((p) => ({ ...p })), width: s.width });
      selected.push(s);
    }
    onTransformCommit(g.before, after);
    const bbox = bboxOfStrokes(selected);
    if (bbox) onSelectionChange({ ids, bbox });
  }

  // ---------- pointer handlers (attached natively; read props via ref) ----------

  useEffect(() => {
    const el = liveRef.current;
    const container = containerRef.current;
    if (!el || !container) return;

    const onPointerDown = (e: PointerEvent) => {
      const p = propsRef.current;
      const g = gestureRef.current;
      const css = toCss(e);
      const pt = toPage(e);

      // touch when finger-draw is off => navigation
      if (e.pointerType === 'touch' && !p.settings.fingerDraws) {
        touchesRef.current.set(e.pointerId, css);
        el.setPointerCapture(e.pointerId);
        if (touchesRef.current.size === 2) {
          const [a, b] = [...touchesRef.current.values()];
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const v = viewRef.current;
          gestureRef.current = {
            type: 'pinch',
            startDist: Math.hypot(b.x - a.x, b.y - a.y),
            anchorPage: { x: (mid.x - v.tx) / v.scale, y: (mid.y - v.ty) / v.scale },
            startView: { ...v },
          };
        } else if (touchesRef.current.size === 1 && g.type === 'none') {
          gestureRef.current = {
            type: 'pan',
            pointerId: e.pointerId,
            startX: css.x,
            startY: css.y,
            startView: { ...viewRef.current },
          };
        }
        return;
      }

      if (g.type !== 'none') return; // one active gesture at a time
      e.preventDefault();

      // middle mouse or hand tool => pan
      if (p.tool === 'hand' || e.button === 1) {
        el.setPointerCapture(e.pointerId);
        gestureRef.current = {
          type: 'pan',
          pointerId: e.pointerId,
          startX: css.x,
          startY: css.y,
          startView: { ...viewRef.current },
        };
        return;
      }

      // S Pen barrel button => temporary eraser
      const barrel = e.pointerType === 'pen' && (e.buttons & 32) !== 0;
      const tool = barrel ? 'eraser' : p.tool;

      if (tool === 'lasso') {
        el.setPointerCapture(e.pointerId);
        const sel = p.selection;
        if (sel) {
          const v = viewRef.current;
          const hs = 16 / v.scale;
          const handle = {
            x: sel.bbox.x + sel.bbox.w - hs,
            y: sel.bbox.y + sel.bbox.h - hs,
            w: hs * 2,
            h: hs * 2,
          };
          if (pointInBBox(pt.x, pt.y, handle)) {
            const snap = snapshotSelection(sel.ids);
            buildOffscreenWithout(sel.ids);
            gestureRef.current = {
              type: 'scaleSel',
              pointerId: e.pointerId,
              before: snap.before,
              base: snap.base,
              baseWidths: snap.widths,
              bbox0: { ...sel.bbox },
            };
            return;
          }
          if (pointInBBox(pt.x, pt.y, sel.bbox)) {
            const snap = snapshotSelection(sel.ids);
            buildOffscreenWithout(sel.ids);
            gestureRef.current = {
              type: 'moveSel',
              pointerId: e.pointerId,
              startPage: pt,
              before: snap.before,
              base: snap.base,
              bbox0: { ...sel.bbox },
            };
            return;
          }
          p.onSelectionChange(null);
        }
        gestureRef.current = { type: 'lasso', pointerId: e.pointerId, pts: [pt] };
        return;
      }

      if (tool === 'eraser') {
        el.setPointerCapture(e.pointerId);
        gestureRef.current = {
          type: 'erase',
          pointerId: e.pointerId,
          erased: new Set(),
          cursor: pt,
        };
        eraseAt(pt);
        return;
      }

      if (tool === 'pen' || tool === 'highlighter') {
        el.setPointerCapture(e.pointerId);
        const now = Date.now();
        const stroke: Stroke = {
          id: uid(),
          pageId: p.page.id,
          deviceId: deviceId(),
          tool,
          color: p.color,
          width: p.width,
          opacity: p.opacity,
          points: [{ x: pt.x, y: pt.y, p: normalizedPressure(e), t: 0 }],
          createdAt: now,
          deleted: false,
        };
        gestureRef.current = { type: 'draw', pointerId: e.pointerId, stroke, predicted: [], started: now };
        scheduleRedraw(false);
      }
    };

    const eraseAt = (pt: Pt) => {
      const g = gestureRef.current;
      if (g.type !== 'erase') return;
      const { strokes } = propsRef.current;
      const radius = 12 / viewRef.current.scale;
      let hit = false;
      for (const s of strokes) {
        if (s.deleted || g.erased.has(s.id)) continue;
        if (strokeHit(s, pt.x, pt.y, radius)) {
          s.deleted = true;
          g.erased.add(s.id);
          hit = true;
        }
      }
      g.cursor = pt;
      scheduleRedraw(hit);
    };

    const onPointerMove = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (g.type === 'none') return;
      const p = propsRef.current;

      if (g.type === 'pan') {
        if (e.pointerId !== g.pointerId && !touchesRef.current.has(e.pointerId)) return;
        if (touchesRef.current.has(e.pointerId)) touchesRef.current.set(e.pointerId, toCss(e));
        if (e.pointerId !== g.pointerId) return;
        const css = toCss(e);
        setView({
          scale: g.startView.scale,
          tx: g.startView.tx + (css.x - g.startX),
          ty: g.startView.ty + (css.y - g.startY),
        });
        return;
      }

      if (g.type === 'pinch') {
        if (!touchesRef.current.has(e.pointerId)) return;
        touchesRef.current.set(e.pointerId, toCss(e));
        const pts = [...touchesRef.current.values()];
        if (pts.length < 2) return;
        const [a, b] = pts;
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const scale = Math.max(0.2, Math.min(6, g.startView.scale * (dist / g.startDist)));
        setView({
          scale,
          tx: mid.x - g.anchorPage.x * scale,
          ty: mid.y - g.anchorPage.y * scale,
        });
        return;
      }

      if (e.pointerId !== ('pointerId' in g ? g.pointerId : -1)) return;

      if (g.type === 'draw') {
        const events = 'getCoalescedEvents' in e ? e.getCoalescedEvents() : [e];
        for (const ev of events.length > 0 ? events : [e]) {
          const pt = toPage(ev);
          g.stroke.points.push({
            x: pt.x,
            y: pt.y,
            p: normalizedPressure(ev as PointerEvent),
            t: Date.now() - g.started,
          });
        }
        const predicted = 'getPredictedEvents' in e ? e.getPredictedEvents() : [];
        g.predicted = predicted.slice(0, 4).map((ev) => {
          const pt = toPage(ev);
          return { x: pt.x, y: pt.y, p: normalizedPressure(ev), t: Date.now() - g.started };
        });
        scheduleRedraw(false);
        return;
      }

      if (g.type === 'erase') {
        eraseAt(toPage(e));
        return;
      }

      if (g.type === 'lasso') {
        g.pts.push(toPage(e));
        scheduleRedraw(false);
        return;
      }

      if (g.type === 'moveSel') {
        const pt = toPage(e);
        const dx = pt.x - g.startPage.x;
        const dy = pt.y - g.startPage.y;
        const { strokes, onSelectionChange } = p;
        for (const s of strokes) {
          const base = g.base.get(s.id);
          if (!base) continue;
          for (let i = 0; i < base.length; i++) {
            s.points[i].x = base[i].x + dx;
            s.points[i].y = base[i].y + dy;
          }
        }
        onSelectionChange({
          ids: g.before.map((b) => b.id),
          bbox: { ...g.bbox0, x: g.bbox0.x + dx, y: g.bbox0.y + dy },
        });
        scheduleRedraw(true);
        return;
      }

      if (g.type === 'scaleSel') {
        const pt = toPage(e);
        const f = Math.max(
          0.15,
          Math.min(
            8,
            ((pt.x - g.bbox0.x) / g.bbox0.w + (pt.y - g.bbox0.y) / g.bbox0.h) / 2
          )
        );
        const { strokes, onSelectionChange } = p;
        for (const s of strokes) {
          const base = g.base.get(s.id);
          if (!base) continue;
          for (let i = 0; i < base.length; i++) {
            s.points[i].x = g.bbox0.x + (base[i].x - g.bbox0.x) * f;
            s.points[i].y = g.bbox0.y + (base[i].y - g.bbox0.y) * f;
          }
          const w0 = g.baseWidths.get(s.id);
          if (w0 !== undefined) s.width = Math.max(0.5, w0 * f);
        }
        onSelectionChange({
          ids: g.before.map((b) => b.id),
          bbox: { x: g.bbox0.x, y: g.bbox0.y, w: g.bbox0.w * f, h: g.bbox0.h * f },
        });
        scheduleRedraw(true);
        return;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const g = gestureRef.current;
      const p = propsRef.current;

      if (touchesRef.current.has(e.pointerId)) {
        touchesRef.current.delete(e.pointerId);
        if (g.type === 'pinch') {
          const remaining = [...touchesRef.current.entries()];
          if (remaining.length === 1) {
            const [id, css] = remaining[0];
            gestureRef.current = {
              type: 'pan',
              pointerId: id,
              startX: css.x,
              startY: css.y,
              startView: { ...viewRef.current },
            };
          } else {
            gestureRef.current = { type: 'none' };
          }
          return;
        }
        if (g.type === 'pan' && g.pointerId === e.pointerId) {
          gestureRef.current = { type: 'none' };
        }
        return;
      }

      if (g.type === 'none' || !('pointerId' in g) || g.pointerId !== e.pointerId) return;

      if (g.type === 'draw') {
        gestureRef.current = { type: 'none' };
        if (g.stroke.points.length > 0) {
          // draw committed stroke immediately to avoid a blank frame
          const ctx = staticRef.current?.getContext('2d');
          if (ctx) {
            applyView(ctx);
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, p.page.w, p.page.h);
            ctx.clip();
            drawStroke(ctx, g.stroke, p.settings);
            ctx.restore();
          }
          p.onCommitStroke(g.stroke);
        }
        scheduleRedraw(false);
        return;
      }

      if (g.type === 'erase') {
        gestureRef.current = { type: 'none' };
        if (g.erased.size > 0) p.onEraseCommit([...g.erased]);
        scheduleRedraw(true);
        return;
      }

      if (g.type === 'lasso') {
        gestureRef.current = { type: 'none' };
        if (g.pts.length >= 3) {
          const selected = p.strokes.filter(
            (s) => !s.deleted && strokeInPolygonRatio(s, g.pts) >= 0.5
          );
          const bbox = bboxOfStrokes(selected);
          p.onSelectionChange(selected.length > 0 && bbox ? { ids: selected.map((s) => s.id), bbox } : null);
        }
        scheduleRedraw(false);
        return;
      }

      if (g.type === 'pan') {
        gestureRef.current = { type: 'none' };
        return;
      }

      if (g.type === 'moveSel' || g.type === 'scaleSel') {
        gestureRef.current = { type: 'none' };
        endTransform(g);
        scheduleRedraw(true);
        return;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const css = toCss(e);
        const factor = Math.exp(-e.deltaY * 0.0018);
        const scale = Math.max(0.2, Math.min(6, v.scale * factor));
        const px = (css.x - v.tx) / v.scale;
        const py = (css.y - v.ty) / v.scale;
        setView({ scale, tx: css.x - px * scale, ty: css.y - py * scale });
      } else {
        setView({ scale: v.scale, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY });
      }
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContextMenu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // resize handling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      for (const canvas of [staticRef.current, liveRef.current]) {
        if (!canvas) continue;
        canvas.width = Math.max(1, Math.round(el.clientWidth * dpr));
        canvas.height = Math.max(1, Math.round(el.clientHeight * dpr));
        canvas.style.width = el.clientWidth + 'px';
        canvas.style.height = el.clientHeight + 'px';
      }
      scheduleRedraw(true);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // refit when switching pages
  useEffect(() => {
    gestureRef.current = { type: 'none' };
    touchesRef.current.clear();
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.page.id]);

  // repaint when content changes
  useEffect(() => {
    scheduleRedraw(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.renderVersion, props.bgBitmap, props.selection, props.highlights, props.settings]);

  // selection action bar position (screen space)
  const v = viewRef.current;
  const sel = props.selection;
  const barLeft = sel ? Math.max(8, sel.bbox.x * v.scale + v.tx) : 0;
  const barTop = sel ? Math.max(8, sel.bbox.y * v.scale + v.ty - 52) : 0;

  return (
    <div ref={containerRef} className="canvas-container" data-viewtick={viewTick}>
      <canvas ref={staticRef} className="canvas-layer" />
      <canvas ref={liveRef} className="canvas-layer canvas-top" />
      {sel && gestureRef.current.type === 'none' && (
        <div className="sel-bar" style={{ left: barLeft, top: barTop }}>
          <button onClick={() => props.onSelectionAction('analyze')} className="sel-btn sel-analyze">
            교정 Check
          </button>
          <button onClick={() => props.onSelectionAction('copy')} className="sel-btn">
            Copy
          </button>
          <button onClick={() => props.onSelectionAction('duplicate')} className="sel-btn">
            Duplicate
          </button>
          <button onClick={() => props.onSelectionAction('delete')} className="sel-btn sel-danger">
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function normalizedPressure(e: PointerEvent): number {
  if (e.pointerType === 'pen' && e.pressure > 0) return e.pressure;
  if (e.pressure > 0 && e.pressure !== 0.5) return e.pressure;
  return 0.5;
}
