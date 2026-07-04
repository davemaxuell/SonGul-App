// Library: notebook covers styled like physical practice books, with the
// manuscript-square window as the SonGul mark.
import { useEffect, useState } from 'react';
import type { Notebook, Settings, TemplateId } from '../types';
import * as db from '../db';
import { uid } from '../ids';
import { TEMPLATES } from '../templates';
import { importPdfIntoNotebook } from '../pdf/importPdf';
import { exportBundle, importBundle } from '../bundle';
import { downloadBlob } from '../pdf/exportPdf';
import Modal from './Modal';
import TemplatePicker from './TemplatePicker';

const COVERS = ['cover-pen', 'cover-navy', 'cover-warm', 'cover-green'];

function coverClass(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COVERS[h % COVERS.length];
}

interface Props {
  settings: Settings;
  onOpen: (nb: Notebook) => void;
  onOpenSettings: () => void;
}

export default function LibraryScreen({ settings, onOpen, onOpenSettings }: Props) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTemplate, setNewTemplate] = useState<TemplateId>(settings.defaultTemplate);
  const [renaming, setRenaming] = useState<Notebook | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    const list = await db.listNotebooks();
    setNotebooks(list);
    const counts: Record<string, number> = {};
    for (const nb of list) counts[nb.id] = (await db.listPages(nb.id)).length;
    setPageCounts(counts);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function create() {
    const title = newTitle.trim() || 'New notebook';
    const nb = await db.createNotebook(title, newTemplate);
    setNewOpen(false);
    setNewTitle('');
    onOpen(nb);
  }

  async function createFromPdf(file: File) {
    setBusy('Importing PDF…');
    try {
      const now = Date.now();
      const nb: Notebook = {
        id: uid(),
        title: file.name.replace(/\.pdf$/i, ''),
        template: 'blank',
        createdAt: now,
        updatedAt: now,
      };
      await db.putNotebook(nb);
      await importPdfIntoNotebook(file, nb.id, 0, (p) =>
        setBusy(`Importing PDF… page ${p.page}/${p.total}`)
      );
      onOpen(nb);
    } catch (err) {
      alert('PDF import failed: ' + (err instanceof Error ? err.message : String(err)));
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function importSongul(file: File) {
    setBusy('Importing backup…');
    try {
      const nb = await importBundle(file);
      await refresh();
      onOpen(nb);
    } catch (err) {
      alert('Import failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(null);
    }
  }

  async function remove(nb: Notebook) {
    if (!window.confirm(`Delete "${nb.title}" and all of its pages?`)) return;
    await db.deleteNotebookCascade(nb.id);
    await refresh();
  }

  async function exportNb(nb: Notebook) {
    setBusy('Exporting backup…');
    try {
      const blob = await exportBundle(nb.id);
      downloadBlob(blob, `${nb.title.replace(/[\\/:*?"<>|]/g, '_')}.songul`);
    } finally {
      setBusy(null);
    }
  }

  function templateName(id: TemplateId): string {
    const t = TEMPLATES.find((t) => t.id === id);
    return t ? t.ko : '';
  }

  return (
    <div className="library-screen">
      {menuFor && <div className="menu-backdrop" onClick={() => setMenuFor(null)} />}
      <header className="library-header">
        <div className="wordmark">
          <img className="brand-logo" src="/assets/SonGul-LOGO.png" alt="SonGul" />
          <span className="wordmark-rule" aria-hidden="true" />
          <span className="wordmark-text">
            <strong>Note</strong>
            <small>손으로 배우는 한국어</small>
          </span>
        </div>
        <div className="library-actions">
          <label className="btn btn-quiet file-btn">
            Import PDF
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void createFromPdf(f);
                e.target.value = '';
              }}
            />
          </label>
          <label className="btn btn-quiet file-btn">
            Import .songul
            <input
              type="file"
              accept=".songul,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importSongul(f);
                e.target.value = '';
              }}
            />
          </label>
          <button className="btn btn-quiet" onClick={onOpenSettings}>
            Settings
          </button>
          <button className="btn btn-primary" onClick={() => setNewOpen(true)}>
            + New notebook
          </button>
        </div>
      </header>

      {notebooks.length === 0 ? (
        <div className="library-empty">
          <img className="empty-mascot" src="/assets/mascot-tutor.png" alt="" aria-hidden="true" />
          <h2>Start your first notebook</h2>
          <span className="hand-note">한국어로 자유롭게 써보세요!</span>
          <p>
            Write Korean by hand, annotate worksheets, and get instant feedback on spacing and
            grammar — all offline.
          </p>
          <button className="btn btn-primary" onClick={() => setNewOpen(true)}>
            ✎ + New notebook
          </button>
        </div>
      ) : (
        <div className="notebook-grid">
          {notebooks.map((nb) => (
            <div key={nb.id} className="notebook-card">
              <button className={'notebook-cover ' + coverClass(nb.id)} onClick={() => onOpen(nb)}>
                <span className="cover-grid" aria-hidden="true">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <span key={i} />
                  ))}
                </span>
                <span className="cover-title">{nb.title}</span>
              </button>
              <div className="notebook-meta">
                <div className="notebook-meta-text">
                  <span className="notebook-name">{nb.title}</span>
                  <span className="notebook-sub">
                    {pageCounts[nb.id] ?? '…'} page{(pageCounts[nb.id] ?? 0) === 1 ? '' : 's'} ·{' '}
                    {templateName(nb.template)} · {new Date(nb.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className="icon-btn"
                  aria-label={`${nb.title} menu`}
                  onClick={() => setMenuFor(menuFor === nb.id ? null : nb.id)}
                >
                  ⋯
                </button>
                {menuFor === nb.id && (
                  <div className="page-menu nb-menu">
                    <button
                      onClick={() => {
                        setRenaming(nb);
                        setRenameTitle(nb.title);
                        setMenuFor(null);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => {
                        void exportNb(nb);
                        setMenuFor(null);
                      }}
                    >
                      Export .songul
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        void remove(nb);
                        setMenuFor(null);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {newOpen && (
        <Modal title="New notebook" onClose={() => setNewOpen(false)} wide>
          <label className="field-label" htmlFor="nb-title">
            Title
          </label>
          <input
            id="nb-title"
            className="field"
            placeholder="예: 한국어 쓰기 연습"
            value={newTitle}
            autoFocus
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create();
            }}
          />
          <label className="field-label">Page template</label>
          <TemplatePicker value={newTemplate} onChange={setNewTemplate} />
          <div className="modal-actions">
            <button className="btn btn-quiet" onClick={() => setNewOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => void create()}>
              Create notebook
            </button>
          </div>
        </Modal>
      )}

      {renaming && (
        <Modal title="Rename notebook" onClose={() => setRenaming(null)}>
          <input
            className="field"
            value={renameTitle}
            autoFocus
            onChange={(e) => setRenameTitle(e.target.value)}
          />
          <div className="modal-actions">
            <button className="btn btn-quiet" onClick={() => setRenaming(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                void (async () => {
                  await db.putNotebook({ ...renaming, title: renameTitle.trim() || renaming.title });
                  setRenaming(null);
                  await refresh();
                })();
              }}
            >
              Save
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
