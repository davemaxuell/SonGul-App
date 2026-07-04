import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  share: vi.fn(),
  native: { value: true },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.native.value },
}));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: { writeFile: mocks.writeFile },
}));
vi.mock('@capacitor/share', () => ({
  Share: { share: mocks.share },
}));

import { saveBlob } from '../saveFile';

describe('saveBlob (native path)', () => {
  beforeEach(() => {
    mocks.writeFile.mockReset();
    mocks.share.mockReset();
    mocks.native.value = true;
    mocks.writeFile.mockResolvedValue({ uri: 'file:///cache/x.songul' });
    mocks.share.mockResolvedValue({});
  });

  it('writes the blob as base64 into the cache dir and shares the uri', async () => {
    await saveBlob(new Blob(['hello']), 'x.songul');
    expect(mocks.writeFile).toHaveBeenCalledWith({
      path: 'x.songul',
      data: btoa('hello'),
      directory: 'CACHE',
    });
    expect(mocks.share).toHaveBeenCalledWith({
      title: 'x.songul',
      files: ['file:///cache/x.songul'],
    });
  });

  it('treats a dismissed share sheet as success', async () => {
    mocks.share.mockRejectedValue(new Error('Share canceled'));
    await expect(saveBlob(new Blob(['a']), 'a.pdf')).resolves.toBeUndefined();
  });

  it('propagates real share failures', async () => {
    mocks.share.mockRejectedValue(new Error('No activity found'));
    await expect(saveBlob(new Blob(['a']), 'a.pdf')).rejects.toThrow('No activity found');
  });
});
