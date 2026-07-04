// Notebook editor: canvas + toolbar + page sidebar + feedback panel.
// Owns the in-memory stroke list, per-page undo/redo op stacks, and
// persistence (every committed operation is written to IndexedDB at once).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BBox, InkTool, Notebook, Page, Settings, Stroke, TemplateId, Tool } from '../types';
import * as db from '../db';
import { uid } from '../ids';
import { loadPageBitmap, dropPageBitmap } from '../pageBitmaps';
import { drawStroke } from '../ink/render';
import { bboxOfStrokes } from '../ink/geometry';
import { importPdfIntoNotebook } from '../pdf/importPdf';
import { exportNotebookPdf, exportPagePng, downloadBlob } from '../pdf/exportPdf';
import { exportBundle } from '../bundle';
import CanvasSurface, {
  type SelectionAction,
  type SelectionState,
  type TransformSnap,
} from './CanvasSurface';
import Toolbar, { PEN_COLORS, HL_COLORS, PEN_WIDTHS, HL_WIDTHS } from './Toolbar';
import PageSidebar from './PageSidebar';
import FeedbackPanel, { type AnalysisRequest } from './FeedbackPanel';
import Modal from './Modal';
import TemplatePicker from './TemplatePicker';

type Op =
  | { kind: 'add'; ids: string[] }
  | { kind: 'erase'; ids: string[] }
  | { kind: 'transform'; before: TransformSnap[]; after: TransformSnap[] };

interface Stacks {
  undo: Op[];
  redo: Op[];
}

interface Props {
  notebook: Notebook;
  settings: Settings;
  onBack: () => void;
}

export default function EditorScreen({ notebook, settings, onBack }: Props) {
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const [renderVersion, setRenderVersion] = useState(0);
  const [pageVersions, setPageVersions] = useState<Record<string, number>>({});
  const [bgBitmap, setBgBitmap] = useState<ImageBitmap | null>(null);

  const [tool, setTool] = useState<Tool>('pen');
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [penWidth, setPenWidth] = useState(PEN_WIDTHS[1]);
  const [hlColor, setHlColor] = useState(HL_COLORS[0]);
  const [hlWidth, setHlWidth] = useState(HL_WIDTHS[1]);

  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [highlights, setHighlights] = useState<BBox[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [analysisRequest, setAnalysisRequest] = useState<AnalysisRequest | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [pickerTemplate, setPickerTemplate] = useState<TemplateId>(settings.defaultTemplate);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [stacksVersion, setStacksVersion] = useState(0);

  const stacksRef = useRef<Map<string, Stacks>>(new Map());
  const clipboardRef = useRef<Stroke[]>([]);

  const currentPage = pages.find((p) => p.id === currentPageId) ?? null;

  // ---------- loading ----------

  useEffect(() => {
    void (async () => {
      const list = await db.listPages(notebook.id);
      setPages(list);
      if (list.length > 0) setCurrentPageId(list[0].id);
    })();
  }, [notebook.id]);

  useEffect(() => {
    if (!currentPage) return;
    let cancelled = false;
    void (async () => {
      const strokes = await db.listStrokes(currentPage.id);
      const bitmap = await loadPageBitmap(currentPage);
      if (cancelled) return;
      strokesRef.current = strokes;
      setBgBitmap(bitmap);
      setSelection(null);
      setRenderVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPageId, pages]);

  // ---------- op stack helpers ----------

  function stacks(): Stacks {
    const id = currentPageId ?? '';
    let s = stacksRef.current.get(id);
    if (!s) {
      s = { undo: [], redo: [] };
      stacksRef.current.set(id, s);
    }
    return s;
  }

  function pushOp(op: Op) {
    const s = stacks();
    s.undo.push(op);
    if (s.undo.length > 200) s.undo.shift();
    s.redo = [];
    setStacksVersion((v) => v + 1);
  }

  const bump = useCallback(() => {
    setRenderVersion((v) => v + 1);
    if (currentPageId) {
      setPageVersions((prev) => ({ ...prev, [currentPageId]: (prev[currentPageId] ?? 0) + 1 }));
    }
    void db.touchNotebook(notebook.id);
  }, [currentPageId, notebook.id]);

  async function persistIds(ids: string[]) {
    const set = new Set(ids);
    await db.putStrokes(strokesRef.current.filter((s) => set.has(s.id)));
  }

  function applyOp(op: Op, dir: 'undo' | 'redo') {
    const strokes = strokesRef.current;
    if (op.kind === 'add') {
      const set = new Set(op.ids);
      for (const s of strokes) if (set.has(s.id)) s.deleted = dir === 'undo';
      void persistIds(op.ids);
    } else if (op.kind === 'erase') {
      const set = new Set(op.ids);
      for (const s of strokes) if (set.has(s.id)) s.deleted = dir === 'redo';
      void persistIds(op.ids);
    } else {
      const snaps = dir === 'undo' ? op.before : op.after;
      for (const snap of snaps) {
        const s = strokes.find((x) => x.id === snap.id);
        if (!s) continue;
        s.points = snap.points.map((pt) => ({ ...pt }));
        s.width = snap.width;
      }
      void persistIds(snaps.map((s) => s.id));
    }
    setSelection(null);
    bump();
  }

  const undo = useCallback(() => {
    const s = stacks();
    const op = s.undo.pop();
    if (!op) return;
    s.redo.push(op);
    applyOp(op, 'undo');
    setStacksVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPageId]);

  const redo = useCallback(() => {
    const s = stacks();
    const op = s.redo.pop();
    if (!op) return;
    s.undo.push(op);
    applyOp(op, 'redo');
    setStacksVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPageId]);

  // ---------- canvas callbacks ----------

  const onCommitStroke = useCallback(
    (stroke: Stroke) => {
      strokesRef.current.push(stroke);
      void db.putStroke(stroke);
      pushOp({ kind: 'add', ids: [stroke.id] });
      bump();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bump]
  );

  const onEraseCommit = useCallback(
    (ids: string[]) => {
      void persistIds(ids);
      pushOp({ kind: 'erase', ids });
      bump();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bump]
  );

  const onTransformCommit = useCallback(
    (before: TransformSnap[], after: TransformSnap[]) => {
      void persistIds(after.map((s) => s.id));
      pushOp({ kind: 'transform', before, after });
      bump();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bump]
  );

  function selectedStrokes(): Stroke[] {
    if (!selection) return [];
    const set = new Set(selection.ids);
    return strokesRef.current.filter((s) => set.has(s.id) && !s.deleted);
  }

  function cloneStrokes(list: Stroke[], offset: number): Stroke[] {
    return list.map((s) => ({
      ...s,
      id: uid(),
      pageId: currentPageId ?? s.pageId,
      createdAt: Date.now(),
      points: s.points.map((p) => ({ ...p, x: p.x + offset, y: p.y + offset })),
    }));
  }

  function pasteStrokes(source: Stroke[], offset: number) {
    const clones = cloneStrokes(source, offset);
    if (clones.length === 0) return;
    strokesRef.current.push(...clones);
    void db.putStrokes(clones);
    pushOp({ kind: 'add', ids: clones.map((s) => s.id) });
    const bbox = bboxOfStrokes(clones);
    if (bbox) setSelection({ ids: clones.map((s) => s.id), bbox });
    setTool('lasso');
    bump();
  }

  const onSelectionAction = useCallback(
    (action: SelectionAction) => {
      const strokes = selectedStrokes();
      if (strokes.length === 0) return;
      if (action === 'copy') {
        clipboardRef.current = strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }));
        setStacksVersion((v) => v + 1); // refresh paste button
      } else if (action === 'duplicate') {
        pasteStrokes(strokes, 28);
      } else if (action === 'delete') {
        for (const s of strokes) s.deleted = true;
        void persistIds(strokes.map((s) => s.id));
        pushOp({ kind: 'erase', ids: strokes.map((s) => s.id) });
        setSelection(null);
        bump();
      } else if (action === 'analyze') {
        const bbox = bboxOfStrokes(strokes);
        if (!bbox) return;
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bbox.w * scale));
        canvas.height = Math.max(1, Math.round(bbox.h * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFDF7';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.setTransform(scale, 0, 0, scale, -bbox.x * scale, -bbox.y * scale);
          for (const s of strokes) drawStroke(ctx, s, settings);
        }
        setAnalysisRequest({
          imageUrl: canvas.toDataURL('image/png'),
          bbox,
          strokeCount: strokes.length,
          strokes,
        });
        setPanelOpen(true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selection, settings, bump]
  );

  // ---------- page operations ----------

  async function refreshPages(selectId?: string) {
    const list = await db.listPages(notebook.id);
    setPages(list);
    if (selectId) setCurrentPageId(selectId);
    else if (currentPageId && !list.some((p) => p.id === currentPageId) && list.length > 0) {
      setCurrentPageId(list[0].id);
    }
  }

  async function addPage(template: TemplateId) {
    const idx = pages.findIndex((p) => p.id === currentPageId);
    const insertAt = idx === -1 ? pages.length : idx + 1;
    const page = await db.createPage(notebook.id, template, insertAt);
    const ordered = [...pages];
    ordered.splice(insertAt, 0, page);
    await db.reorderPages(ordered);
    await refreshPages(page.id);
  }

  async function duplicatePage(id: string) {
    const src = pages.find((p) => p.id === id);
    if (!src) return;
    const idx = pages.findIndex((p) => p.id === id);
    const copy = await db.createPage(notebook.id, src.template, idx + 1, {
      w: src.w,
      h: src.h,
      pdf: src.pdf,
      practice: src.practice,
    });
    if (src.pdf) {
      const img = await db.getPageImage(src.id);
      if (img) await db.putPageImage(copy.id, img);
    }
    const strokes = (await db.listStrokes(src.id)).filter((s) => !s.deleted);
    await db.putStrokes(
      strokes.map((s) => ({ ...s, id: uid(), pageId: copy.id, points: s.points.map((p) => ({ ...p })) }))
    );
    const ordered = [...pages];
    ordered.splice(idx + 1, 0, copy);
    await db.reorderPages(ordered);
    await refreshPages(copy.id);
  }

  async function deletePage(id: string) {
    if (!window.confirm('Delete this page? Its ink will be removed.')) return;
    await db.deletePageCascade(id);
    dropPageBitmap(id);
    stacksRef.current.delete(id);
    let list = await db.listPages(notebook.id);
    if (list.length === 0) {
      await db.createPage(notebook.id, settings.defaultTemplate, 0);
      list = await db.listPages(notebook.id);
    }
    await db.reorderPages(list);
    await refreshPages(id === currentPageId ? list[0]?.id : undefined);
  }

  async function movePage(id: string, dir: -1 | 1) {
    const idx = pages.findIndex((p) => p.id === id);
    const target = idx + dir;
    if (idx === -1 || target < 0 || target >= pages.length) return;
    const ordered = [...pages];
    [ordered[idx], ordered[target]] = [ordered[target], ordered[idx]];
    await db.reorderPages(ordered);
    await refreshPages();
  }

  // ---------- import / export ----------

  async function handlePdfImport(file: File) {
    setBusy('Importing PDF…');
    try {
      const created = await importPdfIntoNotebook(file, notebook.id, pages.length, (p) =>
        setBusy(`Importing PDF… page ${p.page}/${p.total}`)
      );
      await refreshPages(created[0]?.id);
    } catch (err) {
      alert('PDF import failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(null);
    }
  }

  async function handleExport(kind: 'png' | 'pdf' | 'bundle') {
    setExportOpen(false);
    setBusy(kind === 'png' ? 'Exporting PNG…' : kind === 'pdf' ? 'Exporting PDF…' : 'Exporting backup…');
    try {
      const safeTitle = notebook.title.replace(/[\\/:*?"<>|]/g, '_') || 'notebook';
      if (kind === 'png' && currentPage) {
        const blob = await exportPagePng(
          currentPage,
          strokesRef.current.filter((s) => !s.deleted),
          settings
        );
        const pageNum = pages.findIndex((p) => p.id === currentPage.id) + 1;
        downloadBlob(blob, `${safeTitle}-p${pageNum}.png`);
      } else if (kind === 'pdf') {
        const blob = await exportNotebookPdf(notebook, pages, settings);
        downloadBlob(blob, `${safeTitle}.pdf`);
      } else if (kind === 'bundle') {
        const blob = await exportBundle(notebook.id);
        downloadBlob(blob, `${safeTitle}.songul`);
      }
    } catch (err) {
      alert('Export failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(null);
    }
  }

  async function createPracticePage(sentences: string[]) {
    const page = await db.createPage(notebook.id, 'practice', pages.length, {
      practice: { sentences },
    });
    await refreshPages(page.id);
    setPanelOpen(false);
  }

  function jumpTo(pageId: string, bbox: BBox | null) {
    if (pages.some((p) => p.id === pageId)) {
      setCurrentPageId(pageId);
      setHighlights(bbox ? [bbox] : []);
    }
  }

  // ---------- keyboard ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (clipboardRef.current.length > 0) {
          e.preventDefault();
          pasteStrokes(clipboardRef.current, 28);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo]);

  const s = stacksRef.current.get(currentPageId ?? '');
  const canUndo = (s?.undo.length ?? 0) > 0;
  const canRedo = (s?.redo.length ?? 0) > 0;
  void stacksVersion;

  return (
    <div className="editor-screen">
      {exportOpen && <div className="menu-backdrop" onClick={() => setExportOpen(false)} />}
      <header className="editor-topbar">
        <div className="topbar-left">
          <button className="icon-btn back-btn" onClick={onBack} aria-label="Back to library">
            ←
          </button>
          <h1 className="notebook-title">{notebook.title}</h1>
        </div>

        <Toolbar
          tool={tool}
          penColor={penColor}
          penWidth={penWidth}
          hlColor={hlColor}
          hlWidth={hlWidth}
          canUndo={canUndo}
          canRedo={canRedo}
          canPaste={clipboardRef.current.length > 0}
          onTool={(t) => {
            setTool(t);
            if (t !== 'lasso') setSelection(null);
          }}
          onColor={(t: InkTool, c) => (t === 'pen' ? setPenColor(c) : setHlColor(c))}
          onWidth={(t: InkTool, w) => (t === 'pen' ? setPenWidth(w) : setHlWidth(w))}
          onUndo={undo}
          onRedo={redo}
          onPaste={() => pasteStrokes(clipboardRef.current, 28)}
        />

        <div className="topbar-right">
          <label className="btn btn-quiet file-btn">
            + PDF
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handlePdfImport(f);
                e.target.value = '';
              }}
            />
          </label>
          <div className="export-wrap">
            <button className="btn btn-quiet" onClick={() => setExportOpen((o) => !o)}>
              Export ▾
            </button>
            {exportOpen && (
              <div className="export-menu">
                <button onClick={() => void handleExport('png')}>Page as PNG</button>
                <button onClick={() => void handleExport('pdf')}>Notebook as PDF</button>
                <button onClick={() => void handleExport('bundle')}>.songul backup</button>
              </div>
            )}
          </div>
          <button
            className={'btn redpen-btn' + (panelOpen ? ' active' : '')}
            onClick={() => setPanelOpen((o) => !o)}
            aria-pressed={panelOpen}
          >
            교정
          </button>
        </div>
      </header>

      <div className="editor-content">
        <PageSidebar
          pages={pages}
          currentId={currentPageId}
          versions={pageVersions}
          settings={settings}
          onSelect={(id) => {
            setCurrentPageId(id);
            setHighlights([]);
          }}
          onAddPage={() => void addPage(settings.defaultTemplate)}
          onAddPageWithTemplate={() => setTemplatePickerOpen(true)}
          onDuplicate={(id) => void duplicatePage(id)}
          onDelete={(id) => void deletePage(id)}
          onMove={(id, dir) => void movePage(id, dir)}
        />

        {currentPage ? (
          <CanvasSurface
            page={currentPage}
            strokes={strokesRef.current}
            bgBitmap={bgBitmap}
            tool={tool}
            color={tool === 'highlighter' ? hlColor : penColor}
            width={tool === 'highlighter' ? hlWidth : penWidth}
            opacity={tool === 'highlighter' ? 0.38 : 1}
            settings={settings}
            selection={selection}
            highlights={highlights}
            renderVersion={renderVersion}
            onCommitStroke={onCommitStroke}
            onEraseCommit={onEraseCommit}
            onSelectionChange={setSelection}
            onTransformCommit={onTransformCommit}
            onSelectionAction={onSelectionAction}
          />
        ) : (
          <div className="canvas-container" />
        )}

        {panelOpen && currentPage && (
          <FeedbackPanel
            notebook={notebook}
            page={currentPage}
            settings={settings}
            request={analysisRequest}
            onHighlight={setHighlights}
            onCreatePractice={(sentences) => void createPracticePage(sentences)}
            onJumpTo={jumpTo}
            onClose={() => {
              setPanelOpen(false);
              setHighlights([]);
            }}
          />
        )}
      </div>

      {templatePickerOpen && (
        <Modal title="Add page · 템플릿 선택" onClose={() => setTemplatePickerOpen(false)} wide>
          <TemplatePicker value={pickerTemplate} onChange={setPickerTemplate} />
          <div className="modal-actions">
            <button className="btn btn-quiet" onClick={() => setTemplatePickerOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setTemplatePickerOpen(false);
                void addPage(pickerTemplate);
              }}
            >
              Add page
            </button>
          </div>
        </Modal>
      )}

      {busy && (
        <div className="busy-overlay">
          <div className="busy-card">{busy}</div>
        </div>
      )}
    </div>
  );
}
