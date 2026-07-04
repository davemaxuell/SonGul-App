// Recognition quality bench: write each prompted sample, recognize it,
// score character error rate. Answers "can I trust ML Kit for my hand?".
import { useEffect, useRef, useState } from 'react';
import type { Stroke, StrokePoint } from '../types';
import { uid } from '../ids';
import { cer } from '../recognition/cer';
import { BENCH_SAMPLES } from '../recognition/benchSamples';
import { getProvider, defaultProviderId } from '../feedback/recognition';
import { inkRecognitionAvailable } from '../recognition/songulInk';

interface ItemResult {
  expected: string;
  recognized: string;
  cer: number;
}

const W = 700;
const H = 220;

export default function BenchScreen({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeRef = useRef<{ id: string; points: StrokePoint[]; start: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<ItemResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastText, setLastText] = useState<string | null>(null);

  const available = inkRecognitionAvailable();
  const sample = BENCH_SAMPLES[index];
  const done = index >= BENCH_SAMPLES.length;

  useEffect(() => {
    redraw();
  }, [index]);

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#FFFDF6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#23244D';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const all = activeRef.current
      ? [...strokesRef.current.map((s) => s.points), activeRef.current.points]
      : strokesRef.current.map((s) => s.points);
    for (const pts of all) {
      if (pts.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const pt of pts) ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
  }

  function pos(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = pos(e);
    activeRef.current = { id: uid(), points: [{ x, y, p: 0.5, t: 0 }], start: performance.now() };
    redraw();
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const active = activeRef.current;
    if (!active) return;
    const { x, y } = pos(e);
    active.points.push({ x, y, p: 0.5, t: Math.round(performance.now() - active.start) });
    redraw();
  }

  function onUp() {
    const active = activeRef.current;
    if (!active) return;
    strokesRef.current.push({
      id: active.id,
      pageId: 'bench',
      deviceId: 'bench',
      tool: 'pen',
      color: '#23244D',
      width: 2.4,
      opacity: 1,
      points: active.points,
      createdAt: Date.now(),
      deleted: false,
    });
    activeRef.current = null;
    redraw();
  }

  function clearInk() {
    strokesRef.current = [];
    activeRef.current = null;
    setLastText(null);
    redraw();
  }

  async function score() {
    if (busy || strokesRef.current.length === 0) return;
    setBusy(true);
    try {
      const r = await getProvider(defaultProviderId()).recognize({
        strokes: strokesRef.current,
        language: 'ko',
      });
      setLastText(r.text || '(nothing recognized)');
      setResults((prev) => [
        ...prev,
        { expected: sample, recognized: r.text, cer: cer(sample, r.text) },
      ]);
    } catch (err) {
      setLastText('recognition failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  function next() {
    clearInk();
    setIndex((i) => i + 1);
  }

  const avg = results.length
    ? results.reduce((sum, r) => sum + r.cer, 0) / results.length
    : null;

  return (
    <div className="bench-screen">
      <header className="library-header">
        <button className="btn btn-quiet" onClick={onBack}>
          ← Back
        </button>
        <h1 className="bench-title">Recognition bench · 인식 벤치</h1>
      </header>
      <div className="bench-body">
        {!available && (
          <p className="panel-hint">
            The bench needs on-device recognition — run it inside the Android app.
          </p>
        )}
        {done ? (
          <h2>Done — average CER {avg === null ? '—' : (avg * 100).toFixed(1) + '%'}</h2>
        ) : (
          <>
            <p className="bench-prompt">
              Write ({index + 1}/{BENCH_SAMPLES.length}): <strong>{sample}</strong>
            </p>
            <canvas
              ref={canvasRef}
              className="bench-canvas"
              width={W}
              height={H}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />
            <div className="bench-actions">
              <button className="btn btn-quiet" onClick={clearInk}>
                Clear
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !available}
                onClick={() => void score()}
              >
                {busy ? 'Recognizing…' : 'Recognize & score'}
              </button>
              <button className="btn btn-quiet" onClick={next}>
                {lastText ? 'Next →' : 'Skip →'}
              </button>
            </div>
            {lastText && (
              <p className="bench-last">
                Recognized: <strong>{lastText}</strong>
              </p>
            )}
          </>
        )}
        {results.length > 0 && (
          <div className="bench-results">
            <h3>
              Results {avg !== null && <>· average CER {(avg * 100).toFixed(1)}%</>}
            </h3>
            {results.map((r, i) => (
              <div key={i} className="bench-row">
                <span>{r.expected}</span>
                <span className="bench-recognized">{r.recognized || '—'}</span>
                <span className={r.cer <= 0.2 ? 'bench-good' : 'bench-bad'}>
                  {(r.cer * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
