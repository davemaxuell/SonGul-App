# SonGul v0.3 Phase 1 — Live Handwriting Recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On-device ML Kit handwriting recognition on Android — live per-line recognition feeding handwritten search, Analyze pre-fill, and a quality bench page.

**Architecture:** A local Capacitor plugin bridges stroke data to ML Kit Digital Ink (native, async). On the web side a `LineClusterer` groups committed strokes into line clusters; a `RecognitionScheduler` recognizes quiet clusters write-behind and persists `RecognitionRecord`s to IndexedDB, which power library-wide handwritten search and Analyze pre-fill. Browser PWA degrades to the existing manual-entry flow.

**Tech Stack:** Vite + React + TS (existing), Capacitor 8, ML Kit `digital-ink-recognition:18.1.0` (Java plugin), idb, vitest + fake-indexeddb (new dev deps).

## Global Constraints

- `npm run build` (`tsc && vite build`) must pass after every task.
- Recognition must never block the pen path: all recognition is async + write-behind.
- Plugin language: **Java** (deviation from spec §2 "Kotlin" — the Android project is Java-only and has no Kotlin Gradle plugin; Java avoids toolchain changes).
- ML Kit language tag: `"ko"`. Dependency: `com.google.mlkit:digital-ink-recognition:18.1.0`.
- Android builds: PowerShell, `$env:JAVA_HOME = "C:\Users\user\.jdks\temurin21"`, run `.\gradlew.bat assembleDebug` from `android/`. Run `npx cap sync android` after web changes that native must see.
- Tests: `npx vitest run` (script `npm test`). DB tests import `fake-indexeddb/auto` first.
- Commit after every task. Windows CRLF warnings from git are noise — ignore.

---

### Task 1: LineClusterer (+ vitest setup)

**Files:**
- Modify: `package.json` (devDeps + test script)
- Create: `src/recognition/cluster.ts`
- Test: `src/recognition/__tests__/cluster.test.ts`

**Interfaces:**
- Consumes: `strokeBBox`, `bboxUnion` from `src/ink/geometry.ts`; `Stroke`, `BBox` from `src/types.ts`.
- Produces: `LineCluster { id, pageId, strokeIds, bbox, lastChangedAt, dirty }`; `class LineClusterer(pageId: string, initial?: Stroke[])` with `addStroke(stroke, now?)`, `removeStrokes(ids, remaining, now?)`, `markDirty(strokeIds, now?)`, `quietDirty(quietMs, now?)`, `markClean(clusterId)`, `all()`, `clusterOf(strokeId)`.

- [ ] **Step 1: Install test infra**

```powershell
npm install -D vitest fake-indexeddb
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: Write the failing test**

`src/recognition/__tests__/cluster.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Stroke } from '../../types';
import { LineClusterer } from '../cluster';

let n = 0;
function makeStroke(x: number, y: number, w = 40, h = 30, createdAt = 0): Stroke {
  n++;
  return {
    id: `s${n}`,
    pageId: 'p1',
    deviceId: 'd',
    tool: 'pen',
    color: '#000',
    width: 2,
    opacity: 1,
    createdAt,
    deleted: false,
    points: [
      { x, y, p: 0.5, t: 0 },
      { x: x + w, y: y + h, p: 0.5, t: 50 },
    ],
  };
}

describe('LineClusterer', () => {
  it('groups strokes on the same line into one cluster', () => {
    const c = new LineClusterer('p1');
    const a = c.addStroke(makeStroke(50, 100), 1000);
    const b = c.addStroke(makeStroke(100, 105), 1100);
    expect(a.id).toBe(b.id);
    expect(c.all()).toHaveLength(1);
    expect(c.all()[0].strokeIds).toHaveLength(2);
  });

  it('puts a stroke on the next line into a new cluster', () => {
    const c = new LineClusterer('p1');
    c.addStroke(makeStroke(50, 100), 1000);
    c.addStroke(makeStroke(50, 200), 1100);
    expect(c.all()).toHaveLength(2);
  });

  it('removes an emptied cluster and reports it', () => {
    const c = new LineClusterer('p1');
    const s = makeStroke(50, 100);
    const cluster = c.addStroke(s, 1000);
    const removed = c.removeStrokes([s.id], [], 2000);
    expect(removed).toEqual([cluster.id]);
    expect(c.all()).toHaveLength(0);
  });

  it('shrinks a cluster bbox when a stroke is removed', () => {
    const c = new LineClusterer('p1');
    const s1 = makeStroke(50, 100);
    const s2 = makeStroke(400, 105);
    c.addStroke(s1, 1000);
    const cluster = c.addStroke(s2, 1100);
    c.removeStrokes([s2.id], [s1], 2000);
    expect(cluster.bbox.x + cluster.bbox.w).toBeLessThan(300);
    expect(cluster.dirty).toBe(true);
  });

  it('quietDirty honors the quiet window', () => {
    const c = new LineClusterer('p1');
    const cluster = c.addStroke(makeStroke(50, 100), 1000);
    expect(c.quietDirty(1500, 2000)).toHaveLength(0);
    expect(c.quietDirty(1500, 2600)).toHaveLength(1);
    c.markClean(cluster.id);
    expect(c.quietDirty(1500, 9999)).toHaveLength(0);
  });

  it('rebuilds clusters from initial strokes, skipping deleted', () => {
    const line1a = makeStroke(50, 100, 40, 30, 1);
    const line1b = makeStroke(100, 102, 40, 30, 2);
    const line2 = makeStroke(50, 300, 40, 30, 3);
    const gone = { ...makeStroke(50, 500), deleted: true };
    const c = new LineClusterer('p1', [line2, line1a, gone, line1b]);
    expect(c.all()).toHaveLength(2);
    expect(c.clusterOf(line1a.id)?.id).toBe(c.clusterOf(line1b.id)?.id);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/recognition/__tests__/cluster.test.ts`
Expected: FAIL — cannot resolve `../cluster`.

- [ ] **Step 4: Write the implementation**

`src/recognition/cluster.ts`:

```ts
// Line clustering for live handwriting recognition. Groups a page's strokes
// into "line clusters" by vertical overlap; clusters are derived data —
// always rebuildable from the stroke list, never a source of truth.
import type { BBox, Stroke } from '../types';
import { strokeBBox, bboxUnion } from '../ink/geometry';

export interface LineCluster {
  id: string;
  pageId: string;
  strokeIds: string[];
  bbox: BBox;
  lastChangedAt: number;
  dirty: boolean;
}

const MIN_OVERLAP = 0.4;

/** vertical overlap as a fraction of the shorter box's height */
export function verticalOverlapRatio(a: BBox, b: BBox): number {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (bottom <= top) return 0;
  return (bottom - top) / Math.max(1, Math.min(a.h, b.h));
}

export class LineClusterer {
  private clusters = new Map<string, LineCluster>();
  private byStroke = new Map<string, string>();
  private seq = 0;

  constructor(
    readonly pageId: string,
    initial: Stroke[] = []
  ) {
    const live = initial.filter((s) => !s.deleted).sort((a, b) => a.createdAt - b.createdAt);
    for (const s of live) this.addStroke(s, s.createdAt);
  }

  all(): LineCluster[] {
    return [...this.clusters.values()];
  }

  clusterOf(strokeId: string): LineCluster | undefined {
    const id = this.byStroke.get(strokeId);
    return id ? this.clusters.get(id) : undefined;
  }

  /** assign a committed stroke to the best-overlapping cluster (or a new one) */
  addStroke(stroke: Stroke, now = Date.now()): LineCluster {
    const bb = strokeBBox(stroke);
    let best: LineCluster | null = null;
    let bestOverlap = 0;
    for (const c of this.clusters.values()) {
      const ov = verticalOverlapRatio(bb, c.bbox);
      if (ov >= MIN_OVERLAP && ov > bestOverlap) {
        best = c;
        bestOverlap = ov;
      }
    }
    if (best) {
      best.strokeIds.push(stroke.id);
      best.bbox = bboxUnion(best.bbox, bb);
      best.lastChangedAt = now;
      best.dirty = true;
      this.byStroke.set(stroke.id, best.id);
      return best;
    }
    const cluster: LineCluster = {
      id: `c${this.seq++}-${stroke.id}`,
      pageId: this.pageId,
      strokeIds: [stroke.id],
      bbox: bb,
      lastChangedAt: now,
      dirty: true,
    };
    this.clusters.set(cluster.id, cluster);
    this.byStroke.set(stroke.id, cluster.id);
    return cluster;
  }

  /**
   * Drop erased/undone strokes from their clusters; recompute bboxes from
   * `remaining` (the page's live strokes). Emptied clusters are deleted.
   * Returns the ids of clusters removed entirely (caller prunes their
   * stored recognition results).
   */
  removeStrokes(ids: string[], remaining: Stroke[], now = Date.now()): string[] {
    const byId = new Map(remaining.map((s) => [s.id, s]));
    const touched = new Set<LineCluster>();
    const removed: string[] = [];
    for (const id of ids) {
      const c = this.clusterOf(id);
      if (!c) continue;
      c.strokeIds = c.strokeIds.filter((sid) => sid !== id);
      this.byStroke.delete(id);
      touched.add(c);
    }
    for (const c of touched) {
      if (c.strokeIds.length === 0) {
        this.clusters.delete(c.id);
        removed.push(c.id);
        continue;
      }
      let bb: BBox | null = null;
      for (const sid of c.strokeIds) {
        const s = byId.get(sid);
        if (!s) continue;
        bb = bb ? bboxUnion(bb, strokeBBox(s)) : strokeBBox(s);
      }
      if (bb) c.bbox = bb;
      c.lastChangedAt = now;
      c.dirty = true;
    }
    return removed;
  }

  markDirty(strokeIds: string[], now = Date.now()): void {
    for (const id of strokeIds) {
      const c = this.clusterOf(id);
      if (c) {
        c.dirty = true;
        c.lastChangedAt = now;
      }
    }
  }

  /** dirty clusters that have been untouched for at least quietMs */
  quietDirty(quietMs: number, now = Date.now()): LineCluster[] {
    return this.all().filter((c) => c.dirty && now - c.lastChangedAt >= quietMs);
  }

  markClean(clusterId: string): void {
    const c = this.clusters.get(clusterId);
    if (c) c.dirty = false;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/recognition/__tests__/cluster.test.ts`
Expected: 6 passed.

- [ ] **Step 6: Verify build, commit**

Run: `npm run build` → passes.

```powershell
git add package.json package-lock.json src/recognition
git commit -m "feat(recognition): line clusterer + vitest test infra"
```

---

### Task 2: Jamo-normalized search matching

**Files:**
- Create: `src/recognition/jamo.ts`
- Test: `src/recognition/__tests__/jamo.test.ts`

**Interfaces:**
- Produces: `toJamo(text: string): string`, `jamoIncludes(haystack: string, query: string): boolean`.

- [ ] **Step 1: Write the failing test**

`src/recognition/__tests__/jamo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { jamoIncludes, toJamo } from '../jamo';

describe('toJamo', () => {
  it('decomposes syllables', () => {
    expect(toJamo('한')).toBe('ㅎㅏㄴ');
    expect(toJamo('가')).toBe('ㄱㅏ');
  });
  it('passes through non-Hangul, lowercased', () => {
    expect(toJamo('Abc 한')).toBe('abc ㅎㅏㄴ');
  });
});

describe('jamoIncludes', () => {
  it('matches partial syllables', () => {
    expect(jamoIncludes('한국어 공부', '하')).toBe(true);
    expect(jamoIncludes('한국어 공부', '한국')).toBe(true);
  });
  it('rejects non-matches and empty queries', () => {
    expect(jamoIncludes('한국어', '헌')).toBe(false);
    expect(jamoIncludes('한국어', '  ')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/recognition/__tests__/jamo.test.ts`
Expected: FAIL — cannot resolve `../jamo`.

- [ ] **Step 3: Write the implementation**

`src/recognition/jamo.ts`:

```ts
// Hangul-aware search normalization: decompose syllables into jamo so a
// partial query like "하" matches "한국" (ㅎㅏ ⊂ ㅎㅏㄴㄱㅜㄱ).
const CHO = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const JUNG = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const JONG = [
  '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ',
  'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

export function toJamo(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = code - 0xac00;
      out += CHO[Math.floor(idx / 588)] + JUNG[Math.floor((idx % 588) / 28)] + JONG[idx % 28];
    } else {
      out += ch.toLowerCase();
    }
  }
  return out;
}

export function jamoIncludes(haystack: string, query: string): boolean {
  const q = toJamo(query.trim());
  if (!q) return false;
  return toJamo(haystack).includes(q);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/recognition/__tests__/jamo.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```powershell
git add src/recognition
git commit -m "feat(recognition): jamo-normalized search matching"
```

---

### Task 3: Character-error-rate utility (bench scoring)

**Files:**
- Create: `src/recognition/cer.ts`
- Test: `src/recognition/__tests__/cer.test.ts`

**Interfaces:**
- Produces: `editDistance(a: string, b: string): number`, `cer(expected: string, actual: string): number` (0 = perfect, capped at 1; whitespace-normalized).

- [ ] **Step 1: Write the failing test**

`src/recognition/__tests__/cer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cer, editDistance } from '../cer';

describe('editDistance', () => {
  it('computes Levenshtein distance', () => {
    expect(editDistance('한국어', '한국어')).toBe(0);
    expect(editDistance('한국어', '한글어')).toBe(1);
    expect(editDistance('', '가나')).toBe(2);
  });
});

describe('cer', () => {
  it('is 0 for a perfect match and 1 cap for garbage', () => {
    expect(cer('안녕하세요', '안녕하세요')).toBe(0);
    expect(cer('가', '완전다른긴문장')).toBe(1);
  });
  it('normalizes whitespace', () => {
    expect(cer('한국어  공부', '한국어 공부')).toBe(0);
  });
  it('scores partial errors', () => {
    expect(cer('안녕하세요', '안녕하세오')).toBeCloseTo(0.2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/recognition/__tests__/cer.test.ts`
Expected: FAIL — cannot resolve `../cer`.

- [ ] **Step 3: Write the implementation**

`src/recognition/cer.ts`:

```ts
/** Levenshtein distance over Unicode code points. */
export function editDistance(a: string, b: string): number {
  const s = [...a];
  const t = [...b];
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[t.length];
}

/** Character error rate: 0 = perfect. Whitespace-normalized, capped at 1. */
export function cer(expected: string, actual: string): number {
  const e = expected.replace(/\s+/g, ' ').trim();
  const a = actual.replace(/\s+/g, ' ').trim();
  if (e.length === 0) return a.length === 0 ? 0 : 1;
  return Math.min(1, editDistance(e, a) / [...e].length);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/recognition/__tests__/cer.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```powershell
git add src/recognition
git commit -m "feat(recognition): character error rate utility for the bench"
```

---

### Task 4: IndexedDB v2 — recognition_results store

**Files:**
- Modify: `src/types.ts` (append `RecognitionRecord`)
- Modify: `src/db.ts` (schema v2, CRUD, cascades)
- Test: `src/recognition/__tests__/dbRecognition.test.ts`

**Interfaces:**
- Produces: type `RecognitionRecord { key, notebookId, pageId, clusterId, text, confidence, strokeIds, bbox, provider, timestamp, status: 'ok'|'failed' }` with `key = \`${pageId}:${clusterId}\``; db functions `putRecognition(rec)`, `listRecognitionByPage(pageId)`, `listAllRecognition()`, `deleteRecognition(key)`, `deleteRecognitionForPage(pageId)`. `deletePageCascade`/`deleteNotebookCascade` also purge recognition rows.

- [ ] **Step 1: Write the failing test**

`src/recognition/__tests__/dbRecognition.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as db from '../../db';
import type { RecognitionRecord } from '../../types';

function rec(pageId: string, clusterId: string, text: string): RecognitionRecord {
  return {
    key: `${pageId}:${clusterId}`,
    notebookId: 'nb1',
    pageId,
    clusterId,
    text,
    confidence: 0.9,
    strokeIds: ['s1'],
    bbox: { x: 0, y: 0, w: 10, h: 10 },
    provider: 'test',
    timestamp: 1,
    status: 'ok',
  };
}

describe('recognition_results store', () => {
  it('puts, lists by page, lists all, deletes', async () => {
    await db.putRecognition(rec('pA', 'c1', '안녕'));
    await db.putRecognition(rec('pA', 'c2', '하세요'));
    await db.putRecognition(rec('pB', 'c1', '한국'));
    expect((await db.listRecognitionByPage('pA')).map((r) => r.text).sort()).toEqual([
      '안녕',
      '하세요',
    ]);
    expect(await db.listAllRecognition()).toHaveLength(3);
    await db.deleteRecognition('pA:c1');
    expect(await db.listRecognitionByPage('pA')).toHaveLength(1);
    await db.deleteRecognitionForPage('pA');
    expect(await db.listRecognitionByPage('pA')).toHaveLength(0);
  });

  it('cascades with page deletion', async () => {
    const page = await db.createPage('nb2', 'lined', 0);
    await db.putRecognition(rec(page.id, 'c9', '지워질 글'));
    await db.deletePageCascade(page.id);
    expect(await db.listRecognitionByPage(page.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/recognition/__tests__/dbRecognition.test.ts`
Expected: FAIL — `putRecognition` is not exported.

- [ ] **Step 3: Implement**

Append to `src/types.ts`:

```ts
export interface RecognitionRecord {
  /** `${pageId}:${clusterId}` */
  key: string;
  notebookId: string;
  pageId: string;
  clusterId: string;
  text: string;
  confidence: number;
  strokeIds: string[];
  bbox: BBox;
  provider: string;
  timestamp: number;
  status: 'ok' | 'failed';
}
```

In `src/db.ts`:

1. Add `RecognitionRecord` to the type import from `./types`.
2. Extend the schema interface:

```ts
interface SongulDB extends DBSchema {
  // ...existing stores unchanged...
  recognition_results: {
    key: string;
    value: RecognitionRecord;
    indexes: { 'by-page': string };
  };
}
```

3. Bump the version and guard the upgrade (existing creates only run for fresh DBs):

```ts
dbPromise = openDB<SongulDB>('songul-note', 2, {
  upgrade(d, oldVersion) {
    if (oldVersion < 1) {
      d.createObjectStore('notebooks', { keyPath: 'id' });
      const pages = d.createObjectStore('pages', { keyPath: 'id' });
      pages.createIndex('by-notebook', 'notebookId');
      const strokes = d.createObjectStore('strokes', { keyPath: 'id' });
      strokes.createIndex('by-page', 'pageId');
      d.createObjectStore('attachments', { keyPath: 'id' });
      d.createObjectStore('pageImages', { keyPath: 'pageId' });
      const fb = d.createObjectStore('feedback', { keyPath: 'id' });
      fb.createIndex('by-notebook', 'notebookId');
      d.createObjectStore('settings', { keyPath: 'key' });
    }
    if (oldVersion < 2) {
      const rec = d.createObjectStore('recognition_results', { keyPath: 'key' });
      rec.createIndex('by-page', 'pageId');
    }
  },
});
```

4. Add a `// ---- recognition ----` section:

```ts
export async function putRecognition(rec: RecognitionRecord): Promise<void> {
  await (await db()).put('recognition_results', rec);
}

export async function listRecognitionByPage(pageId: string): Promise<RecognitionRecord[]> {
  return (await db()).getAllFromIndex('recognition_results', 'by-page', pageId);
}

export async function listAllRecognition(): Promise<RecognitionRecord[]> {
  return (await db()).getAll('recognition_results');
}

export async function deleteRecognition(key: string): Promise<void> {
  await (await db()).delete('recognition_results', key);
}

export async function deleteRecognitionForPage(pageId: string): Promise<void> {
  const d = await db();
  const rows = await d.getAllFromIndex('recognition_results', 'by-page', pageId);
  const tx = d.transaction('recognition_results', 'readwrite');
  for (const r of rows) tx.store.delete(r.key);
  await tx.done;
}
```

5. Cascades: in `deletePageCascade`, after deleting strokes add `await deleteRecognitionForPage(pageId);`. In `deleteNotebookCascade`'s page loop, add `await deleteRecognitionForPage(p.id);`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run` (all suites)
Expected: all pass.

- [ ] **Step 5: Verify build, commit**

Run: `npm run build` → passes.

```powershell
git add src/types.ts src/db.ts src/recognition
git commit -m "feat(db): recognition_results store (schema v2) with cascade deletes"
```

---

### Task 5: Native Capacitor plugin `SongulInk` (ML Kit Digital Ink)

**Files:**
- Create: `android/app/src/main/java/com/songul/note/SongulInkPlugin.java`
- Modify: `android/app/src/main/java/com/songul/note/MainActivity.java`
- Modify: `android/app/build.gradle` (ML Kit dependency)

**Interfaces:**
- Produces (JS-visible plugin methods, names are load-bearing for Task 6):
  - `recognize({strokes: [{points: [{x, y, t}]}], language}) → {candidates: [{text, score}]}` (candidates best-first; `score` may be null)
  - `ensureModel({language}) → {status: "downloaded" | "failed", message?}`

- [ ] **Step 1: Add ML Kit dependency**

In `android/app/build.gradle` `dependencies { ... }`, after the `capacitor-cordova-android-plugins` line, add:

```groovy
    implementation "com.google.mlkit:digital-ink-recognition:18.1.0"
```

- [ ] **Step 2: Write the plugin**

`android/app/src/main/java/com/songul/note/SongulInkPlugin.java`:

```java
package com.songul.note;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.common.MlKitException;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.DigitalInkRecognition;
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModel;
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModelIdentifier;
import com.google.mlkit.vision.digitalink.DigitalInkRecognizer;
import com.google.mlkit.vision.digitalink.DigitalInkRecognizerOptions;
import com.google.mlkit.vision.digitalink.Ink;
import com.google.mlkit.vision.digitalink.RecognitionCandidate;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Bridges SonGul stroke data to ML Kit Digital Ink Recognition.
 * All heavy work runs on ML Kit's own background executor; plugin calls
 * resolve asynchronously so the WebView never blocks.
 */
@CapacitorPlugin(name = "SongulInk")
public class SongulInkPlugin extends Plugin {

    private DigitalInkRecognizer recognizer;
    private String recognizerLang;

    private DigitalInkRecognitionModel modelFor(String language) {
        try {
            DigitalInkRecognitionModelIdentifier id =
                DigitalInkRecognitionModelIdentifier.fromLanguageTag(language);
            if (id == null) return null;
            return DigitalInkRecognitionModel.builder(id).build();
        } catch (MlKitException e) {
            return null;
        }
    }

    @PluginMethod
    public void ensureModel(PluginCall call) {
        String language = call.getString("language", "ko");
        DigitalInkRecognitionModel model = modelFor(language);
        if (model == null) {
            call.reject("unsupported language: " + language);
            return;
        }
        RemoteModelManager manager = RemoteModelManager.getInstance();
        manager.isModelDownloaded(model)
            .addOnSuccessListener(downloaded -> {
                if (Boolean.TRUE.equals(downloaded)) {
                    JSObject ret = new JSObject();
                    ret.put("status", "downloaded");
                    call.resolve(ret);
                } else {
                    manager.download(model, new DownloadConditions.Builder().build())
                        .addOnSuccessListener(v -> {
                            JSObject ret = new JSObject();
                            ret.put("status", "downloaded");
                            call.resolve(ret);
                        })
                        .addOnFailureListener(e -> {
                            JSObject ret = new JSObject();
                            ret.put("status", "failed");
                            ret.put("message", String.valueOf(e.getMessage()));
                            call.resolve(ret);
                        });
                }
            })
            .addOnFailureListener(e -> call.reject("model check failed: " + e.getMessage()));
    }

    @PluginMethod
    public void recognize(PluginCall call) {
        String language = call.getString("language", "ko");
        JSArray strokesIn = call.getArray("strokes");
        if (strokesIn == null || strokesIn.length() == 0) {
            call.reject("strokes required");
            return;
        }
        Ink ink;
        try {
            Ink.Builder inkBuilder = Ink.builder();
            for (int i = 0; i < strokesIn.length(); i++) {
                JSONObject strokeObj = strokesIn.getJSONObject(i);
                JSONArray points = strokeObj.getJSONArray("points");
                Ink.Stroke.Builder sb = Ink.Stroke.builder();
                for (int j = 0; j < points.length(); j++) {
                    JSONObject pt = points.getJSONObject(j);
                    sb.addPoint(Ink.Point.create(
                        (float) pt.getDouble("x"),
                        (float) pt.getDouble("y"),
                        pt.optLong("t", 0)));
                }
                inkBuilder.addStroke(sb.build());
            }
            ink = inkBuilder.build();
        } catch (JSONException e) {
            call.reject("bad strokes payload: " + e.getMessage());
            return;
        }
        DigitalInkRecognizer rec = recognizerFor(language);
        if (rec == null) {
            call.reject("unsupported language: " + language);
            return;
        }
        rec.recognize(ink)
            .addOnSuccessListener(result -> {
                JSArray candidates = new JSArray();
                for (RecognitionCandidate c : result.getCandidates()) {
                    JSObject item = new JSObject();
                    item.put("text", c.getText());
                    if (c.getScore() != null) item.put("score", c.getScore());
                    candidates.put(item);
                }
                JSObject ret = new JSObject();
                ret.put("candidates", candidates);
                call.resolve(ret);
            })
            .addOnFailureListener(e -> call.reject("recognition failed: " + e.getMessage()));
    }

    private synchronized DigitalInkRecognizer recognizerFor(String language) {
        if (recognizer == null || !language.equals(recognizerLang)) {
            DigitalInkRecognitionModel model = modelFor(language);
            if (model == null) return null;
            if (recognizer != null) recognizer.close();
            recognizer = DigitalInkRecognition.getClient(
                DigitalInkRecognizerOptions.builder(model).build());
            recognizerLang = language;
        }
        return recognizer;
    }
}
```

- [ ] **Step 3: Register the plugin**

Replace `android/app/src/main/java/com/songul/note/MainActivity.java` with:

```java
package com.songul.note;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SongulInkPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

- [ ] **Step 4: Verify it compiles**

```powershell
$env:JAVA_HOME = "C:\Users\user\.jdks\temurin21"
Set-Location android; .\gradlew.bat assembleDebug; Set-Location ..
```

Expected: `BUILD SUCCESSFUL`. (First run downloads the ML Kit artifacts.)

- [ ] **Step 5: Commit**

```powershell
git add android/app/src/main/java/com/songul/note android/app/build.gradle
git commit -m "feat(android): SongulInk Capacitor plugin bridging ML Kit Digital Ink"
```

---

### Task 6: JS bridge, mlkit provider, FeedbackPanel real-strokes fix

**Files:**
- Create: `src/recognition/songulInk.ts`
- Modify: `src/feedback/recognition.ts`
- Modify: `src/components/FeedbackPanel.tsx:39,52-65`

**Interfaces:**
- Consumes: plugin methods from Task 5.
- Produces: `SongulInk` (typed plugin proxy), `inkRecognitionAvailable(): boolean`, `mlkitProvider: RecognitionProvider` (id `'mlkit-android'`), `defaultProviderId(): string`; `providers` now lists mlkit first on Android.

- [ ] **Step 1: Create the bridge**

`src/recognition/songulInk.ts`:

```ts
// Typed proxy for the native SongulInk Capacitor plugin (Android only).
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface InkStrokePayload {
  points: { x: number; y: number; t: number }[];
}

export interface SongulInkNative {
  recognize(opts: { strokes: InkStrokePayload[]; language: string }): Promise<{
    candidates: { text: string; score?: number }[];
  }>;
  ensureModel(opts: { language: string }): Promise<{
    status: 'downloaded' | 'failed';
    message?: string;
  }>;
}

export const SongulInk = registerPlugin<SongulInkNative>('SongulInk');

export function inkRecognitionAvailable(): boolean {
  return Capacitor.getPlatform() === 'android';
}
```

- [ ] **Step 2: Add the provider**

In `src/feedback/recognition.ts`, after `mockProvider`, add — and replace the `providers` export:

```ts
import { SongulInk, inkRecognitionAvailable } from '../recognition/songulInk';

/** ML Kit "score" semantics vary by model; map to a rough 0..1 confidence. */
function normalizeScore(score: number | undefined): number {
  if (score == null) return 0.9;
  if (score >= 0 && score <= 1) return score;
  return 1 / (1 + Math.abs(score));
}

export const mlkitProvider: RecognitionProvider = {
  id: 'mlkit-android',
  label: 'On-device handwriting (ML Kit)',
  async recognize({ strokes, language }) {
    const live = strokes.filter((s) => !s.deleted && s.points.length > 0);
    if (live.length === 0) return { text: '', confidence: 0, provider: 'mlkit-android' };
    const res = await SongulInk.recognize({
      strokes: live.map((s) => ({
        points: s.points.map((p) => ({ x: p.x, y: p.y, t: p.t })),
      })),
      language,
    });
    const best = res.candidates[0];
    if (!best) return { text: '', confidence: 0, provider: 'mlkit-android' };
    return { text: best.text, confidence: normalizeScore(best.score), provider: 'mlkit-android' };
  },
};

export const providers: RecognitionProvider[] = inkRecognitionAvailable()
  ? [mlkitProvider, mockProvider]
  : [mockProvider];

export function defaultProviderId(): string {
  return providers[0].id;
}
```

(The `import` line goes at the top of the file with the existing imports.)

- [ ] **Step 3: Fix FeedbackPanel to send real strokes**

In `src/components/FeedbackPanel.tsx`:
- Import `defaultProviderId` from `'../feedback/recognition'` (extend the existing import).
- Line 39: `const [providerId, setProviderId] = useState('mock');` → `const [providerId, setProviderId] = useState(defaultProviderId());`
- In the `p.request` effect, replace `.recognize({ strokes: [], language: 'ko' })` with `.recognize({ strokes: p.request?.strokes ?? [], language: 'ko' })`.

- [ ] **Step 4: Verify**

Run: `npx vitest run` → all pass. Run: `npm run build` → passes.
Browser behavior check (dev server): panel still defaults to Mock provider, manual entry unchanged.

- [ ] **Step 5: Commit**

```powershell
git add src/recognition/songulInk.ts src/feedback/recognition.ts src/components/FeedbackPanel.tsx
git commit -m "feat(recognition): mlkit-android provider + real selection strokes to recognizers"
```

---

### Task 7: RecognitionScheduler (write-behind live recognition)

**Files:**
- Create: `src/recognition/scheduler.ts`
- Test: `src/recognition/__tests__/scheduler.test.ts`

**Interfaces:**
- Consumes: `LineClusterer` (Task 1), db recognition functions (Task 4), `RecognitionProvider` (existing).
- Produces: `class RecognitionScheduler(opts: { notebookId, provider, language?, quietMs?, tickMs?, now? })` with `loadPage(pageId, strokes)`, `noteStroke(pageId, stroke)`, `noteRemoved(pageId, strokeIds)`, `noteChanged(pageId, strokeIds)`, `tick(): Promise<void>` (public for tests), `dispose()`.

- [ ] **Step 1: Write the failing test**

`src/recognition/__tests__/scheduler.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Stroke } from '../../types';
import type { RecognitionProvider } from '../../feedback/recognition';
import * as db from '../../db';
import { RecognitionScheduler } from '../scheduler';

let n = 100;
function makeStroke(pageId: string, y: number): Stroke {
  n++;
  return {
    id: `t${n}`,
    pageId,
    deviceId: 'd',
    tool: 'pen',
    color: '#000',
    width: 2,
    opacity: 1,
    createdAt: 0,
    deleted: false,
    points: [
      { x: 10, y, p: 0.5, t: 0 },
      { x: 60, y: y + 20, p: 0.5, t: 40 },
    ],
  };
}

function makeProvider(impl: () => Promise<string>): RecognitionProvider {
  return {
    id: 'fake',
    label: 'fake',
    recognize: async () => ({ text: await impl(), confidence: 1, provider: 'fake' }),
  };
}

function makeScheduler(provider: RecognitionProvider, clock: { t: number }) {
  return new RecognitionScheduler({
    notebookId: 'nb-s',
    provider,
    quietMs: 1500,
    tickMs: 60_000, // effectively disabled; tests call tick() directly
    now: () => clock.t,
  });
}

describe('RecognitionScheduler', () => {
  it('recognizes a quiet dirty cluster and persists the result', async () => {
    const clock = { t: 1000 };
    const s = makeScheduler(makeProvider(async () => '안녕'), clock);
    const stroke = makeStroke('pg1', 50);
    s.loadPage('pg1', [stroke]);
    s.noteStroke('pg1', stroke);
    await s.tick();
    expect(await db.listRecognitionByPage('pg1')).toHaveLength(0); // not quiet yet
    clock.t = 3000;
    await s.tick();
    const rows = await db.listRecognitionByPage('pg1');
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('안녕');
    expect(rows[0].status).toBe('ok');
    clock.t = 9000;
    await s.tick(); // clean cluster: nothing new recognized
    expect(await db.listRecognitionByPage('pg1')).toHaveLength(1);
    s.dispose();
  });

  it('retries once, then parks the cluster as failed', async () => {
    const clock = { t: 1000 };
    let calls = 0;
    const s = makeScheduler(
      makeProvider(async () => {
        calls++;
        throw new Error('boom');
      }),
      clock
    );
    const stroke = makeStroke('pg2', 50);
    s.loadPage('pg2', [stroke]);
    s.noteStroke('pg2', stroke);
    clock.t = 3000;
    await s.tick();
    await s.tick();
    await s.tick();
    expect(calls).toBe(2);
    const rows = await db.listRecognitionByPage('pg2');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('failed');
    s.dispose();
  });

  it('deletes stored results when a cluster empties', async () => {
    const clock = { t: 1000 };
    const s = makeScheduler(makeProvider(async () => '가'), clock);
    const stroke = makeStroke('pg3', 50);
    s.loadPage('pg3', [stroke]);
    s.noteStroke('pg3', stroke);
    clock.t = 3000;
    await s.tick();
    expect(await db.listRecognitionByPage('pg3')).toHaveLength(1);
    s.noteRemoved('pg3', [stroke.id]);
    await new Promise((r) => setTimeout(r, 0)); // let the delete settle
    expect(await db.listRecognitionByPage('pg3')).toHaveLength(0);
    s.dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/recognition/__tests__/scheduler.test.ts`
Expected: FAIL — cannot resolve `../scheduler`.

- [ ] **Step 3: Write the implementation**

`src/recognition/scheduler.ts`:

```ts
// Write-behind recognition: watches line clusters per page and recognizes
// quiet dirty clusters one at a time. Never on the pen's critical path.
import type { Stroke } from '../types';
import type { RecognitionProvider } from '../feedback/recognition';
import { LineClusterer, type LineCluster } from './cluster';
import * as db from '../db';

export interface SchedulerOptions {
  notebookId: string;
  provider: RecognitionProvider;
  language?: string;
  /** cluster must be untouched this long before recognition (default 1500ms) */
  quietMs?: number;
  /** poll interval (default 1000ms) */
  tickMs?: number;
  /** injectable clock for tests */
  now?: () => number;
}

export class RecognitionScheduler {
  private clusterers = new Map<string, LineClusterer>();
  private strokesByPage = new Map<string, Stroke[]>();
  private retried = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null;
  private busy = false;
  private readonly quietMs: number;
  private readonly now: () => number;

  constructor(private readonly opts: SchedulerOptions) {
    this.quietMs = opts.quietMs ?? 1500;
    this.now = opts.now ?? Date.now;
    this.timer = setInterval(() => void this.tick(), opts.tickMs ?? 1000);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** (re)load a page: rebuild clusters from its live strokes.
      Keeps a reference to the array — the editor mutates it in place. */
  loadPage(pageId: string, strokes: Stroke[]): void {
    this.strokesByPage.set(pageId, strokes);
    this.clusterers.set(pageId, new LineClusterer(pageId, strokes));
  }

  noteStroke(pageId: string, stroke: Stroke): void {
    this.clusterers.get(pageId)?.addStroke(stroke, this.now());
  }

  noteRemoved(pageId: string, strokeIds: string[]): void {
    const clusterer = this.clusterers.get(pageId);
    if (!clusterer) return;
    const live = (this.strokesByPage.get(pageId) ?? []).filter((s) => !s.deleted);
    const removed = clusterer.removeStrokes(strokeIds, live, this.now());
    for (const clusterId of removed) void db.deleteRecognition(`${pageId}:${clusterId}`);
  }

  noteChanged(pageId: string, strokeIds: string[]): void {
    this.clusterers.get(pageId)?.markDirty(strokeIds, this.now());
  }

  /** one unit of background work; public so tests can drive it directly */
  async tick(): Promise<void> {
    if (this.busy) return;
    let target: { pageId: string; cluster: LineCluster } | null = null;
    for (const [pageId, clusterer] of this.clusterers) {
      const quiet = clusterer.quietDirty(this.quietMs, this.now());
      if (quiet.length > 0) {
        target = { pageId, cluster: quiet[0] };
        break;
      }
    }
    if (!target) return;
    this.busy = true;
    const { pageId, cluster } = target;
    const key = `${pageId}:${cluster.id}`;
    const changedAt = cluster.lastChangedAt;
    try {
      const all = this.strokesByPage.get(pageId) ?? [];
      const ids = new Set(cluster.strokeIds);
      const strokes = all.filter((s) => ids.has(s.id) && !s.deleted);
      const result = await this.opts.provider.recognize({
        strokes,
        language: this.opts.language ?? 'ko',
      });
      await db.putRecognition({
        key,
        notebookId: this.opts.notebookId,
        pageId,
        clusterId: cluster.id,
        text: result.text,
        confidence: result.confidence,
        strokeIds: [...cluster.strokeIds],
        bbox: cluster.bbox,
        provider: result.provider,
        timestamp: this.now(),
        status: 'ok',
      });
      // don't mark clean if new strokes landed while we were recognizing
      if (cluster.lastChangedAt === changedAt) {
        this.clusterers.get(pageId)?.markClean(cluster.id);
      }
      this.retried.delete(key);
    } catch {
      if (this.retried.has(key)) {
        await db.putRecognition({
          key,
          notebookId: this.opts.notebookId,
          pageId,
          clusterId: cluster.id,
          text: '',
          confidence: 0,
          strokeIds: [...cluster.strokeIds],
          bbox: cluster.bbox,
          provider: this.opts.provider.id,
          timestamp: this.now(),
          status: 'failed',
        });
        if (cluster.lastChangedAt === changedAt) {
          this.clusterers.get(pageId)?.markClean(cluster.id);
        }
        this.retried.delete(key);
      } else {
        this.retried.add(key); // stays dirty → retried on a later tick
      }
    } finally {
      this.busy = false;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: all suites pass.

- [ ] **Step 5: Verify build, commit**

Run: `npm run build` → passes.

```powershell
git add src/recognition
git commit -m "feat(recognition): write-behind recognition scheduler"
```

---

### Task 8: EditorScreen wiring — live recognition while writing

**Files:**
- Modify: `src/components/EditorScreen.tsx`

**Interfaces:**
- Consumes: `RecognitionScheduler` (Task 7), `mlkitProvider` (Task 6), `inkRecognitionAvailable` (Task 6).
- Produces: no new exports — behavior only. Scheduler exists only on Android.

- [ ] **Step 1: Wire the scheduler**

In `src/components/EditorScreen.tsx`:

1. Add imports:

```ts
import { RecognitionScheduler } from '../recognition/scheduler';
import { mlkitProvider } from '../feedback/recognition';
import { inkRecognitionAvailable } from '../recognition/songulInk';
```

2. Add a ref + lifecycle effect (near the other refs, after `clipboardRef`):

```ts
const schedulerRef = useRef<RecognitionScheduler | null>(null);

useEffect(() => {
  if (!inkRecognitionAvailable()) return;
  const scheduler = new RecognitionScheduler({ notebookId: notebook.id, provider: mlkitProvider });
  schedulerRef.current = scheduler;
  return () => {
    scheduler.dispose();
    schedulerRef.current = null;
  };
}, [notebook.id]);
```

3. In the page-load effect (the one that sets `strokesRef.current = strokes`), after `setRenderVersion((v) => v + 1);` add:

```ts
schedulerRef.current?.loadPage(currentPage.id, strokesRef.current);
```

4. In `onCommitStroke`, after `pushOp(...)`:

```ts
schedulerRef.current?.noteStroke(stroke.pageId, stroke);
```

5. In `onEraseCommit`, after `pushOp(...)`:

```ts
if (currentPageId) schedulerRef.current?.noteRemoved(currentPageId, ids);
```

6. In `onTransformCommit`, after `pushOp(...)`:

```ts
if (currentPageId) schedulerRef.current?.noteChanged(currentPageId, after.map((x) => x.id));
```

7. In `applyOp`, at the end (after `bump();`) — undo/redo can resurrect or remove strokes, so rebuild:

```ts
if (currentPageId) schedulerRef.current?.loadPage(currentPageId, strokesRef.current);
```

8. In `onSelectionAction`'s `delete` branch, after `pushOp(...)`:

```ts
if (currentPageId) schedulerRef.current?.noteRemoved(currentPageId, strokes.map((x) => x.id));
```

9. In `pasteStrokes`, after `pushOp(...)`:

```ts
for (const c of clones) schedulerRef.current?.noteStroke(c.pageId, c);
```

- [ ] **Step 2: Verify**

Run: `npx vitest run` and `npm run build` → both pass.
Browser dev-server smoke: writing/erasing/undo works exactly as before (scheduler never constructed off-Android).

- [ ] **Step 3: Commit**

```powershell
git add src/components/EditorScreen.tsx
git commit -m "feat(editor): feed stroke lifecycle into the recognition scheduler"
```

---

### Task 9: Analyze pre-fill from cluster results

**Files:**
- Create: `src/recognition/prefill.ts`
- Modify: `src/components/FeedbackPanel.tsx` (request effect)
- Test: `src/recognition/__tests__/prefill.test.ts`

**Interfaces:**
- Consumes: `listRecognitionByPage` (Task 4).
- Produces: `prefillFromClusters(pageId: string, selected: Stroke[]): Promise<string | null>` — null means "not covered, fall back to one-shot recognition".

- [ ] **Step 1: Write the failing test**

`src/recognition/__tests__/prefill.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { RecognitionRecord, Stroke } from '../../types';
import * as db from '../../db';
import { prefillFromClusters } from '../prefill';

let n = 500;
function makeStroke(pageId: string): Stroke {
  n++;
  return {
    id: `pf${n}`,
    pageId,
    deviceId: 'd',
    tool: 'pen',
    color: '#000',
    width: 2,
    opacity: 1,
    createdAt: 0,
    deleted: false,
    points: [{ x: 0, y: 0, p: 0.5, t: 0 }],
  };
}

function rec(
  pageId: string,
  clusterId: string,
  text: string,
  strokeIds: string[],
  y: number
): RecognitionRecord {
  return {
    key: `${pageId}:${clusterId}`,
    notebookId: 'nb',
    pageId,
    clusterId,
    text,
    confidence: 0.9,
    strokeIds,
    bbox: { x: 0, y, w: 100, h: 30 },
    provider: 'test',
    timestamp: 1,
    status: 'ok',
  };
}

describe('prefillFromClusters', () => {
  it('assembles covered clusters top-to-bottom', async () => {
    const a = makeStroke('pp1');
    const b = makeStroke('pp1');
    await db.putRecognition(rec('pp1', 'c1', '두 번째 줄', [b.id], 200));
    await db.putRecognition(rec('pp1', 'c2', '첫 줄', [a.id], 100));
    expect(await prefillFromClusters('pp1', [a, b])).toBe('첫 줄 두 번째 줄');
  });

  it('returns null when nothing matches or coverage is poor', async () => {
    const lone = makeStroke('pp2');
    expect(await prefillFromClusters('pp2', [lone])).toBeNull();
    const covered = makeStroke('pp3');
    const uncovered = [makeStroke('pp3'), makeStroke('pp3'), makeStroke('pp3')];
    await db.putRecognition(rec('pp3', 'c1', '가', [covered.id], 10));
    expect(await prefillFromClusters('pp3', [covered, ...uncovered])).toBeNull();
    expect(await prefillFromClusters('pp3', [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/recognition/__tests__/prefill.test.ts`
Expected: FAIL — cannot resolve `../prefill`.

- [ ] **Step 3: Write the implementation**

`src/recognition/prefill.ts`:

```ts
// Assemble recognized text for a lasso selection from stored cluster results.
import type { Stroke } from '../types';
import * as db from '../db';

/**
 * Returns the selection's text from live-recognition results, or null when
 * the selection isn't sufficiently covered (caller falls back to a one-shot
 * provider call).
 */
export async function prefillFromClusters(
  pageId: string,
  selected: Stroke[]
): Promise<string | null> {
  if (selected.length === 0) return null;
  const records = (await db.listRecognitionByPage(pageId)).filter(
    (r) => r.status === 'ok' && r.text.trim().length > 0
  );
  const selectedIds = new Set(selected.map((s) => s.id));
  const hits = records.filter((r) => r.strokeIds.some((id) => selectedIds.has(id)));
  if (hits.length === 0) return null;
  const covered = new Set(hits.flatMap((r) => r.strokeIds));
  const uncovered = [...selectedIds].filter((id) => !covered.has(id));
  if (uncovered.length > selected.length * 0.2) return null;
  hits.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  const text = hits.map((r) => r.text.trim()).join(' ').trim();
  return text.length > 0 ? text : null;
}
```

- [ ] **Step 4: Use it in FeedbackPanel**

In `src/components/FeedbackPanel.tsx`, add `import { prefillFromClusters } from '../recognition/prefill';` and replace the body of the `p.request` effect with:

```ts
useEffect(() => {
  if (!p.request) return;
  setTab('check');
  setFindings(null);
  setText('');
  setRecognizing(true);
  void (async () => {
    try {
      const cached = await prefillFromClusters(p.page.id, p.request?.strokes ?? []);
      if (cached) {
        setText(cached);
        return;
      }
      const r = await getProvider(providerId).recognize({
        strokes: p.request?.strokes ?? [],
        language: 'ko',
      });
      if (r.text) setText(r.text);
    } catch {
      // recognition is best-effort; manual entry remains
    } finally {
      setRecognizing(false);
    }
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [p.request]);
```

- [ ] **Step 5: Verify, commit**

Run: `npx vitest run` and `npm run build` → pass.

```powershell
git add src/recognition/prefill.ts src/recognition/__tests__/prefill.test.ts src/components/FeedbackPanel.tsx
git commit -m "feat(feedback): pre-fill Analyze text from live recognition clusters"
```

---

### Task 10: Handwritten search in the library

**Files:**
- Modify: `src/App.tsx` (jump plumbing)
- Modify: `src/components/LibraryScreen.tsx` (search box + results)
- Modify: `src/components/EditorScreen.tsx` (accept `initialJump`)
- Modify: `src/styles.css` (search styles — append at end)

**Interfaces:**
- Consumes: `listAllRecognition` (Task 4), `jamoIncludes` (Task 2).
- Produces: `LibraryScreen` prop `onOpenAt(nb: Notebook, pageId: string, bbox: BBox | null)`; `EditorScreen` prop `initialJump?: { pageId: string; bbox: BBox | null }`.

- [ ] **Step 1: App plumbing**

In `src/App.tsx`:
- Extend the screen type: `type Screen = { name: 'library' } | { name: 'editor'; notebook: Notebook; jump?: { pageId: string; bbox: BBox | null } };` (import `BBox` from `./types`).
- Pass to LibraryScreen: `onOpenAt={(nb, pageId, bbox) => setScreen({ name: 'editor', notebook: nb, jump: { pageId, bbox } })}`.
- Pass to EditorScreen: `initialJump={screen.jump}`.

- [ ] **Step 2: EditorScreen accepts the jump**

In `src/components/EditorScreen.tsx`:
- Props: add `initialJump?: { pageId: string; bbox: BBox | null };`
- In the initial pages-load effect, replace `if (list.length > 0) setCurrentPageId(list[0].id);` with:

```ts
if (initialJump && list.some((pg) => pg.id === initialJump.pageId)) {
  setCurrentPageId(initialJump.pageId);
  if (initialJump.bbox) setHighlights([initialJump.bbox]);
} else if (list.length > 0) {
  setCurrentPageId(list[0].id);
}
```

- [ ] **Step 3: Library search UI**

In `src/components/LibraryScreen.tsx`:

1. Imports: add `useMemo` to the react import; add `import { jamoIncludes } from '../recognition/jamo';`, `import { inkRecognitionAvailable } from '../recognition/songulInk';` and types `BBox`, `RecognitionRecord` to the types import.
2. Props: add `onOpenAt: (nb: Notebook, pageId: string, bbox: BBox | null) => void;`
3. State + debounced search (inside the component):

```ts
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

const titleOf = useMemo(() => {
  const m = new Map(notebooks.map((nb) => [nb.id, nb]));
  return (id: string) => m.get(id);
}, [notebooks]);
```

4. Header: inside `<div className="library-actions">`, before the Import PDF label, add:

```tsx
<input
  className="field search-field"
  type="search"
  placeholder="손글씨 검색 · Search handwriting"
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  aria-label="Search handwriting"
/>
```

5. Results panel: directly after `</header>`, add:

```tsx
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
      const nb = titleOf(h.notebookId);
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
```

- [ ] **Step 4: Styles**

Append to `src/styles.css`:

```css
/* ---- handwritten search (v0.3) ---- */
.search-field {
  width: 220px;
  margin: 0;
}
.search-results {
  margin: 0 auto;
  max-width: 720px;
  padding: 12px 24px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.search-hit {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 14px;
  border: 1px solid rgba(35, 36, 77, 0.14);
  border-radius: 10px;
  background: var(--surface, #fffdf6);
  cursor: pointer;
  text-align: left;
}
.search-hit:hover {
  border-color: var(--pen, #3f51d6);
}
.search-hit-text {
  font-weight: 600;
}
.search-hit-meta {
  font-size: 0.82rem;
  opacity: 0.65;
}
```

- [ ] **Step 5: Verify, commit**

Run: `npx vitest run` and `npm run build` → pass.
Browser smoke: search box renders; typing shows the "No matches… Android app" hint (browser has no recognition rows).

```powershell
git add src/App.tsx src/components/LibraryScreen.tsx src/components/EditorScreen.tsx src/styles.css
git commit -m "feat(library): handwritten search with jump-to-page"
```

---

### Task 11: Recognition bench + Settings integration

**Files:**
- Create: `src/recognition/benchSamples.ts`
- Create: `src/components/BenchScreen.tsx`
- Modify: `src/App.tsx` (bench screen)
- Modify: `src/components/SettingsDialog.tsx` (model status + bench link)
- Modify: `src/styles.css` (bench styles — append)

**Interfaces:**
- Consumes: `cer` (Task 3), `mlkitProvider`/`providers` (Task 6), `SongulInk.ensureModel` + `inkRecognitionAvailable` (Task 6).
- Produces: `BENCH_SAMPLES: string[]` (20 items); `BenchScreen({ onBack: () => void })`; `SettingsDialog` new optional prop `onOpenBench?: () => void`.

- [ ] **Step 1: Sample set**

`src/recognition/benchSamples.ts`:

```ts
// Fixed sample set for the recognition quality bench (plan.md M6 deliverable).
export const BENCH_SAMPLES: string[] = [
  '안녕하세요',
  '한국어',
  '감사합니다',
  '학교',
  '친구',
  '사랑',
  '가나다',
  '바쁘다',
  '주말에 뭐 해요?',
  '저는 학생입니다',
  '한국어를 공부해요',
  '내일 만나요',
  '책을 읽어요',
  '날씨가 좋아요',
  '이번 주',
  '할 수 있어요',
  '먹고 싶어요',
  '도서관에 가요',
  '물 한 잔 주세요',
  '천천히 말해 주세요',
];
```

- [ ] **Step 2: Bench screen**

`src/components/BenchScreen.tsx`:

```tsx
// Recognition quality bench: write each prompted sample, recognize it,
// score character error rate. Answers "can I trust ML Kit for my hand?".
import { useEffect, useRef, useState } from 'react';
import type { Stroke, StrokePoint } from '../types';
import { uid } from '../ids';
import { cer } from '../recognition/cer';
import { BENCH_SAMPLES } from '../recognition/benchSamples';
import { getProvider, defaultProviderId } from '../feedback/recognition';
import { inkRecognitionAvailable } from '../recognition/songulInk';

interface ItemResult {
  expected: string;
  recognized: string;
  cer: number;
}

const W = 700;
const H = 220;

export default function BenchScreen({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeRef = useRef<{ id: string; points: StrokePoint[]; start: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<ItemResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastText, setLastText] = useState<string | null>(null);

  const available = inkRecognitionAvailable();
  const sample = BENCH_SAMPLES[index];
  const done = index >= BENCH_SAMPLES.length;

  useEffect(() => {
    redraw();
  }, []);

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#FFFDF6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#23244D';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const all = activeRef.current
      ? [...strokesRef.current.map((s) => s.points), activeRef.current.points]
      : strokesRef.current.map((s) => s.points);
    for (const pts of all) {
      if (pts.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const pt of pts) ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
  }

  function pos(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = pos(e);
    activeRef.current = { id: uid(), points: [{ x, y, p: 0.5, t: 0 }], start: performance.now() };
    redraw();
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const active = activeRef.current;
    if (!active) return;
    const { x, y } = pos(e);
    active.points.push({ x, y, p: 0.5, t: Math.round(performance.now() - active.start) });
    redraw();
  }

  function onUp() {
    const active = activeRef.current;
    if (!active) return;
    strokesRef.current.push({
      id: active.id,
      pageId: 'bench',
      deviceId: 'bench',
      tool: 'pen',
      color: '#23244D',
      width: 2.4,
      opacity: 1,
      points: active.points,
      createdAt: Date.now(),
      deleted: false,
    });
    activeRef.current = null;
    redraw();
  }

  function clearInk() {
    strokesRef.current = [];
    activeRef.current = null;
    setLastText(null);
    redraw();
  }

  async function score() {
    if (busy || strokesRef.current.length === 0) return;
    setBusy(true);
    try {
      const r = await getProvider(defaultProviderId()).recognize({
        strokes: strokesRef.current,
        language: 'ko',
      });
      setLastText(r.text || '(nothing recognized)');
      setResults((prev) => [...prev, { expected: sample, recognized: r.text, cer: cer(sample, r.text) }]);
    } catch (err) {
      setLastText('recognition failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  function next() {
    clearInk();
    setIndex((i) => i + 1);
  }

  const avg = results.length
    ? results.reduce((sum, r) => sum + r.cer, 0) / results.length
    : null;

  return (
    <div className="bench-screen">
      <header className="library-header">
        <button className="btn btn-quiet" onClick={onBack}>
          ← Back
        </button>
        <h1 className="bench-title">Recognition bench · 인식 벤치</h1>
      </header>
      <div className="bench-body">
        {!available && (
          <p className="panel-hint">
            The bench needs on-device recognition — run it inside the Android app.
          </p>
        )}
        {done ? (
          <h2>Done — average CER {avg === null ? '—' : (avg * 100).toFixed(1) + '%'}</h2>
        ) : (
          <>
            <p className="bench-prompt">
              Write ({index + 1}/{BENCH_SAMPLES.length}): <strong>{sample}</strong>
            </p>
            <canvas
              ref={canvasRef}
              className="bench-canvas"
              width={W}
              height={H}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />
            <div className="bench-actions">
              <button className="btn btn-quiet" onClick={clearInk}>
                Clear
              </button>
              <button className="btn btn-primary" disabled={busy || !available} onClick={() => void score()}>
                {busy ? 'Recognizing…' : 'Recognize & score'}
              </button>
              <button className="btn btn-quiet" onClick={next}>
                {lastText ? 'Next →' : 'Skip →'}
              </button>
            </div>
            {lastText && (
              <p className="bench-last">
                Recognized: <strong>{lastText}</strong>
              </p>
            )}
          </>
        )}
        {results.length > 0 && (
          <div className="bench-results">
            <h3>
              Results {avg !== null && <>· average CER {(avg * 100).toFixed(1)}%</>}
            </h3>
            {results.map((r, i) => (
              <div key={i} className="bench-row">
                <span>{r.expected}</span>
                <span className="bench-recognized">{r.recognized || '—'}</span>
                <span className={r.cer <= 0.2 ? 'bench-good' : 'bench-bad'}>
                  {(r.cer * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: App route**

In `src/App.tsx`:
- Extend `Screen`: add `| { name: 'bench' }`.
- Import `BenchScreen from './components/BenchScreen'`.
- Render: add before the settings dialog:

```tsx
{screen.name === 'bench' && <BenchScreen onBack={() => setScreen({ name: 'library' })} />}
```

(and change the library/editor render to a chain that handles all three screen names — `screen.name === 'library' ? ... : screen.name === 'editor' ? ... : <BenchScreen .../>`).
- Pass `onOpenBench={() => { setSettingsOpen(false); setScreen({ name: 'bench' }); }}` to `SettingsDialog`.

- [ ] **Step 4: Settings — model status + bench link**

In `src/components/SettingsDialog.tsx`:
- Props: add `onOpenBench?: () => void;`
- Imports: `import { SongulInk, inkRecognitionAvailable } from '../recognition/songulInk';`
- Add state + block before the closing `about-line` paragraph:

```tsx
const [modelState, setModelState] = useState<
  { kind: 'idle' } | { kind: 'working' } | { kind: 'ok' } | { kind: 'fail'; detail: string }
>({ kind: 'idle' });

async function downloadModel() {
  setModelState({ kind: 'working' });
  try {
    const r = await SongulInk.ensureModel({ language: 'ko' });
    if (r.status === 'downloaded') setModelState({ kind: 'ok' });
    else setModelState({ kind: 'fail', detail: r.message ?? 'download failed' });
  } catch (err) {
    setModelState({ kind: 'fail', detail: err instanceof Error ? err.message : 'failed' });
  }
}
```

```tsx
<div className="settings-block">
  <strong>Handwriting recognition · 손글씨 인식</strong>
  {inkRecognitionAvailable() ? (
    <>
      <div className="ai-test-row">
        <button
          className="btn btn-quiet"
          disabled={modelState.kind === 'working'}
          onClick={() => void downloadModel()}
        >
          {modelState.kind === 'working' ? 'Checking…' : 'Download / check Korean model'}
        </button>
        {modelState.kind === 'ok' && <span className="ai-status ok">Korean model ready</span>}
        {modelState.kind === 'fail' && <span className="ai-status fail">{modelState.detail}</span>}
      </div>
      <p className="settings-hint">
        Recognition runs fully on this device (ML Kit). The Korean model (~20 MB) downloads
        once, then works offline.
      </p>
    </>
  ) : (
    <p className="settings-hint">
      On-device handwriting recognition is available in the SonGul Android app. In the
      browser, type the text to check manually.
    </p>
  )}
  {onOpenBench && (
    <button className="btn btn-quiet" onClick={onOpenBench}>
      Recognition bench · 인식 벤치 열기
    </button>
  )}
</div>
```

- [ ] **Step 5: Bench styles**

Append to `src/styles.css`:

```css
/* ---- recognition bench (v0.3) ---- */
.bench-screen {
  min-height: 100vh;
}
.bench-title {
  font-size: 1.1rem;
  margin: 0;
}
.bench-body {
  max-width: 760px;
  margin: 0 auto;
  padding: 20px 24px 60px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bench-canvas {
  width: 100%;
  border: 1.5px solid rgba(35, 36, 77, 0.25);
  border-radius: 12px;
  background: #fffdf6;
  touch-action: none;
}
.bench-actions {
  display: flex;
  gap: 10px;
}
.bench-results {
  border-top: 1px solid rgba(35, 36, 77, 0.14);
  padding-top: 12px;
}
.bench-row {
  display: grid;
  grid-template-columns: 1fr 1fr 60px;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(35, 36, 77, 0.1);
}
.bench-recognized {
  opacity: 0.8;
}
.bench-good {
  color: #3f9b66;
  font-weight: 700;
}
.bench-bad {
  color: #c8463b;
  font-weight: 700;
}
```

- [ ] **Step 6: Verify, commit**

Run: `npx vitest run` and `npm run build` → pass.
Browser smoke: Settings shows the browser hint + bench link; bench opens, drawing works, "Recognize & score" disabled (not Android).

```powershell
git add src/recognition/benchSamples.ts src/components/BenchScreen.tsx src/App.tsx src/components/SettingsDialog.tsx src/styles.css
git commit -m "feat(bench): recognition quality bench + settings model status"
```

---

### Task 12: Phase 1 verification & docs

**Files:**
- Modify: `docs/PRODUCT_SPEC.md` (M6 row)
- Modify: `android/` (synced web assets via cap sync — generated)

- [ ] **Step 1: Full test + build + native build**

```powershell
npx vitest run
npm run build
npx cap sync android
$env:JAVA_HOME = "C:\Users\user\.jdks\temurin21"
Set-Location android; .\gradlew.bat assembleDebug; Set-Location ..
```

Expected: tests pass, web build passes, `BUILD SUCCESSFUL`; APK at `android\app\build\outputs\apk\debug\app-debug.apk`.

- [ ] **Step 2: Browser regression smoke (dev server)**

Open the app, verify: library renders; search box present; write strokes in a notebook; lasso → 교정 Check still allows manual text entry and analysis; Settings shows the recognition block.

- [ ] **Step 3: Update PRODUCT_SPEC.md**

In the milestone table, change the M6 row to:

```markdown
| M6 Recognition | ✅ v0.3: ML Kit Digital Ink on Android (SongulInk Capacitor plugin), live per-line background recognition, handwritten search with jamo matching, Analyze pre-fill, CER bench page. Browser PWA keeps manual entry. |
```

- [ ] **Step 4: Commit**

```powershell
git add docs/PRODUCT_SPEC.md android
git commit -m "chore: v0.3 phase 1 verification — recognition shipped, spec updated"
```

**Device acceptance (user step, Galaxy Tab):** install `app-debug.apk`, Settings → download Korean model, run the bench (target: usable CER), write a page, search a word from the library, land on the right page.
