# PRD — SonGul Adaptive Learning Loop

**Status:** Draft for review (from a grilling session, 2026-06-09)
**Owner:** TBD
**Register:** product (see `PRODUCT.md`) · **Design system:** `DESIGN.md`

> One-line: turn SonGul from a free-form "write and get a score" tool into an **adaptive Korean-handwriting tutor** built on a single repeated loop — *serve an item → write it by hand → get per-character feedback marked on your own writing → retry → mastery updates → schedule what's next* — and collapse the UI to a compact, canvas-first 3-tab app.

---

## 1. Why

Today the learning loop is thin and partly dishonest:
- Practice is a **free-form** canvas; the suggested prompt is shown on Home but **never sent to Practice or graded against**.
- `/api/check` receives **only the image** (`services/check-writing.ts`) and returns a **sentence-level** result (one `score`, free-text `issues[]`) — no machine-readable per-character/per-skill signal.
- "Lessons", "weak spots", quizzes, and vocab are **hardcoded constants**; nothing adapts. The dashboard fakes `3 today / 12-day streak / 92%` for empty databases (`lib/database.ts:144-150`).

Result: no real progression, no retention mechanism, no personalization. This PRD rebuilds the loop so practice is targeted, feedback is specific and actionable on the user's own writing, review is spaced and weak-spot-driven, and the IA is compact and modern.

## 2. Goals & non-goals

**Goals**
- A real **adaptive learning method**: curriculum spine + spaced repetition + per-character/per-skill mastery.
- A **focused writing experience**: target-driven canvas, adaptive scaffolding, inline correction.
- **Effective review**: write your due items + drill weak skills (not recognize flashcards).
- **Compact, modern** IA and visual design (3 tabs, canvas-first, denser/sharper warm-paper).

**Non-goals (this initiative)**
- Accounts / cloud sync (stays on-device), social/multiplayer, languages beyond Korean, voice/audio.
- Replacing the warm-paper brand or `PRODUCT.md` personality.

## 3. The learning model

### 3.1 Spine (progression)
A **hybrid** model: a curriculum path **jamo → syllables/words → sentences → free/diary**, advanced by clearing **per-skill mastery thresholds**, with **spaced-repetition** resurfacing weak items as review. Not a pure adaptive queue (needs visible milestones) and not linear-only (needs retention).

### 3.2 Mastery — two first-class layers
- **Items** — the writable units (jamo, syllable, word, sentence). Each carries an **SRS state** (ease, interval, due date, reps, lapses, mastery 0–1).
- **Skills** — a small fixed taxonomy updated from each attempt's breakdown: `shape`, `stroke_order`, `spacing`, `grammar`, plus named **confusions** (e.g. `bm` for ㅂ/ㅁ, `eunneun_spacing`, `badchim`). The **skill profile biases item selection** and powers the "trouble spots" surface.

SRS schedules **items**; the **skill profile** decides which new items to introduce and which drills to inject.

### 3.3 Content
**Authored base + AI-generated.** Hand-author the foundation where order matters (jamo set, core syllables, a seed word/sentence bank with skill tags, **stroke-order + model-glyph data**). Use the server/Gemini to **generate fresh sentence items that target the learner's weak skills** at higher levels and for review variety. Grading-against-target still works because the app knows what it served.

## 4. The feedback signal (server contract change)

The single most important dependency. `/api/check` must become **target-aware** and return a **structured breakdown**.

**Request**
```jsonc
POST /api/check
{ "image": "<base64>", "target": "학교에 가요.", "itemType": "sentence", "skills": ["spacing","grammar"] }
```
**Response**
```jsonc
{
  "score": 0-100,
  "recognized": "…", "correction": "…", "grammarTip": "…", "recommendation": "…",
  "perCharacter": [ { "index": 0, "char": "학", "ok": true, "shapeOk": true, "strokeOrderOk": false, "issues": ["stroke_order"] }, … ],
  "perSkill": { "shape": 0-100, "strokeOrder": 0-100, "spacing": 0-100, "grammar": 0-100 }
}
```
Model glyphs / canonical stroke order come from **authored content**, not necessarily the API. The client must keep working if `perCharacter`/`perSkill` are absent (graceful downgrade to today's behavior).

> ⚠️ This endpoint + the Gemini prompt live **outside this repo**. UI/data work can proceed against a **mock**, but the real loop is blocked on whoever owns the server.

## 5. Data model (on-device SQLite)

New/changed tables (extends `lib/database.ts`):
- `items` — `id, type(jamo|syllable|word|sentence), level, content, skill_tags(json), stroke_order_ref, source(authored|generated), created_at`.
- `item_srs` — `item_id, ease, interval_days, due_at, reps, lapses, mastery(0-1), last_score, updated_at`.
- `skill_mastery` — `skill_key, mastery(0-1), attempts, last_seen, updated_at`.
- `attempts` — `id, item_id(nullable for free-write), created_at, date_key, target, recognized, score, breakdown_json, strokes_json, scaffold_level`.
- Drop/repurpose `quiz_results` (recognition quizzes are leaving).

**Scheduler (`nextItem`)**: if due reviews exist → serve highest-priority due (most overdue / lowest mastery); else serve the next unlocked curriculum item; inject a **weak-skill drill** when a skill's mastery < threshold. A session = ~10–15 items mixing new + due, tied to `dailyGoal`. **SRS = lightweight SM-2/Leitner** with mastery thresholds (not full FSRS). `scaffold_level` is derived from item mastery/reps.

## 6. Screens & IA — collapse 5 tabs → **3**

**Tabs: Today · Progress · Settings.** The floating dock carries 3 items. The write/review canvas is a **full-screen route launched from Today**, not a tab.

- **Today (session hub)** — greeting; honest today's-progress; the **queue** ("8 to review · 3 new · drill: 받침"); one big **Start session**; **Free write** always one tap away. Replaces Home + the Practice/Review tabs as entry points.
- **Write session (route)** — target + **adaptive scaffold** (trace+stroke-order → reference → from memory, by mastery); canvas; slimmed tool rail; **Check → inline per-character annotation** on your writing (tap a marked char → skill issue + model shape); slim result bar; **retry-in-place → next**. Free-write variant = blank canvas, optional prompt, still graded + feeds the skill profile (not SRS-scheduled).
- **Progress** — **mastery map** (skill bars + jamo/character coverage heatmap) + streak + history. The reframed Dashboard; **no vanity/fake metrics**.
- **Settings** — consolidated; tool prefs (page format, eraser, pen-focus) move to the write-surface context where they belong; adaptive scaffolding largely replaces the manual `tracingGuide` toggle.

## 7. Writing experience (priority #1)

- **Target-driven**, graded against the served item.
- **Adaptive scaffolding that fades**: new/weak → traceable model + stroke-order guidance (numbered/animated); improving → reference beside canvas; mastered → from memory.
- **Inline on-canvas annotation** + **retry the same item in place**; no full-screen modal.
- **Free-write** always available (expression/motivation; the current app's strength), still gets feedback + updates the skill profile.

## 8. Effective review (priority #2)

- **Write-based SRS**: review = **write your due items** (scaffolding reduced to test recall), same inline feedback, updates SRS + skill profile.
- **Weak-skill drills** generated from the skill profile.
- Old multiple-choice quizzes / vocab flip-cards **fold into writing** (write the answer) or drop. You review handwriting by writing, not recognizing.

## 9. Design direction (modern + compact)

Evolve the warm paper-notebook system **denser + sharper**, keep the identity + tokens:
- Tighten the spacing scale; reduce card-in-card softness toward **structure/dividers**.
- **Make the writing canvas the hero**; sharpen the type hierarchy.
- Carry through the motion system (`components/motion.tsx`) and the a11y bar (WCAG 2.2 AA, both themes — note the dark `penText` fix and the app-wide pen-on-dark sweep are prerequisites).

## 10. Risks & open questions

1. **(Linchpin) Can the AI actually do this?** Everything hinges on Gemini returning reliable **structured per-character shape/stroke-order grading from a handwriting image**. Unproven. **Spike before committing.**
2. **Server ownership/timeline** — `/api/check` + Gemini prompt are external. Mock to unblock UI.
3. **Stroke-order / model-glyph data** — source an open Hangul stroke-order dataset; check licensing.
4. **Generation quality** — AI sentences must be correctly leveled, appropriate, and target the intended skill.
5. **Honest data migration** — remove the demo seed (`database.ts:144-150`); design a true first-run/empty state.
6. **Offline** — write offline, grade when online; cache content + SRS locally.

## 11. Phasing

- **M0 — De-risk spike (gate).** Prove Gemini can return structured `perCharacter` + `perSkill` + stroke-order grading from real handwriting images. If it can't, the model changes.
- **M1 — Contract + data model + scheduler.** Finalize the API shape; build the SQLite schema; seed the authored base (jamo + syllables + stroke-order + small sentence bank); implement `nextItem`. Mockable API.
- **M2 — Write-session vertical slice.** Target-driven canvas, adaptive scaffold, inline annotation, retry, SRS/skill update — **one item type end-to-end** (syllables), against mock then real signal. Proves the experience.
- **M3 — Today hub + 3-tab IA + honest data + first-run.**
- **M4 — Progress / mastery view.**
- **M5 — AI generation + content breadth + the denser/sharper design sweep across all screens + free-write polish.**

## 12. Success metrics

- Time-to-first-write (onboarding friction).
- % of attempts reaching mastery within N retries.
- Review adherence (due items cleared / due).
- Skill-mastery growth over time; curriculum advancement rate.
- D1 / D7 retention; daily session completion.

## 13. Decision log (from the grilling session)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Scope/depth | Deeper learning-loop rethink |
| 2 | Feedback signal | Extend the server contract (target + structured breakdown) |
| 3 | Progression | Hybrid: curriculum path + adaptive SRS review |
| 4 | Mastery unit | Items + skills, both first-class |
| 5 | Content source | Authored base + AI-generated targeted items |
| 6 | Feedback UX | Inline on-canvas per-character annotation + retry-in-place |
| 7 | Scaffolding | Adaptive, fades with mastery (trace/stroke-order → reference → memory) |
| 8 | Review model | Write-based SRS (Practice + Review converge) |
| 9 | Navigation/IA | 3 tabs: Today · Progress · Settings; write session as a launched route |
| 10 | Free-write | Guided queue + free-write always available |
| 11 | Design | Evolve warm-paper: denser + sharper, canvas as hero |

## 14. Implementation status (2026-06-09)

Built against the mock grader, typecheck-clean, verified in the web preview.

- **M0 ✅** — `types/songul.ts` (GradeResult), `services/grading.ts` (gradeWriting + mock + graceful downgrade), `docs/M0-grading-spike.md`.
- **M1 ✅** — `data/curriculum.ts` (59 authored items), `lib/srs.ts` (SM-2), schema + persistence + scheduler (`lib/database.ts`, `lib/learning.ts`).
- **M2 ✅** — `app/session.tsx`: target-driven canvas, adaptive trace scaffold, inline graded annotation, retry/next, SRS+skill updates. Verified end-to-end.
- **M3 ✅** — 3 tabs (Today · Progress · Settings), `app/(tabs)/index.tsx` Today hub, `/practice` kept as free-write route, Review removed, demo data killed.
- **M4 ✅** — `app/(tabs)/dashboard.tsx` rebuilt as the mastery view (path + skill bars + recent activity from real data).
- **M5 ◑** — AI generation mock wired (`lib/generate.ts`, activates at the sentence level); app-wide dark `penText` a11y sweep done. **Remaining:** the fine-grained "denser/sharper" visual densification across every screen (the structural compact/modern IA is done; per-screen density polish is an ongoing pass), the legacy free-write screen still uses the old recognize-and-modal flow, and content breadth is the seed corpus only.

### Critical platform constraint discovered (keep in mind)
The expo-sqlite **web** sync bridge (SharedArrayBuffer) **times out on burst/large inserts**, **mangles quoted values**, and **corrupts on Korean (multibyte) `SELECT *`**. Resolution, now load-bearing: authored/generated **items live in memory** (the DB stores only ASCII/numeric **state** — SRS, skills, attempt counts), item **ids are ASCII**, seeding is **async** + bulk, and `execSync` schema is **split** into small chunks. Do not `SELECT *` Korean content via the sync API.

### Still open (external / follow-up)
- The **M0 Gemini spike** (`docs/M0-grading-spike.md`) — run with real credentials; then point `EXPO_PUBLIC_SONGUL_API_BASE_URL` at the structured endpoint to replace the mock.
- Dead code from the rewrite (unused `getDashboardSnapshot`/`useDashboardSnapshot`, marketing exports in `data/songul-content.ts`, the vestigial `items` SQLite table) can be pruned.
