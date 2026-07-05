export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const DEVICE_KEY = 'songul-device-id';

let memoryDeviceId: string | null = null;

export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // node tests / storage-restricted WebViews: stable for the session
    if (!memoryDeviceId) memoryDeviceId = uid();
    return memoryDeviceId;
  }
}
