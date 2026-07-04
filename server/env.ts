// Tiny .env loader (KEY=VALUE lines, # comments) so the gateway stays
// dependency-free. Real process.env always wins over the file.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadEnv(): void {
  const path = join(import.meta.dirname, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    if (!(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
