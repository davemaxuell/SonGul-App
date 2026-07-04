import { describe, expect, it } from 'vitest';
import { backupPath, deviceName } from '../backup';

describe('backup helpers', () => {
  it('builds the storage object path', () => {
    expect(backupPath('u1', 'nb1')).toBe('u1/nb1.songul');
  });
  it('names the device from the user agent', () => {
    expect(typeof deviceName()).toBe('string');
    expect(deviceName().length).toBeGreaterThan(0);
  });
});
