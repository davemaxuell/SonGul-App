// Blob replication + id-preserving snapshots (spec §11.5). Blobs live in the
// private `backups` bucket under {userId}/sync/... so the v0.3 folder-scoped
// storage policies apply unchanged.
import * as db from '../db';
import { exportBundle } from '../bundle';
import { currentUser, supabase } from '../cloud/supabase';
import type { BlobHooks } from './engine';
import type { SyncOp } from './ops';
import type { FeedbackResult, Notebook, Page, Stroke } from '../types';

interface SnapshotBundle {
  notebook: Notebook;
  pages: Page[];
  strokes: Stroke[];
  feedback: FeedbackResult[];
  attachments: { id: string; name: string; type: string; dataB64: string }[];
  pageImages: { pageId: string; dataB64: string }[];
}

interface SnapshotFile {
  bundle: SnapshotBundle;
  watermark: number;
}

const SNAPSHOT_EVERY_OPS = 500;

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type });
}

/** Write a bundle's rows with their ORIGINAL ids. Never emits ops. */
export async function installSnapshot(bundle: SnapshotBundle): Promise<void> {
  await db.withoutOpCapture(async () => {
    await db.putNotebook(bundle.notebook);
    for (const a of bundle.attachments ?? []) {
      await db.putAttachment({ id: a.id, name: a.name, blob: b64ToBlob(a.dataB64, a.type) });
    }
    for (const p of bundle.pages) await db.putPage(p);
    for (const img of bundle.pageImages ?? []) {
      await db.putPageImage(img.pageId, b64ToBlob(img.dataB64, 'image/png'));
    }
    await db.putStrokes(bundle.strokes);
    for (const f of bundle.feedback ?? []) await db.addFeedback(f);
  });
}

async function userPrefix(): Promise<string | null> {
  const user = await currentUser();
  return user ? user.id : null;
}

export function makeBlobHooks(): BlobHooks {
  return {
    async afterPush(notebookIds: string[]): Promise<void> {
      const prefix = await userPrefix();
      if (!prefix) return;
      for (const nbId of notebookIds) {
        for (const page of await db.listPagesIncludingDeleted(nbId)) {
          if (!page.pdf) continue;
          const att = await db.getAttachment(page.pdf.attachmentId);
          if (att) {
            await supabase()
              .storage.from('backups')
              .upload(`${prefix}/sync/attachments/${att.id}`, att.blob, { upsert: true });
          }
          const img = await db.getPageImage(page.id);
          if (img) {
            await supabase()
              .storage.from('backups')
              .upload(`${prefix}/sync/pageimages/${page.id}.png`, img, {
                upsert: true,
                contentType: 'image/png',
              });
          }
        }
      }
    },

    async afterApply(applied: SyncOp[]): Promise<void> {
      const prefix = await userPrefix();
      if (!prefix) return;
      for (const op of applied) {
        if (op.type !== 'UPSERT_PAGE') continue;
        const { page } = op.payload as { page: Page };
        if (!page.pdf) continue;
        if (!(await db.getAttachment(page.pdf.attachmentId))) {
          const { data } = await supabase()
            .storage.from('backups')
            .download(`${prefix}/sync/attachments/${page.pdf.attachmentId}`);
          if (data) {
            const attachmentId = page.pdf.attachmentId;
            await db.withoutOpCapture(() =>
              db.putAttachment({ id: attachmentId, name: 'synced.pdf', blob: data })
            );
          } else {
            console.warn('sync: attachment missing in storage', page.pdf.attachmentId);
          }
        }
        if (!(await db.getPageImage(page.id))) {
          const { data } = await supabase()
            .storage.from('backups')
            .download(`${prefix}/sync/pageimages/${page.id}.png`);
          if (data) await db.withoutOpCapture(() => db.putPageImage(page.id, data));
        }
      }
    },

    async maybeSnapshot(notebookIds: string[]): Promise<void> {
      const prefix = await userPrefix();
      if (!prefix) return;
      const marks = (await db.getSetting<Record<string, number>>('snapshotMarks')) ?? {};
      const cursorMap = (await db.getSetting<Record<string, number>>('syncCursors')) ?? {};
      for (const nbId of notebookIds) {
        const nb = await db.getNotebookIncludingDeleted(nbId);
        if (!nb || nb.deleted) continue;
        const watermark = cursorMap[nbId] ?? 0;
        if (watermark - (marks[nbId] ?? 0) < SNAPSHOT_EVERY_OPS) continue;
        const bundle = JSON.parse(await (await exportBundle(nbId)).text()) as SnapshotBundle;
        const file: SnapshotFile = { bundle, watermark };
        await supabase()
          .storage.from('backups')
          .upload(`${prefix}/sync/snapshots/${nbId}.json`, new Blob([JSON.stringify(file)]), {
            upsert: true,
            contentType: 'application/json',
          });
        marks[nbId] = watermark;
      }
      await db.setSetting('snapshotMarks', marks);
    },

    async bootstrapNotebook(notebookId: string): Promise<number> {
      const prefix = await userPrefix();
      if (!prefix) return 0;
      const { data } = await supabase()
        .storage.from('backups')
        .download(`${prefix}/sync/snapshots/${notebookId}.json`);
      if (!data) return 0;
      try {
        const file = JSON.parse(await data.text()) as SnapshotFile;
        await installSnapshot(file.bundle);
        return file.watermark;
      } catch (err) {
        console.warn('sync: snapshot install failed, replaying full op log', err);
        return 0;
      }
    },
  };
}
