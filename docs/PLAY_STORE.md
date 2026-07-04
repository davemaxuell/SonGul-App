# SonGul — Play Store submission guide

Everything below the "Your steps" line requires the Google account holder; everything
above it is already done in this repo.

## Already done in this repo

| Item | Where |
|---|---|
| Signed release bundle | `android\gradlew.bat -p android bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab` |
| Upload keystore | `android/songul-upload.jks` + passwords in `android/key.properties` (both gitignored) |
| App version | Derived from `package.json` (0.3.0 → versionCode 300). Bump package.json to release a new build. |
| Target SDK | 36 (exceeds Play's current minimum) |
| Native exports | PNG/PDF/.songul use the Android share sheet (fixed in v0.3) |
| In-app account deletion | Settings → Account → Delete account (Play account-deletion policy) |
| Privacy policy | `public/privacy.html` → https://son-gul-web-ui.vercel.app/privacy.html after your next Vercel deploy |
| 512×512 icon | `store/icon-512.png` (regenerate: `powershell -ExecutionPolicy Bypass -File scripts\make-store-assets.ps1`) |
| 1024×500 feature graphic | `store/feature-1024x500.png` (same script) |

> **⚠️ Back up `android/songul-upload.jks` and `android/key.properties` somewhere safe
> (password manager / encrypted drive).** They are gitignored on purpose. With Play App
> Signing, a lost *upload* key can be reset via Play Console support, but it stalls
> releases — treat both files as precious.

## Building a release

```powershell
npm run build
npx cap sync android
android\gradlew.bat -p android bundleRelease --console=plain
# → android/app/build/outputs/bundle/release/app-release.aab
```

## Your steps (one-time, ~1 hour + review wait)

1. **Deploy the privacy page**: push/redeploy the site on Vercel so
   https://son-gul-web-ui.vercel.app/privacy.html is live. Open it once to confirm.
2. **Play Console account**: https://play.google.com/console → sign up (one-time $25).
   Personal accounts must complete identity verification (can take a few days).
3. **Create app**: "Create app" → name below, default language Korean (or English US),
   type **App**, **Free**. Accept the declarations.
4. **Store listing** (Grow → Store presence → Main store listing):
   - App name (≤30 chars): `손글 SonGul – 손글씨 한국어 노트`
   - Short description (≤80 chars):
     `Handwriting notebook for learning Korean. Write, get feedback, search your ink.`
   - Full description: see draft below.
   - App icon: upload `store/icon-512.png`. Feature graphic: `store/feature-1024x500.png`.
   - Screenshots: take 4–8 on the Galaxy Tab (tablet screenshots are required for a
     good tablet listing): library, editor with handwriting, 교정 feedback panel,
     handwritten search, recognition bench. PNG/JPG, min 1080 px on the short side.
5. **App content** (Policy → App content) — answer each questionnaire:
   - Privacy policy URL: https://son-gul-web-ui.vercel.app/privacy.html
   - Ads: **No ads**. News app: No. COVID-19 app: No.
   - App access: "All functionality is available without special access" (reviewers can
     use the app without an account; cloud backup is optional).
   - Content rating (IARC): category **Utility / Productivity / Education**, answer No
     to all violence/sexuality/etc. questions → rated Everyone / 3+.
   - Target audience: **13+** (not designed for children).
   - Account deletion: "Yes, users can delete their account in the app" — path:
     Settings → Account → Delete account. Web resource: the privacy-policy URL.
   - Data safety: use the table below.
6. **Data safety questionnaire** answers:
   - Does your app collect or share user data? **Yes** (only if the user opts into
     cloud backup).
   - Everything below is **collected, NOT shared, encrypted in transit, and deletable
     by the user** (in-app account deletion):

     | Data type | Purpose | Optional? |
     |---|---|---|
     | Email address | Account management | Yes (only with an account) |
     | User-generated content (notebook backups: handwriting + recognized text) | App functionality (cloud backup) | Yes |

   - Device or other IDs: **not collected** (the backup manifest stores a user-visible
     device *name* as backup metadata only).
   - No data sold, no third-party sharing, no ads SDKs, no analytics, no location.
7. **Internal testing track** (Test and release → Testing → Internal testing):
   - Create release → upload `app-release.aab` → release name auto-fills (300 / 0.3.0).
   - Release notes: "First internal build: handwriting recognition, handwritten search,
     cloud backup, share-sheet exports."
   - Testers tab: create an email list with your Google account, save, copy the opt-in
     link, open it on the Galaxy Tab, install via Play.
8. **Roll out** the internal release. Internal testing has no review wait; promoting to
   closed/open/production later triggers full review (allow a few days).

## Full description draft (paste into the listing)

```
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
