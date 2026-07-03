import { useEffect, useRef, useState } from 'react';
import type { Page, Settings } from '../types';
import * as db from '../db';
import { loadPageBitmap } from '../pageBitmaps';
import { renderPageToCanvas } from '../ink/render';

const THUMB_W = 118;

function PageThumb({
  page,
  version,
  settings,
}: {
  page: Page;
  version: number;
  settings: Settings;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const canvas = ref.current;
      if (!canvas) return;
      const strokes = await db.listStrokes(page.id);
      const bitmap = await loadPageBitmap(page);
      if (cancelled) return;
      renderPageToCanvas(canvas, page, strokes.filter((s) => !s.deleted), bitmap, THUMB_W / page.w, settings);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [page, version, settings]);
  return <canvas ref={ref} className="page-thumb-canvas" style={{ width: THUMB_W }} />;
}

interface Props {
  pages: Page[];
  currentId: string | null;
  versions: Record<string, number>;
  settings: Settings;
  onSelect: (id: string) => void;
  onAddPage: () => void;
  onAddPageWithTemplate: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}

export default function PageSidebar(p: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null);

  return (
    <aside className="page-sidebar">
      {menuFor && <div className="menu-backdrop" onClick={() => setMenuFor(null)} />}
      <div className="page-list">
        {p.pages.map((page, i) => (
          <div
            key={page.id}
            className={'page-thumb' + (page.id === p.currentId ? ' current' : '')}
          >
            <button className="page-thumb-hit" onClick={() => p.onSelect(page.id)}>
              <PageThumb page={page} version={p.versions[page.id] ?? 0} settings={p.settings} />
            </button>
            <div className="page-thumb-foot">
              <span className="page-num">{i + 1}</span>
              <button
                className="icon-btn page-menu-btn"
                aria-label={`Page ${i + 1} menu`}
                onClick={() => setMenuFor(menuFor === page.id ? null : page.id)}
              >
                ⋯
              </button>
            </div>
            {menuFor === page.id && (
              <div className="page-menu">
                <button disabled={i === 0} onClick={() => { p.onMove(page.id, -1); setMenuFor(null); }}>
                  ↑ Move up
                </button>
                <button
                  disabled={i === p.pages.length - 1}
                  onClick={() => { p.onMove(page.id, 1); setMenuFor(null); }}
                >
                  ↓ Move down
                </button>
                <button onClick={() => { p.onDuplicate(page.id); setMenuFor(null); }}>
                  Duplicate
                </button>
                <button className="danger" onClick={() => { p.onDelete(page.id); setMenuFor(null); }}>
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="page-sidebar-actions">
        <button className="btn btn-quiet" onClick={p.onAddPage}>
          + Page
        </button>
        <button
          className="btn btn-quiet"
          title="Add page with template"
          aria-label="Add page with template"
          onClick={p.onAddPageWithTemplate}
        >
          ▾
        </button>
      </div>
    </aside>
  );
}
