// Library: notebook covers styled like physical practice books, with the
// manuscript-square window as the SonGul mark.
import { useEffect, useMemo, useState } from 'react';
import type { BBox, Notebook, RecognitionRecord, Settings, TemplateId } from '../types';
import * as db from '../db';
import { jamoIncludes } from '../recognition/jamo';
import { inkRecognitionAvailable } from '../recognition/songulInk';
import { cloudConfigured } from '../cloud/supabase';
import { useCloudUser } from '../cloud/useCloudUser';
import { getSyncStatus, onSyncStatus, syncNow } from '../sync/engine';
import {
  backupNotebook,
  deleteBackup,
  listCloudBackups,
  restoreBackup,
  type CloudBackupRow,
} from '../cloud/backup';
import { flushPending } from '../cloud/queue';
import { uid } from '../ids';
import { TEMPLATES } from '../templates';
import { importPdfIntoNotebook } from '../pdf/importPdf';
import { exportBundle, importBundle } from '../bundle';
import { saveBlob } from '../saveFile';
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
  onOpenAt: (nb: Notebook, pageId: string, bbox: BBox | null) => void;
  onOpenSettings: () => void;
}

export default function LibraryScreen({ settings, onOpen, onOpenAt, onOpenSettings }: Props) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({});
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTemplate, setNewTemplate] = useState<TemplateId>(settings.defaultTemplate);
  const [renaming, setRenaming] = useState<Notebook | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<RecognitionRecord[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const all = await db.listAllRecognition();
          setHits(
            all
              .filter((r) => r.status === 'ok' && jamoIncludes(r.text, query))
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, 30)
          );
        } finally {
          setSearching(false);
        }
      })();
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const notebookOf = useMemo(() => {
    const m = new Map(notebooks.map((nb) => [nb.id, nb]));
    return (id: string) => m.get(id);
  }, [notebooks]);

  const cloudUser = useCloudUser();
  const [cloudOpen, setCloudOpen] = useState(false);
  const [cloudRows, setCloudRows] = useState<CloudBackupRow[] | null>(null);
  const [sync, setSync] = useState(getSyncStatus());
  useEffect(() => onSyncStatus(setSync), []);
  useEffect(() => {
    void syncNow();
  }, []);

  async function refreshCloud() {
    try {
      setCloudRows(await listCloudBackups());
    } catch (err) {
      alert('Could not load cloud backups: ' + (err instanceof Error ? err.message : String(err)));
      setCloudRows([]);
    }
  }

  useEffect(() => {
    if (cloudOpen && cloudUser) void refreshCloud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudOpen, cloudUser]);

  // retry queued auto-backups on load and when connectivity returns
  useEffect(() => {
    if (!cloudConfigured()) return;
    const flush = () =>
      void flushPending(async (id) => {
        const nb = await db.getNotebook(id);
        if (nb) await backupNotebook(nb);
      });
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, []);

  async function backupNb(nb: Notebook) {
    setBusy('Backing up to cloud…');
    try {
      await backupNotebook(nb);
    } catch (err) {
      alert('Backup failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(null);
    }
  }

  async function restoreRow(row: CloudBackupRow) {
    setBusy('Restoring from cloud…');
    try {
      const nb = await restoreBackup(row);
      const original = notebookOf(row.notebook_id);
      if (
        original &&
        window.confirm(
          `Replace the local copy of "${original.title}" with the restored backup? (Cancel keeps both.)`
        )
      ) {
        await db.deleteNotebookCascade(original.id);
      }
      await refresh();
      setCloudOpen(false);
      onOpen(nb);
    } catch (err) {
      alert('Restore failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(null);
    }
  }

  async function deleteRow(row: CloudBackupRow) {
    if (!window.confirm(`Delete the cloud backup of "${row.title}"? Local notes stay.`)) return;
    setBusy('Deleting cloud backup…');
    try {
      await deleteBackup(row);
      await refreshCloud();
    } catch (err) {
      alert('Delete failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(null);
    }
  }

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
      await saveBlob(blob, `${nb.title.replace(/[\\/:*?"<>|]/g, '_')}.songul`);
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
          <input
            className="field search-field"
            type="search"
            placeholder="손글씨 검색 · Search handwriting"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search handwriting"
          />
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
          {sync.state !== 'disabled' && (
            <button
              className={`btn btn-quiet sync-chip sync-${sync.state}`}
              onClick={() => void syncNow()}
              title="Sync now · 지금 동기화"
            >
              {sync.state === 'syncing'
                ? '☁ syncing…'
                : sync.state === 'error'
                  ? '☁ sync error'
                  : sync.lastSyncAt
                    ? `☁ ${new Date(sync.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : '☁ sync'}
            </button>
          )}
          {cloudConfigured() && (
            <button className="btn btn-quiet" onClick={() => setCloudOpen(true)}>
              Cloud
            </button>
          )}
          <button className="btn btn-quiet" onClick={onOpenSettings}>
            Settings
          </button>
          <button className="btn btn-primary" onClick={() => setNewOpen(true)}>
            + New notebook
          </button>
        </div>
      </header>

      {query.trim() && (
        <div className="search-results" role="list">
          {searching && hits.length === 0 && <p className="panel-hint">Searching…</p>}
          {!searching && hits.length === 0 && (
            <p className="panel-hint">
              No matches.
              {!inkRecognitionAvailable() &&
                ' Handwriting search indexes notes written on the Android app.'}
            </p>
          )}
          {hits.map((h) => {
            const nb = notebookOf(h.notebookId);
            if (!nb) return null;
            return (
              <button
                key={h.key}
                className="search-hit"
                role="listitem"
                onClick={() => onOpenAt(nb, h.pageId, h.bbox)}
              >
                <span className="search-hit-text">{h.text}</span>
                <span className="search-hit-meta">
                  {nb.title} · {new Date(h.timestamp).toLocaleDateString()}
                </span>
              </button>
            );
          })}
        </div>
      )}

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
                    {cloudConfigured() && cloudUser && (
                      <button
                        onClick={() => {
                          void backupNb(nb);
                          setMenuFor(null);
                        }}
                      >
                        Back up to cloud
                      </button>
                    )}
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

      {cloudOpen && (
        <Modal title="Cloud backups · 클라우드 백업" onClose={() => setCloudOpen(false)} wide>
          {!cloudUser ? (
            <p className="panel-hint">
              Sign in first — Settings → Account & cloud backup.
            </p>
          ) : cloudRows === null ? (
            <p className="panel-hint">Loading…</p>
          ) : cloudRows.length === 0 ? (
            <p className="panel-hint">
              No cloud backups yet. Use a notebook's ⋯ menu → "Back up to cloud".
            </p>
          ) : (
            <div className="cloud-list">
              {cloudRows.map((row) => (
                <div key={row.notebook_id} className="cloud-row">
                  <div className="cloud-row-text">
                    <span className="cloud-row-title">{row.title}</span>
                    <span className="cloud-row-meta">
                      {row.page_count} page{row.page_count === 1 ? '' : 's'} ·{' '}
                      {Math.max(1, Math.round(row.size_bytes / 1024))} KB ·{' '}
                      {new Date(row.updated_at).toLocaleString()} · {row.device_name}
                    </span>
                  </div>
                  <div className="cloud-row-actions">
                    <button className="btn btn-quiet" onClick={() => void restoreRow(row)}>
                      Restore
                    </button>
                    <button className="btn btn-quiet danger" onClick={() => void deleteRow(row)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
