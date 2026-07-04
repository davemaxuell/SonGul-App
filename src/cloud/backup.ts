// Whole-notebook snapshot backup to Supabase Storage + manifest table.
// Restore is always import-as-copy (the bundle importer remaps ids).
import type { Notebook } from '../types';
import * as db from '../db';
import { exportBundle, importBundle } from '../bundle';
import { cloudConfigured, currentUser, supabase } from './supabase';
import { queueBackup } from './queue';

export interface CloudBackupRow {
  user_id: string;
  notebook_id: string;
  title: string;
  page_count: number;
  size_bytes: number;
  updated_at: string;
  device_name: string;
}

export function backupPath(userId: string, notebookId: string): string {
  return `${userId}/${notebookId}.songul`;
}

export function deviceName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android tablet';
  if (/iPad|iPhone/i.test(ua)) return 'iPad/iPhone';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Mac/i.test(ua)) return 'Mac';
  return 'device';
}

export async function backupNotebook(nb: Notebook): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error('로그인 후 백업할 수 있어요. Sign in to back up.');
  const blob = await exportBundle(nb.id);
  const path = backupPath(user.id, nb.id);
  const { error: upErr } = await supabase()
    .storage.from('backups')
    .upload(path, blob, { upsert: true, contentType: 'application/json' });
  if (upErr) throw upErr;
  const pages = await db.listPages(nb.id);
  const row: CloudBackupRow = {
    user_id: user.id,
    notebook_id: nb.id,
    title: nb.title,
    page_count: pages.length,
    size_bytes: blob.size,
    updated_at: new Date().toISOString(),
    device_name: deviceName(),
  };
  const { error: rowErr } = await supabase()
    .from('backups')
    .upsert(row, { onConflict: 'user_id,notebook_id' });
  if (rowErr) throw rowErr;
}

export async function listCloudBackups(): Promise<CloudBackupRow[]> {
  const { data, error } = await supabase()
    .from('backups')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CloudBackupRow[];
}

export async function restoreBackup(row: CloudBackupRow): Promise<Notebook> {
  const user = await currentUser();
  if (!user) throw new Error('Sign in to restore.');
  const { data, error } = await supabase()
    .storage.from('backups')
    .download(backupPath(user.id, row.notebook_id));
  if (error || !data) throw error ?? new Error('Download failed');
  return importBundle(data);
}

export async function deleteBackup(row: CloudBackupRow): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error('Sign in first.');
  const { error: objErr } = await supabase()
    .storage.from('backups')
    .remove([backupPath(user.id, row.notebook_id)]);
  if (objErr) throw objErr;
  const { error } = await supabase().from('backups').delete().eq('notebook_id', row.notebook_id);
  if (error) throw error;
}

/** Silent auto-backup on notebook close; failures land in the retry queue. */
export async function autoBackupOnClose(nb: Notebook, enabled: boolean): Promise<void> {
  if (!enabled || !cloudConfigured()) return;
  const user = await currentUser();
  if (!user) return;
  try {
    await backupNotebook(nb);
  } catch {
    await queueBackup(nb.id);
  }
}
