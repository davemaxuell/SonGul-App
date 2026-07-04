// Single export sink for generated files (PNG / PDF / .songul).
// Browser: plain anchor download. Android APK: blob anchors are inert in the
// WebView, so write to the app cache and hand the file to the share sheet.
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { blobToB64 } from './bundle';

export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: await blobToB64(blob),
      directory: Directory.Cache,
    });
    try {
      await Share.share({ title: filename, files: [uri] });
    } catch (err) {
      // Dismissing the share sheet is a user choice, not a failure.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/cancel/i.test(msg)) throw err;
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
