# SonGul v0.3 Phase 3 — Play Store Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an upload-ready signed `.aab`, make exports actually work inside the APK, and ship the policy/listing collateral (privacy page, store assets, submission checklist) for a Play internal testing track.

**Architecture:** Three independent strands. (a) Release engineering: app version single-sourced from package.json into both the web bundle and Gradle, plus an upload keystore wired into the release signing config. (b) A store-blocker bugfix: `downloadBlob()` anchor downloads are inert in the Android WebView, so a new `saveBlob()` routes native exports through Capacitor Filesystem (cache dir) → system Share sheet, keeping the browser path unchanged. (c) Policy & listing collateral: static `public/privacy.html` (hosted by the existing Vercel deploy), generated 512px icon + 1024×500 feature graphic, and `docs/PLAY_STORE.md` with the full console walkthrough and data-safety answers.

**Tech Stack:** Vite + React + TS, Capacitor 8 (`@capacitor/filesystem`, `@capacitor/share` — new deps), Gradle/AGP (Groovy DSL), JDK 21 keytool/jarsigner, vitest, PowerShell 5.1 System.Drawing for asset generation.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-04-songul-v03-recognition-cloud-playstore-design.md` §10 (10.1–10.4).
- Shell is PowerShell 5.1: **no `&&`** — chain with `;` or `if ($?) { }`. Bash tool available for POSIX one-liners.
- `JAVA_HOME` = `C:\Users\user\.jdks\temurin21` (keytool/jarsigner live in its `bin`). Android SDK = `%LOCALAPPDATA%\Android\Sdk`.
- Gradle from repo root: `android\gradlew.bat <task> --console=plain -q`. Web assets reach the APK only via `npm run build` then `npx cap sync android`.
- **Never commit secrets**: `android/key.properties`, `android/*.jks` must be gitignored before they are created. Verify `git status` in the same task.
- Version scheme: `versionCode = major*10000 + minor*100 + patch` (0.3.0 → 300). package.json is the single source of truth.
- Browser behavior must not change: exports in the browser keep using anchor downloads (regression-checked in Task 7).
- UI copy follows the existing bilingual style: `English · 한국어`.
- App identity: `com.songul.note` / "SonGul". Policy contact email: `busan037@ormbiz.co.kr`. Hosted privacy URL: `https://son-gul-web-ui.vercel.app/privacy.html`.
- Existing test count is 45 (Phases 1+2). All must stay green; `npm test` runs vitest.

---

### Task 1: App version 0.3.0, single-sourced into web + Gradle

**Files:**
- Modify: `package.json:4` (version)
- Modify: `vite.config.ts` (inject `__APP_VERSION__`)
- Modify: `src/vite-env.d.ts` (declare the global)
- Modify: `src/components/SettingsDialog.tsx:349-352` (stale "v0.2" about-line)
- Modify: `android/app/build.gradle:1-25` (derive versionCode/versionName from package.json)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: global `__APP_VERSION__: string` (compile-time define, value `"0.3.0"`) usable anywhere in `src/`; Gradle vars `appVersionCode`/`packageJson` in `android/app/build.gradle` that Task 2's signing block coexists with.

- [ ] **Step 1: Bump package.json to 0.3.0**

In `package.json` change:

```json
  "version": "0.2.0",
```

to

```json
  "version": "0.3.0",
```

- [ ] **Step 2: Define `__APP_VERSION__` in vite.config.ts**

Replace the whole file with:

```ts
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { host: true, port: 5173 },
});
```

- [ ] **Step 3: Declare the global for tsc**

In `src/vite-env.d.ts` append:

```ts
declare const __APP_VERSION__: string;
```

- [ ] **Step 4: Use it in the Settings about-line**

In `src/components/SettingsDialog.tsx` replace:

```tsx
      <p className="settings-hint about-line">
        SonGul Note v0.2 — local-first. All notes are stored on this device (IndexedDB). Use
        Export → .songul for backups.
      </p>
```

with:

```tsx
      <p className="settings-hint about-line">
        SonGul Note v{__APP_VERSION__} — local-first. All notes are stored on this device
        (IndexedDB). Use Export → .songul for backups.
      </p>
```

(The privacy-policy link is added to this paragraph in Task 4, not here.)

- [ ] **Step 5: Derive Gradle versions from package.json**

In `android/app/build.gradle`, insert after line 1 (`apply plugin: 'com.android.application'`):

```gradle
// App version comes from package.json (single source of truth).
// versionCode = major*10000 + minor*100 + patch  (0.3.0 -> 300)
def packageJson = new groovy.json.JsonSlurper().parse(file('../../package.json'))
def semver = (packageJson.version as String).tokenize('.')
def appVersionCode = semver[0].toInteger() * 10000 + semver[1].toInteger() * 100 + semver[2].toInteger()
```

and inside `defaultConfig` replace:

```gradle
        versionCode 1
        versionName "1.0"
```

with:

```gradle
        versionCode appVersionCode
        versionName packageJson.version
```

- [ ] **Step 6: Verify web build + tests still pass**

Run: `npm test; if ($?) { npm run build }`
Expected: 45 tests pass; tsc + vite build succeed with no errors.

- [ ] **Step 7: Verify the APK carries 0.3.0 / 300**

```powershell
$env:JAVA_HOME = 'C:\Users\user\.jdks\temurin21'
android\gradlew.bat assembleDebug --console=plain -q
$bt = Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools" | Sort-Object Name -Descending | Select-Object -First 1
& "$($bt.FullName)\aapt2.exe" dump badging android\app\build\outputs\apk\debug\app-debug.apk | Select-String -Pattern 'versionCode'
```

Expected output contains: `versionCode='300' versionName='0.3.0'`

- [ ] **Step 8: Commit**

```bash
git add package.json vite.config.ts src/vite-env.d.ts src/components/SettingsDialog.tsx android/app/build.gradle
git commit -m "chore(release): single-source app version 0.3.0 into web bundle and Gradle"
```

---

### Task 2: Upload keystore + release signing config

**Files:**
- Create: `android/songul-upload.jks` (NOT committed)
- Create: `android/key.properties` (NOT committed)
- Modify: `android/.gitignore` (ignore both before creating them)
- Modify: `android/app/build.gradle` (signingConfigs + release buildType wiring)

**Interfaces:**
- Consumes: `packageJson`/`appVersionCode` block from Task 1 (signing block sits below it).
- Produces: `android\gradlew.bat bundleRelease` → signed `android/app/build/outputs/bundle/release/app-release.aab`. Task 6's docs and Task 7's final build rely on this command and path. `key.properties` keys: `storeFile`, `storePassword`, `keyAlias` (= `songul-upload`), `keyPassword`.

- [ ] **Step 1: Gitignore the secrets FIRST**

In `android/.gitignore`, replace:

```
# Keystore files
# Uncomment the following lines if you do not want to check your keystore files in.
#*.jks
#*.keystore
```

with:

```
# Keystore files — the upload key and its passwords must never be committed
*.jks
*.keystore
key.properties
```

- [ ] **Step 2: Generate the upload keystore with a random password**

Run in Bash (generates password, creates keystore, prints the password once for the next step):

```bash
PASS=$(head -c 18 /dev/urandom | base64 | tr '+/' 'Aa')
"/c/Users/user/.jdks/temurin21/bin/keytool.exe" -genkeypair -v \
  -keystore "C:\Users\user\Desktop\SonGul App\android\songul-upload.jks" \
  -alias songul-upload -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$PASS" -keypass "$PASS" \
  -dname "CN=SonGul, O=SonGul, C=KR"
echo "PASS=$PASS"
```

Expected: `[Storing C:\Users\user\Desktop\SonGul App\android\songul-upload.jks]` and the password echoed.

- [ ] **Step 3: Write android/key.properties**

Create `android/key.properties` with the password from Step 2 substituted for `<PASS>`:

```properties
storeFile=songul-upload.jks
storePassword=<PASS>
keyAlias=songul-upload
keyPassword=<PASS>
```

- [ ] **Step 4: Wire signing into build.gradle**

In `android/app/build.gradle`, insert after the version-derivation block from Task 1 (before `android {`):

```gradle
// Release signing: android/key.properties + android/songul-upload.jks (both gitignored).
// Builds fall back to unsigned release / debug signing when the file is absent (e.g. CI).
def keystorePropertiesFile = rootProject.file('key.properties')
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.withInputStream { keystoreProperties.load(it) }
}
```

Inside the `android { }` block, insert before `buildTypes`:

```gradle
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile rootProject.file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
```

and change the release buildType to:

```gradle
        release {
            if (keystorePropertiesFile.exists()) {
                signingConfig signingConfigs.release
            }
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
```

- [ ] **Step 5: Build and verify the signed AAB**

```powershell
$env:JAVA_HOME = 'C:\Users\user\.jdks\temurin21'
android\gradlew.bat bundleRelease --console=plain -q
& 'C:\Users\user\.jdks\temurin21\bin\jarsigner.exe' -verify android\app\build\outputs\bundle\release\app-release.aab
```

Expected: last line `jar verified.`

- [ ] **Step 6: Verify no secrets are visible to git**

Run: `git status --short`
Expected: only `android/.gitignore` and `android/app/build.gradle` modified. `songul-upload.jks` / `key.properties` must NOT appear (not even as untracked).

- [ ] **Step 7: Commit**

```bash
git add android/.gitignore android/app/build.gradle
git commit -m "feat(release): wire upload keystore into signed bundleRelease"
```

---

### Task 3: Native export fix — Filesystem + Share sheet (store-blocker)

**Files:**
- Modify: `package.json` (add `@capacitor/filesystem`, `@capacitor/share`)
- Modify: `src/bundle.ts:19` (export `blobToB64`)
- Create: `src/saveFile.ts`
- Test: `src/__tests__/saveFile.test.ts`
- Modify: `src/pdf/exportPdf.ts:102-111` (delete `downloadBlob`)
- Modify: `src/components/EditorScreen.tsx:12,405,408,411`
- Modify: `src/components/LibraryScreen.tsx:22,229`

**Interfaces:**
- Consumes: `blobToB64(blob: Blob): Promise<string>` from `src/bundle.ts` (chunked arrayBuffer→base64, already implemented — just add `export`).
- Produces: `saveBlob(blob: Blob, filename: string): Promise<void>` from `src/saveFile.ts` — the only export sink in the app. Browser: anchor download (behavior identical to the old `downloadBlob`). Native: write to `Directory.Cache` + share sheet; dismissing the sheet resolves, real share errors reject.

- [ ] **Step 1: Install the plugins**

Run: `npm install @capacitor/filesystem @capacitor/share`
Expected: both added to `dependencies` at ^8.x (must match `@capacitor/core` 8).

- [ ] **Step 2: Export blobToB64 from bundle.ts**

In `src/bundle.ts` change:

```ts
async function blobToB64(blob: Blob): Promise<string> {
```

to:

```ts
export async function blobToB64(blob: Blob): Promise<string> {
```

- [ ] **Step 3: Write the failing tests**

Create `src/__tests__/saveFile.test.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/saveFile.test.ts`
Expected: FAIL — `Cannot find module '../saveFile'` (or equivalent resolve error).

- [ ] **Step 5: Implement src/saveFile.ts**

```ts
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/saveFile.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 7: Rewire the call sites and delete downloadBlob**

`src/pdf/exportPdf.ts`: delete the whole `downloadBlob` function (lines 102–111).

`src/components/EditorScreen.tsx` line 12, change:

```ts
import { exportNotebookPdf, exportPagePng, downloadBlob } from '../pdf/exportPdf';
```

to:

```ts
import { exportNotebookPdf, exportPagePng } from '../pdf/exportPdf';
import { saveBlob } from '../saveFile';
```

and the three calls in `handleExport`:

```ts
        await saveBlob(blob, `${safeTitle}-p${pageNum}.png`);
```

```ts
        await saveBlob(blob, `${safeTitle}.pdf`);
```

```ts
        await saveBlob(blob, `${safeTitle}.songul`);
```

`src/components/LibraryScreen.tsx` line 22, change:

```ts
import { downloadBlob } from '../pdf/exportPdf';
```

to:

```ts
import { saveBlob } from '../saveFile';
```

and in `exportNb`:

```ts
      await saveBlob(blob, `${nb.title.replace(/[\\/:*?"<>|]/g, '_')}.songul`);
```

- [ ] **Step 8: Full test suite + web build**

Run: `npm test; if ($?) { npm run build }`
Expected: 48 tests pass (45 + 3 new); build clean.

- [ ] **Step 9: Sync native project and confirm plugins registered**

```powershell
npx cap sync android
Select-String -Path android\app\src\main\assets\capacitor.plugins.json -Pattern 'Filesystem|Share'
```

Expected: sync lists `@capacitor/filesystem@8.x` and `@capacitor/share@8.x`; both classes appear in capacitor.plugins.json.

- [ ] **Step 10: APK still builds**

```powershell
$env:JAVA_HOME = 'C:\Users\user\.jdks\temurin21'
android\gradlew.bat assembleDebug --console=plain -q
```

Expected: BUILD SUCCESSFUL (silent with -q; check `$LASTEXITCODE -eq 0`).

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json src/bundle.ts src/saveFile.ts src/__tests__/saveFile.test.ts src/pdf/exportPdf.ts src/components/EditorScreen.tsx src/components/LibraryScreen.tsx android/
git commit -m "fix(export): route APK exports through Filesystem + Share sheet"
```

(`android/` picks up the cap-sync updates to capacitor.build.gradle / settings; the gitignore keeps assets/public out.)

---

### Task 4: Privacy policy page + in-app link

**Files:**
- Create: `public/privacy.html`
- Modify: `src/components/SettingsDialog.tsx` (about-line link)

**Interfaces:**
- Consumes: `__APP_VERSION__` (Task 1).
- Produces: `dist/privacy.html` in every web build → hosted at `https://son-gul-web-ui.vercel.app/privacy.html` on the user's next Vercel deploy. Task 6 references this URL.

- [ ] **Step 1: Create public/privacy.html**

Full content (static, self-contained, brand palette `#fbf6e9`/`#2e2c25`, English then Korean):

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SonGul — Privacy Policy · 개인정보 처리방침</title>
<style>
  body { background: #fbf6e9; color: #2e2c25; font-family: "Segoe UI", "Malgun Gothic", sans-serif;
         line-height: 1.6; max-width: 760px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
  h1 { font-size: 1.6rem; border-bottom: 2px solid #2e2c25; padding-bottom: .5rem; }
  h2 { font-size: 1.15rem; margin-top: 2rem; }
  hr { border: none; border-top: 1px solid #d8d2c0; margin: 3rem 0; }
  .meta { color: #6b675c; font-size: .9rem; }
</style>
</head>
<body>
<h1>SonGul Privacy Policy</h1>
<p class="meta">Effective date: 5 July 2026 · App: SonGul (com.songul.note) · Contact: busan037@ormbiz.co.kr</p>

<h2>What SonGul is</h2>
<p>SonGul is a handwriting notebook for learning Korean. It is local-first: your notebooks,
handwriting (ink strokes), imported PDFs and recognition results are stored on your device
and are not sent anywhere by default.</p>

<h2>Data stored only on your device</h2>
<ul>
  <li>Notebooks, pages, ink strokes, imported PDF pages and images (IndexedDB).</li>
  <li>Handwriting recognition runs fully on-device (Google ML Kit Digital Ink). The Korean
      model (~20&nbsp;MB) is downloaded once from Google Play services; your ink is never
      uploaded for recognition.</li>
  <li>App settings and feedback history.</li>
</ul>
<p>Uninstalling the app (or clearing its data) permanently deletes this local data.</p>

<h2>Optional account &amp; cloud backup</h2>
<p>If you create an account and use cloud backup, we store, on Supabase infrastructure:</p>
<ul>
  <li>Your email address and a password hash (authentication).</li>
  <li>Notebook backups you trigger (or enable auto-backup for): the full notebook content,
      including handwriting and recognized text.</li>
  <li>Backup metadata: notebook title, page count, size, date, and your device name.</li>
</ul>
<p>Backups are private to your account (row-level security), transferred over HTTPS, and
never shared with, sold to, or used by anyone else. You can delete individual backups in
the app, and <strong>Settings → Account → Delete account</strong> permanently removes your
account and every cloud backup.</p>

<h2>Optional feedback server</h2>
<p>If you configure your own feedback server URL in Settings, text you explicitly submit
for correction is sent to that server you control. This is off by default.</p>

<h2>What SonGul does not do</h2>
<ul>
  <li>No ads, no analytics, no tracking, no selling of data.</li>
  <li>No access to contacts, location, camera or microphone.</li>
</ul>

<h2>Children</h2>
<p>SonGul is a general-audience study tool and does not knowingly collect personal data
from children under 13. Accounts are optional and require an email address.</p>

<h2>Changes &amp; contact</h2>
<p>Changes to this policy are published at this URL. Questions or data requests:
<a href="mailto:busan037@ormbiz.co.kr">busan037@ormbiz.co.kr</a>.</p>

<hr>

<h1>손글 개인정보 처리방침</h1>
<p class="meta">시행일: 2026년 7월 5일 · 앱: 손글 SonGul (com.songul.note) · 문의: busan037@ormbiz.co.kr</p>

<h2>손글이란</h2>
<p>손글은 한국어 학습용 손글씨 노트 앱입니다. 로컬 우선(local-first) 방식으로, 노트·필기(잉크
스트로크)·가져온 PDF·인식 결과는 기본적으로 기기에만 저장되며 어디로도 전송되지 않습니다.</p>

<h2>기기에만 저장되는 데이터</h2>
<ul>
  <li>노트, 페이지, 잉크 스트로크, 가져온 PDF 페이지와 이미지 (IndexedDB).</li>
  <li>손글씨 인식은 전부 기기 안에서 실행됩니다 (Google ML Kit Digital Ink). 한국어 모델(약
      20MB)은 Google Play 서비스에서 한 번만 내려받으며, 필기 내용이 인식을 위해 업로드되는
      일은 없습니다.</li>
  <li>앱 설정과 교정 기록.</li>
</ul>
<p>앱을 삭제하거나 데이터를 지우면 이 로컬 데이터는 영구히 삭제됩니다.</p>

<h2>선택 사항: 계정 및 클라우드 백업</h2>
<p>계정을 만들어 클라우드 백업을 사용하면 Supabase 인프라에 다음이 저장됩니다:</p>
<ul>
  <li>이메일 주소와 비밀번호 해시 (인증용).</li>
  <li>직접 실행했거나 자동 백업으로 만들어진 노트 백업: 필기와 인식된 텍스트를 포함한 노트
      전체 내용.</li>
  <li>백업 메타데이터: 노트 제목, 페이지 수, 크기, 날짜, 기기 이름.</li>
</ul>
<p>백업은 계정별로 완전히 격리되며(행 수준 보안), HTTPS로 전송되고, 제3자와 공유·판매되지
않습니다. 앱에서 개별 백업을 삭제할 수 있으며, <strong>설정 → 계정 → 계정 삭제</strong>로
계정과 모든 클라우드 백업을 영구 삭제할 수 있습니다.</p>

<h2>선택 사항: 교정 서버</h2>
<p>설정에서 직접 운영하는 교정 서버 URL을 지정한 경우, 사용자가 명시적으로 제출한 텍스트만
해당 서버로 전송됩니다. 기본값은 꺼짐입니다.</p>

<h2>손글이 하지 않는 것</h2>
<ul>
  <li>광고, 분석 도구, 추적, 데이터 판매 없음.</li>
  <li>연락처·위치·카메라·마이크 접근 없음.</li>
</ul>

<h2>아동</h2>
<p>손글은 일반 사용자를 위한 학습 도구이며, 만 13세 미만 아동의 개인정보를 의도적으로
수집하지 않습니다. 계정은 선택 사항이며 이메일 주소가 필요합니다.</p>

<h2>변경 및 문의</h2>
<p>정책이 변경되면 이 URL에 게시됩니다. 문의 및 데이터 요청:
<a href="mailto:busan037@ormbiz.co.kr">busan037@ormbiz.co.kr</a></p>
</body>
</html>
```

- [ ] **Step 2: Link it from Settings**

In `src/components/SettingsDialog.tsx`, replace the about-line (as updated in Task 1) with:

```tsx
      <p className="settings-hint about-line">
        SonGul Note v{__APP_VERSION__} — local-first. All notes are stored on this device
        (IndexedDB). Use Export → .songul for backups.{' '}
        <a
          href="https://son-gul-web-ui.vercel.app/privacy.html"
          target="_blank"
          rel="noreferrer"
        >
          Privacy policy · 개인정보 처리방침
        </a>
      </p>
```

(Capacitor opens external https links in the system browser, so this works in the APK without extra plugins.)

- [ ] **Step 3: Verify it ships in the build**

Run: `npm run build; if ($?) { Test-Path dist\privacy.html }`
Expected: build clean, `True`.

- [ ] **Step 4: Commit**

```bash
git add public/privacy.html src/components/SettingsDialog.tsx
git commit -m "feat(policy): hosted privacy policy page + in-app link"
```

---

### Task 5: Store listing graphics (512 icon + 1024×500 feature graphic)

**Files:**
- Create: `scripts/make-store-assets.ps1`
- Create: `store/icon-512.png` (generated)
- Create: `store/feature-1024x500.png` (generated)

**Interfaces:**
- Consumes: `assets/icon.png` (the @capacitor/assets source icon), brand palette `#fbf6e9` / `#2e2c25`.
- Produces: the two PNGs Play Console requires for a store listing; Task 6 references their paths.

- [ ] **Step 1: Write scripts/make-store-assets.ps1**

```powershell
# Generates Play Store listing graphics from the app icon + brand palette.
# Rerunnable: overwrites store\icon-512.png and store\feature-1024x500.png.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'assets\icon.png'
$outDir = Join-Path $root 'store'
New-Item -ItemType Directory -Force $outDir | Out-Null

$paper = [System.Drawing.ColorTranslator]::FromHtml('#fbf6e9')
$ink = [System.Drawing.ColorTranslator]::FromHtml('#2e2c25')
$icon = [System.Drawing.Image]::FromFile($src)

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.TextRenderingHint = 'AntiAlias'
  return $bmp, $g
}

# --- 512x512 hi-res icon ---
$bmp, $g = New-Canvas 512 512
$g.Clear($paper)
$g.DrawImage($icon, 0, 0, 512, 512)
$g.Dispose()
$bmp.Save((Join-Path $outDir 'icon-512.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# --- 1024x500 feature graphic: icon left, wordmark + tagline right ---
$bmp, $g = New-Canvas 1024 500
$g.Clear($paper)
$g.DrawImage($icon, 70, 90, 320, 320)
$brush = New-Object System.Drawing.SolidBrush($ink)
$title = New-Object System.Drawing.Font('Malgun Gothic', 64, [System.Drawing.FontStyle]::Bold)
$tag = New-Object System.Drawing.Font('Malgun Gothic', 22)
$g.DrawString('손글 SonGul', $title, $brush, 420, 150)
$g.DrawString('Learn Korean by hand · 손으로 배우는 한국어', $tag, $brush, 424, 280)
$g.Dispose()
$bmp.Save((Join-Path $outDir 'feature-1024x500.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$icon.Dispose()

# --- verify dimensions ---
foreach ($spec in @(@('icon-512.png', 512, 512), @('feature-1024x500.png', 1024, 500))) {
  $img = [System.Drawing.Image]::FromFile((Join-Path $outDir $spec[0]))
  if ($img.Width -ne $spec[1] -or $img.Height -ne $spec[2]) { throw "$($spec[0]) is $($img.Width)x$($img.Height)" }
  $img.Dispose()
  Write-Host "OK $($spec[0]) $($spec[1])x$($spec[2])"
}
```

- [ ] **Step 2: Run it**

Run: `powershell -ExecutionPolicy Bypass -File scripts\make-store-assets.ps1`
Expected: `OK icon-512.png 512x512` and `OK feature-1024x500.png 1024x500`.

- [ ] **Step 3: Eyeball the output**

Read both PNGs (they render as images) and confirm: icon crisp, feature graphic shows icon + "손글 SonGul" + tagline, nothing clipped. If text overflows the right edge, reduce the title font to 56 and rerun.

- [ ] **Step 4: Commit**

```bash
git add scripts/make-store-assets.ps1 store/icon-512.png store/feature-1024x500.png
git commit -m "feat(store): Play listing icon + feature graphic, generated from brand assets"
```

---

### Task 6: docs/PLAY_STORE.md submission checklist + README release section

**Files:**
- Create: `docs/PLAY_STORE.md`
- Modify: `README.md` (short "Release build" section pointing at the doc)

**Interfaces:**
- Consumes: paths/commands produced by Tasks 1–5 (`bundleRelease`, `store/*.png`, privacy URL, keystore files).
- Produces: the user-facing runbook; nothing downstream.

- [ ] **Step 1: Create docs/PLAY_STORE.md**

```markdown
# SonGul — Play Store submission guide

Everything below the "Your steps" line requires the Google account holder; everything
above it is already done in this repo.

## Already done in this repo

| Item | Where |
|---|---|
| Signed release bundle | `android\gradlew.bat bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab` |
| Upload keystore | `android/songul-upload.jks` + passwords in `android/key.properties` (both gitignored) |
| App version | Derived from `package.json` (0.3.0 → versionCode 300). Bump package.json to release a new build. |
| Target SDK | 36 (exceeds Play's current minimum) |
| Native exports | PNG/PDF/.songul use the Android share sheet (fixed in v0.3) |
| In-app account deletion | Settings → Account → Delete account (Play account-deletion policy) |
| Privacy policy | `public/privacy.html` → https://son-gul-web-ui.vercel.app/privacy.html after your next Vercel deploy |
| 512×512 icon | `store/icon-512.png` |
| 1024×500 feature graphic | `store/feature-1024x500.png` |

> **⚠️ Back up `android/songul-upload.jks` and `android/key.properties` somewhere safe
> (password manager / encrypted drive).** They are gitignored on purpose. With Play App
> Signing, a lost *upload* key can be reset via Play Console support, but it stalls
> releases — treat both files as precious.

## Building a release

```powershell
npm run build
npx cap sync android
android\gradlew.bat bundleRelease --console=plain
# → android/app/build/outputs/bundle/release/app-release.aab
```

## Your steps (one-time, ~1 hour + review wait)

1. **Deploy the privacy page**: push/redeploy the site on Vercel so
   https://son-gul-web-ui.vercel.app/privacy.html is live. Open it once to confirm.
2. **Play Console account**: https://play.google.com/console → sign up (one-time $25).
   Personal accounts must complete identity verification (can take a few days).
3. **Create app**: "Create app" → name below, default language English (US) or Korean,
   App, Free. Accept declarations.
4. **Store listing** (Grow → Store presence → Main store listing):
   - App name (≤30 chars): `손글 SonGul – 손글씨 한국어 노트`
   - Short description (≤80 chars):
     `Handwriting notebook for learning Korean. Write, get feedback, search your ink.`
   - Full description: see draft below.
   - App icon: upload `store/icon-512.png`. Feature graphic: `store/feature-1024x500.png`.
   - Screenshots: take 4–8 on the Galaxy Tab (tablet screenshots required for tablet
     listing): library, editor with handwriting, 교정 feedback panel, handwritten search,
     recognition bench. Landscape, PNG/JPG, min 1080 px on the short side.
5. **App content** (Policy → App content) — answer each questionnaire:
   - Privacy policy URL: https://son-gul-web-ui.vercel.app/privacy.html
   - Ads: **No ads**. News app: No. COVID app: No.
   - App access: "All functionality is available without special access" (reviewers can
     use it without an account; cloud backup is optional).
   - Content rating (IARC): category **Utility/Productivity/Education**, answer No to all
     violence/sex/etc. questions → Everyone / 3+.
   - Target audience: **13+** (not designed for children).
   - Account deletion: "Yes, in app" — path: Settings → Account → Delete account. Also
     provide the privacy-policy URL as the web resource.
   - Data safety: use the table below.
6. **Data safety questionnaire** answers:
   - Does your app collect or share user data? **Yes** (only if the user opts into cloud).
   - Collected, NOT shared, encrypted in transit, deletable by the user:
     | Data type | Purpose | Optional? |
     |---|---|---|
     | Email address | Account management | Yes (only with an account) |
     | User-generated content (notebook backups: handwriting + recognized text) | App functionality (cloud backup) | Yes |
     | Device or other IDs → **not collected** (device *name* is user-visible backup metadata, declared under "Other app info" if asked) |
   - No data sold; no third-party sharing; no ads SDKs; no location.
7. **Internal testing track** (Test and release → Testing → Internal testing):
   - Create release → upload `app-release.aab` → release name auto (0.3.0).
   - Release notes: "First internal build: handwriting recognition, handwritten search,
     cloud backup, share-sheet exports."
   - Testers: create an email list with your Google account, save, copy the opt-in link,
     open it on the Galaxy Tab, install via Play.
8. **Roll out** the internal release. Internal testing needs no review wait; promoting to
   closed/open/production later triggers full review (allow a few days).

## Full description draft (paste into the listing)

손글(SonGul)은 한국어를 손으로 쓰면서 배우는 필기 노트 앱입니다.

- 종이 같은 필기감의 잉크 엔진 — 지연 없이 부드럽게
- 쓰는 대로 자동 인식되는 손글씨 (기기 내 ML Kit, 오프라인 동작)
- 손글씨 검색: 예전에 쓴 단어를 찾아 해당 페이지로 바로 이동
- 교정 피드백: 문장을 올가미로 선택하면 맞춤법·문형 피드백
- PDF 가져오기 / PDF·PNG 내보내기, .songul 노트 백업
- 선택형 클라우드 백업 (계정은 선택 사항, 데이터는 계정별 완전 격리)
- 광고 없음, 추적 없음, 로컬 우선

SonGul is a handwriting notebook for learning Korean: a paper-like ink engine,
on-device handwriting recognition and search, Korean writing feedback, PDF
import/export, and optional private cloud backup. No ads, no tracking, local-first.
```

- [ ] **Step 2: Add a Release section to README.md**

Read `README.md` first; append (or merge into an existing build section):

```markdown
## Release (Play Store)

```powershell
npm run build
npx cap sync android
android\gradlew.bat bundleRelease --console=plain
```

Signed `.aab` lands in `android/app/build/outputs/bundle/release/`. Signing uses the
gitignored `android/songul-upload.jks` + `android/key.properties` — **keep backups of
both**. Full submission walkthrough: [docs/PLAY_STORE.md](docs/PLAY_STORE.md).
```

- [ ] **Step 3: Commit**

```bash
git add docs/PLAY_STORE.md README.md
git commit -m "docs(store): Play Store submission guide + README release section"
```

---

### Task 7: Final verification + browser regression smoke

**Files:** none new (fixes only if regressions surface).

**Interfaces:** consumes everything above.

- [ ] **Step 1: Full clean pipeline**

```powershell
npm test
npm run build
npx cap sync android
$env:JAVA_HOME = 'C:\Users\user\.jdks\temurin21'
android\gradlew.bat bundleRelease --console=plain -q
& 'C:\Users\user\.jdks\temurin21\bin\jarsigner.exe' -verify android\app\build\outputs\bundle\release\app-release.aab
```

Expected: 48 tests pass; build clean; `jar verified.`

- [ ] **Step 2: Browser regression smoke (preview tools against dev server — beware a stray node on 5173 from earlier sessions)**

- Library renders; create/open notebook still works; console has zero errors.
- Settings shows "SonGul Note v0.3.0" and the privacy-policy link; link href is the
  Vercel URL.
- `/privacy.html` on the dev server renders both language sections.
- Export a notebook (⋯ → export .songul) in the browser → still downloads via anchor
  (saveBlob web path regression).

- [ ] **Step 3: Commit any smoke fixes, then wrap up**

If fixes were needed: `git add <files>; git commit -m "fix: phase 3 smoke fixes"`.
Report deliverable paths (aab, store assets, docs) and remaining user steps (deploy
privacy page, Play Console signup, device screenshots).
