# SonGul Project Overview

Last reviewed: 2026-06-11  
Project type: Expo SDK 56 tablet/web app  
Product name: SonGul, from `손글`, meaning handwriting

## 1. What This Project Is

SonGul is a warm, tablet-first Korean handwriting tutor. The core idea is not "learn Korean by tapping flashcards"; it is "learn Korean by physically writing Hangul and getting useful feedback on the marks you made."

The product turns a tablet, stylus, finger, or mouse into a guided writing notebook. A learner is served a Korean target, writes it by hand, checks the writing, receives specific AI tutor feedback, retries the same item, and then moves forward. Behind that loop, the app tracks item mastery, skill mastery, review due dates, and daily writing activity.

The strongest product thesis is:

> SonGul teaches Korean handwriting as a physical, repeatable skill: serve the right item, write it by hand, mark what needs work, retry immediately, update mastery, and schedule the next best thing.

## 2. Intended Users

Primary users are beginner to intermediate Korean learners who want to improve Hangul handwriting on a tablet.

They are likely:

- Studying Korean independently or alongside a class.
- Practicing for short sessions, often a few minutes at a time.
- Using a stylus or tablet but also needing mouse/finger support on web.
- Looking for correction on letter shape, stroke order, spacing, and grammar.
- Motivated by visible progress but not by childish game mechanics.

The app is designed for learners who are studying, not browsing. The interface should feel like a writing tool in the hand, not a content feed.

## 3. Product Positioning

SonGul sits between a notebook, a handwriting coach, and an adaptive language-learning system.

It is not:

- A generic analytics dashboard.
- A cute kids' ed-tech game.
- A typed Korean flashcard app.
- A social ranking app first.
- A cloud-account product first.

It is:

- A handwriting-first Korean learning app.
- A warm notebook with tutor feedback.
- A local-first practice tool with optional server AI.
- A progress journal that makes improvement visible.
- A future adaptive tutor built around SRS and weak-skill targeting.

## 4. Core Learning Loop

The intended learning loop is:

1. The app selects a target item from the learner's queue.
2. The learner writes the item by hand on a full writing surface.
3. The app captures the canvas image and sends it to a grader.
4. The grader returns a score plus structured character and skill feedback.
5. The app marks characters and skills inline.
6. The learner retries immediately or moves to the next item.
7. The app updates item SRS state and skill mastery.
8. Future sessions prioritize due reviews, weak skills, and the next unlocked curriculum items.

This is already partially implemented in `app/session.tsx`, `lib/learning.ts`, `lib/srs.ts`, `lib/database.ts`, and `services/grading.ts`.

## 5. Current App Information Architecture

The active app uses Expo Router with three visible tabs and one full-screen session route.

### Today

File: `app/(tabs)/index.tsx`

Today is the session hub and progress home. It combines the old dashboard and session entry into one learner-centered page.

Current surfaces:

- Korean greeting addressed to the learner by name.
- Navy "session ticket" hero with today's queue summary.
- Start session button.
- Word of the day and expression of the day.
- Progress metrics: streak, items practiced, overall mastery, written today.
- Saved page shelf with real canvas previews.
- Activity calendar.
- Weekly league demo card.
- Recent session activity.
- Metric detail modals for items, mastery, and today's goal.

Important distinction: session numbers and recent attempts are real. Some dashboard enrichment is still demo data until more real history exists.

### Write

File: `app/(tabs)/practice.tsx`

Write is the free-write notebook route. It is always one tap away from the floating dock and is separate from the structured session loop.

Current surfaces:

- Full-bleed Skia writing surface.
- Left floating tool rail.
- Pen, marker, eraser, color, width, eraser mode, page format, guide lines.
- Undo, redo, new page, clear.
- Free-write AI check through the legacy feedback contract.
- Previous feedback history.
- Autosaved canvas pages that can be reopened from Today.
- Right-side AI coach rail.
- Demo-generated worksheet overlays.

Write is closer to a note app plus tutor than to a quiz screen. It preserves expression and exploration while the structured session handles adaptive mastery.

### Settings

File: `app/(tabs)/settings.tsx`

Settings controls local profile, language, goal, tool preferences, and backend configuration.

Current controls:

- Editable display name.
- Language picker.
- Daily goal stepper and presets.
- Reminders toggle.
- Tracing guide toggle.
- Save writing toggle.
- Stylus-only writing toggle.
- Dark mode toggle.
- Backend note for `EXPO_PUBLIC_SONGUL_API_BASE_URL`.

Some account text is demo dressing. There is no real sign-in or cloud sync in this build.

### Session

File: `app/session.tsx`

Session is the structured adaptive writing route launched from Today.

Current behavior:

- Builds a queue with `buildQueue()`.
- Shows target type and item kind: new, review, or drill.
- Shows Korean target, romanization, meaning, and TTS where available.
- Uses adaptive scaffold levels: trace, reference, memory.
- Captures strokes from the writing surface.
- Checks the result with `gradeWriting()`.
- Shows per-character chips and per-skill scores.
- Lets the learner tap a character for a focused correction note.
- Records the write attempt.
- Updates item SRS and skill mastery.
- Supports retry and next item.

This route is the closest expression of the final product idea.

## 6. Website And Web UI

The project is configured to run as a web app through Expo Router and Metro. `app.json` sets `"web": { "bundler": "metro", "output": "single" }`, and `index.web.js` preloads Skia CanvasKit before booting Expo Router.

There is also a website/marketing content layer in `data/songul-content.ts` and `i18n-source/*.json`. Much of that content describes the external product story:

- Hero stats: average accuracy, streak, one-tap AI feedback.
- Product cards: handwriting recognition, targeted correction, learning path, progress.
- How-it-works steps: choose, write, AI analyzes, correct and continue.
- Feature cards: letter shape, stroke order, spacing, grammar, weak-point tracking, progress.
- Learning path: jamo, learn, build, write.
- Focus areas: ㅂ/ㅁ, 은/는 spacing, 받침.
- Vocabulary and legacy quiz content.
- Prototype-preview copy and footer/legal text.

The active Expo app does not currently expose a separate marketing landing route. The web build serves the app experience. The marketing content appears to be legacy, shared, or intended for a companion web/landing UI. It should be treated as useful product language, but not all of it is live in the current app screens.

Key website-facing assets:

- `assets/songul/hero-tablet-display.jpg` - large hero/tablet visual, 2048x1280.
- `assets/songul/front-screen.png` - wide product screen, 2048x1024.
- `assets/songul/tablet-screen.png` - wide tablet screen, 2048x1024.
- `assets/songul/handwriting-demo.mp4` - handwriting demo video.
- `assets/songul/SonGul-LOGO.png` - brand logo.
- `assets/songul/mascot-*.png` - mascot states for warmth and tutoring.

## 7. Design Direction

The design system is defined in `DESIGN.md`, `PRODUCT.md`, `constants/theme.ts`, `constants/motion.ts`, and shared UI components.

### Creative North Star

"The Hand and the Page."

The writing surface is the center of the product. The rest of the UI is the margin around it.

### Visual Personality

- Warm.
- Patient.
- Calm.
- Credible.
- Notebook-like.
- Bilingual by default.
- Friendly without becoming childish.

### Palette

The palette is a warm paper system:

- Paper background: `#FBF6E9`
- Card surface: `#FFFDF6`
- Paper alt: `#F4ECD7`
- Ink text: `#2E2C25`
- Muted ink: `#645F52`
- Line/grid: warm beige line colors
- Primary action pen blue: `#3F51D6`
- Navy chrome: `#23244D`
- Success green: `#3F9B66`
- Attention gold: `#E0922B`
- Correction red: `#C8463B`
- Teal and pink as limited secondary accents

The most important color rule is that pen blue is the one action color. It should carry primary actions, active states, and focus. It should not become general decoration.

### Typography

The app loads Google fonts through Expo:

- Poppins 800 for display.
- Inter 500/700/800 for body and UI.
- Noto Sans KR 700 for Korean.
- Gaegu for handwritten tutor notes.

Korean text is treated as first-class content, not small helper text. Hangul glyphs are sized generously for stroke legibility.

### Components

Important reusable pieces:

- `Screen` for warm scrollable page layout.
- `Card` for warm paper panels.
- `AppText` for type variants.
- `Pill` for status and labels.
- `ActionButton` for primary/ghost/danger actions.
- `MetricCard` for learner progress stats.
- `LanguagePicker` and `ToggleRow` for settings.
- `WritingSurface` for the core canvas.
- `CanvasCard` for saved page previews.
- `ActivityCalendar` for daily activity.
- `Leaderboard` for demo weekly league.
- `AiThinkingOverlay` for AI wait states.
- `Worksheet` for coach-generated practice sheets.

### Navigation

The app uses a floating navy pill dock with three visible destinations:

- Today
- Write
- Settings

The active indicator is a pen-blue circle. The dock is intentionally compact and floats above the paper rather than acting like a heavy native tab bar.

### Motion

Motion is centralized in `constants/motion.ts` and `components/motion.tsx`.

The motion style is restrained:

- Press feedback around 110ms.
- Small state changes around 180-240ms.
- Screen transitions around 280ms.
- Staggered entrances around 360ms.
- Reduced-motion fallbacks are considered.

## 8. Writing Surface

File: `components/writing-surface.tsx`

The writing surface is the core technical and UX asset.

Capabilities:

- Skia canvas rendering.
- Pressure-shaped ink through `lib/ink.ts`.
- Pen, marker, and eraser tools.
- Stroke erasing and touch erasing.
- Undo and redo.
- Page formats: blank, lined, grid, Hangul guide.
- Optional tracing guide.
- Optional correction overlay.
- Optional worksheet overlay.
- Canvas snapshot as base64 JPEG for grading.
- Stylus-only mode with palm/finger shielding.
- Pointer capture so strokes continue when the pen nears the canvas edge.
- Coalesced web pointer events for high-frequency stylus samples.
- Saved strokes as serializable arrays.

This component lets the app behave like a real notebook rather than a simple drawing toy.

## 9. Learning Model

The adaptive learning model is documented in `docs/PRD-adaptive-learning-loop.md` and implemented across `data/curriculum.ts`, `lib/learning.ts`, `lib/srs.ts`, and `lib/database.ts`.

### Curriculum Spine

The authored curriculum progresses:

1. Jamo: consonants and vowels.
2. Syllables: basic CV blocks.
3. Words: real Korean words, including final consonants.
4. Sentences: spacing and grammar.

The current seed corpus contains:

- 24 jamo.
- 20 syllables.
- 10 words.
- 5 sentences.

Total authored items: 59.

### Skills

The fixed skill taxonomy is:

- `shape`
- `stroke_order`
- `spacing`
- `grammar`

Items have skill tags. Attempts update only the skills relevant to the item.

### Item SRS

Each item can have an SRS state:

- ease
- interval days
- due date
- repetitions
- lapses
- mastery
- last score

The scheduler uses a lightweight SM-2 style algorithm:

- Scores 75+ are passing.
- Early successful reps move to 1 day, then 3 days.
- Later intervals multiply by ease.
- Failed attempts reset reps and resurface the item.
- Mastery is smoothed toward the latest normalized score.

### Queue Builder

File: `lib/learning.ts`

The queue builder blends:

- Due reviews.
- New unlocked curriculum items.
- Weak-skill drills.
- Generated sentence items once sentence level is unlocked and authored content runs low.

The default session size is 12 items. Due reviews can take roughly 60% of the queue, then new items fill the rest. One weak-skill drill may be injected near the front.

### Scaffolding

Scaffold level is derived from SRS state:

- No state or zero reps: trace.
- Mastery below 0.5: reference.
- Mastery at 0.5 or higher: memory.

The intended experience is that guidance fades as mastery increases.

## 10. AI And Backend Contracts

The project currently has two grading paths.

### Structured Session Grading

File: `services/grading.ts`

This is the future-facing contract used by structured sessions.

Request:

```json
{
  "image": "<base64>",
  "target": "학교에 가요.",
  "itemType": "sentence"
}
```

Expected response:

```json
{
  "score": 0,
  "recognized": "...",
  "correction": "...",
  "grammarTip": "...",
  "recommendation": "...",
  "perCharacter": [],
  "perSkill": {
    "shape": 0,
    "stroke_order": 0,
    "spacing": 0,
    "grammar": 0
  }
}
```

If `EXPO_PUBLIC_SONGUL_API_BASE_URL` is not set, structured sessions use a deterministic mock grade. That means the UI and learning loop can be tested without the real AI backend, but real handwriting recognition is not happening in that path yet.

### Legacy Free-Write Grading

File: `services/check-writing.ts`

This older path sends only the image and expects sentence-level feedback:

- recognized
- correction
- grammar tip
- free-text issues
- chips
- recommendation
- score

The free-write screen still uses this older flow. If the API URL is missing, it shows an error and offers demo feedback.

### AI Coach

The AI coach is currently demo-backed through `data/demo-coach.ts`.

The intended future endpoint is `/api/coach`. The current demo bank covers:

- Topic sparks.
- Reading and answer.
- Dialogue completion.
- Fill in the blanks.
- Sentence transformations.
- Translation.
- Dictation.

Worksheets are rendered onto the writing page, and ink passes through the overlay.

## 11. Local Data Model

File: `lib/database.ts`

The app uses `expo-sqlite` for local persistence.

Current tables include:

- `practice_attempts` - legacy free-write feedback history.
- `lesson_progress` - legacy table.
- `quiz_results` - legacy table.
- `items` - vestigial table; authored/generated content now lives in memory.
- `item_srs` - item-level spaced repetition state.
- `skill_mastery` - skill-level mastery and attempt counts.
- `write_attempts` - structured session attempts.
- `canvases` - saved free-write page strokes.

Important implementation constraint:

The web SQLite sync bridge has problems with large sync operations and Korean multibyte content. The current architecture avoids that by:

- Keeping authored and generated Korean item content in memory.
- Storing ASCII/numeric state in SQLite.
- Using ASCII item IDs.
- Avoiding `SELECT *` of Korean content through sync APIs.
- Splitting schema `execSync` calls into smaller chunks.
- Using async APIs for large saved canvas stroke JSON.

This constraint is load-bearing for the web build.

## 12. Settings And Local Preferences

File: `lib/settings.ts`

Settings are stored in localStorage using the key `songul.settings`. On web, this is installed through `expo-sqlite/localStorage/install`.

Default settings:

- language from device locale, normalized to supported languages
- dark mode off
- name: Dave
- daily goal: 10
- reminders on
- tracing guide off
- save writing on
- pen focus on
- eraser mode: touch
- page format: blank

Settings are exposed through `useSyncExternalStore`, so components can subscribe to updates without a global state library.

## 13. Internationalization

Supported language codes:

- English: `en`
- Korean: `ko`
- Chinese: `zh`
- Vietnamese: `vi`
- Russian: `ru`
- Japanese: `ja`
- Indonesian: `id`

Translation files live in `i18n-source/*.json`. The current active app screens use some direct English copy and some translated/shared content. A future production pass should decide whether all user-facing strings must move into the translation dictionaries.

## 14. Technology Stack

Core platform:

- Expo SDK 56.
- React 19.2.3.
- React Native 0.85.3.
- Expo Router 56.
- TypeScript 6.

Key libraries:

- `@shopify/react-native-skia` for ink canvas.
- `perfect-freehand` for pressure-shaped strokes.
- `expo-sqlite` for local persistence.
- `expo-speech` for Korean TTS.
- `expo-haptics` for iOS haptics.
- `expo-image` for optimized assets.
- `expo-symbols` for platform icons.
- `react-native-reanimated` for motion.
- `react-native-gesture-handler` and `react-native-screens`.

Web-specific:

- `index.web.js` preloads CanvasKit before Expo Router.
- `public/canvaskit.wasm` is required by Skia web.
- `scripts/web-preview.mjs` starts a cross-origin-isolated preview proxy.
- `metro.config.js` adds `.wasm` and COOP/COEP headers.

## 15. Development Commands

From `package.json`:

```bash
npm run start
npm run android
npm run ios
npm run web
npm run web:preview
npm run typecheck
```

Use `npm run web:preview` for browser testing on this project because `expo-sqlite` web requires SharedArrayBuffer, which requires cross-origin isolation headers on the HTML document.

## 16. Current Production Reality

Real or mostly real:

- Expo SDK 56 app shell.
- Three-tab app navigation.
- Full structured session route.
- Skia writing surface.
- Stroke capture and rendering.
- Saved free-write pages.
- Local SQLite persistence.
- SRS and skill mastery state.
- Queue builder.
- Settings persistence.
- Dark mode support.
- Web bootstrap for Skia and SQLite.

Mocked, demo, or unfinished:

- Structured AI grading is mocked unless `EXPO_PUBLIC_SONGUL_API_BASE_URL` is set.
- The actual Gemini reliability spike is still external.
- Free-write still uses the legacy non-target-aware grading contract.
- AI coach exercises are demo data.
- Weekly league is demo data.
- Word/expression of the day is demo data.
- Some dashboard history is demo-augmented until real usage exists.
- Profile/account details are demo dressing.
- Marketing website content exists but is not a clearly active landing route in this app.
- Legacy tables and content remain from earlier flows.

## 17. Demo Data Inventory

Files marked `[DEMO-DATA]`:

- `data/demo-history.ts`
- `data/demo-leaderboard.ts`
- `data/demo-pages.ts`
- `data/demo-coach.ts`

Demo consumers:

- Today dashboard enrichment.
- Activity calendar fill.
- Word/expression of the day.
- Saved page placeholders.
- Weekly league.
- AI coach worksheets.
- Settings profile/account dressing.

Removal strategy:

1. Grep for `[DEMO-DATA]`.
2. Replace each call site with real backend or local data.
3. Remove visible sample tags once the backing data is real.
4. Revisit empty states so the first-run app still feels intentional.

## 18. Main Risks

### AI Grading Reliability

The biggest risk is whether Gemini or another model can return reliable per-character and per-skill handwriting feedback from an image.

Critical signals to validate:

- JSON validity.
- Recognition accuracy.
- Per-character correctness agreement.
- Skill attribution accuracy.
- Stroke-order reliability from static handwriting images.

If stroke-order grading is unreliable, the product should teach stroke order from authored data but not pretend to grade it from an image.

### Backend Ownership

The client expects `/api/check`, but the real endpoint and Gemini prompt live outside this repo.

The structured session loop is blocked from being real until that endpoint exists and has been evaluated.

### Web SQLite Constraints

The current web architecture relies on careful SQLite usage. Reintroducing large sync reads, Korean `SELECT *`, or burst inserts can break the web build.

### Demo Data Drift

The app currently feels richer than its real data because demo data fills gaps. That is useful for prototyping but dangerous if not clearly removed before production.

### Product Scope

Accounts, sync, real leagues, classroom mode, and teacher dashboards are implied by some content but not implemented. They should not be allowed to distract from the handwriting loop until grading and retention are proven.

## 19. Suggested Roadmap

### M0: Prove The Grader

- Run the structured Gemini grading spike with real handwriting samples.
- Decide whether per-character feedback is reliable.
- Decide whether stroke order can be graded, taught only, or removed from grading.

### M1: Real Backend Integration

- Implement or connect the structured `/api/check`.
- Keep Gemini keys server-side.
- Return target-aware, machine-readable grades.
- Preserve graceful fallback for offline/demo if desired.

### M2: Unify Free Write And Session Feedback

- Move free-write from legacy feedback to structured grading where possible.
- Let free-write optionally feed skill mastery without SRS scheduling.
- Replace full modal-only feedback with more inline writing-surface feedback.

### M3: Remove Demo Data

- Replace fake dashboard history with real first-run states.
- Replace weekly league with either real accounts or remove it.
- Replace AI coach bank with `/api/coach` or keep it explicitly as static practice sheets.
- Remove sample profile/account copy.

### M4: Content And Pedagogy

- Expand authored jamo, syllable, word, and sentence banks.
- Add model-glyph and stroke-order references.
- Add leveled generated sentence validation.
- Add better weak-skill taxonomy for common Hangul confusions.

### M5: Polish And Ship Readiness

- Complete denser/sharper design pass.
- Audit accessibility in light and dark modes.
- Finish i18n coverage.
- Add test coverage for scheduler, SRS, grade validation, database constraints, and critical UI flows.
- Add production privacy copy around saved writing and AI requests.

## 20. Success Metrics

Useful product metrics:

- Time to first written stroke.
- Session completion rate.
- Attempts per session.
- Retry rate after feedback.
- Percentage of due reviews completed.
- Mastery growth per item and per skill.
- D1 and D7 retention.
- Number of active writing days per week.
- Percentage of attempts reaching mastery after N retries.

Useful AI quality metrics:

- Recognition accuracy.
- Per-character agreement with human labels.
- Skill attribution agreement.
- JSON validity.
- Score correlation with human grading.
- Latency from Check to result.

## 21. File Map

Important project files:

- `PRODUCT.md` - high-level product, users, brand, accessibility.
- `DESIGN.md` - design system and visual rules.
- `docs/PRD-adaptive-learning-loop.md` - adaptive learning-loop PRD and status.
- `docs/M0-grading-spike.md` - AI grading spike plan.
- `app/_layout.tsx` - root Expo Router layout, fonts, DB warm-up.
- `app/(tabs)/_layout.tsx` - floating tab dock.
- `app/(tabs)/index.tsx` - Today hub.
- `app/(tabs)/practice.tsx` - free-write notebook.
- `app/(tabs)/settings.tsx` - settings.
- `app/session.tsx` - structured writing session.
- `components/writing-surface.tsx` - core Skia writing canvas.
- `components/ui.tsx` - shared UI primitives.
- `components/motion.tsx` - motion primitives.
- `components/canvas-card.tsx` - saved page thumbnails.
- `components/activity-calendar.tsx` - practice heatmap.
- `components/leaderboard.tsx` - demo league.
- `components/worksheet.tsx` - AI coach sheet renderer.
- `lib/database.ts` - SQLite persistence.
- `lib/learning.ts` - queue scheduler.
- `lib/srs.ts` - spaced repetition logic.
- `lib/generate.ts` - mock generated items.
- `lib/settings.ts` - local settings store.
- `lib/ink.ts` - shared ink renderer.
- `services/grading.ts` - structured target-aware grading.
- `services/check-writing.ts` - legacy free-write grading.
- `data/curriculum.ts` - authored learning items.
- `data/songul-content.ts` - website/marketing and legacy content.
- `data/demo-*.ts` - demo data.
- `i18n-source/*.json` - translation dictionaries.
- `constants/theme.ts` - design tokens.
- `constants/motion.ts` - motion tokens.
- `index.web.js` - web Skia bootstrap.
- `scripts/web-preview.mjs` - cross-origin-isolated web preview.
- `metro.config.js` - Metro web/wasm/isolation config.

## 22. Bottom Line

You are building a serious but warm Korean handwriting tutor. The differentiator is the handwriting loop: write real Hangul, get specific feedback on the writing, retry immediately, and let the app adapt what comes next.

The current codebase already has the app shell, visual identity, canvas engine, saved pages, session flow, local learning state, and web build strategy. The main remaining proof point is the real AI grading backend. Once that is reliable, the product can move from polished prototype to a genuinely adaptive handwriting tutor.
