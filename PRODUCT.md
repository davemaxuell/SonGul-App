# Product

## Register

product

## Users

Korean-language learners, roughly beginner through intermediate, practicing Hangul **handwriting** on a tablet with a stylus. Their context is a focused practice session: at a desk or on the move, sometimes in the evening (dark mode is a first-class state), often a few minutes at a time against a daily goal. The job to be done is concrete and physical: write Korean by hand, find out exactly what was wrong with the strokes/shape/grammar, and get pointed at the next thing to practice. They are studying, not browsing; the interface is a tool in their hands, not content to consume.

## Product Purpose

SonGul (손글, "hand-writing") turns a tablet into a Korean handwriting tutor. A learner writes Hangul on a full-bleed writing surface; the app captures the strokes, recognizes the writing, and returns AI feedback on letter shape, stroke order, spacing, and grammar, then recommends the next exercise. Around that core loop sit a progress dashboard (accuracy, streaks, weekly trend, daily goal), a review mode (grammar quizzes, vocabulary cards, recent activity), and per-device settings (language, goal, tracing guides, pen-focus, dark mode). It runs offline-capable with a server-side AI check; no account or cloud sync in this build. Success looks like a learner whose Hangul gets measurably more accurate and who comes back tomorrow.

## Brand Personality

Warm, encouraging, patient. The voice is a supportive tutor sitting beside the learner, not an examiner: it notices effort, names mistakes plainly and kindly, and always frames the next attempt. Visually this is a warm paper-notebook world (cream paper, ink-blue pen, gentle warm shadows) with a friendly mascot, bilingual Korean/English throughout. Emotional goals: mistakes feel safe, progress feels visible, practice feels calm rather than pressured.

## Anti-references

- **Generic SaaS / analytics dashboard.** No cool navy-and-grey corporate chrome, no KPI-card-template feel, no "metrics for managers" coldness. The dashboard is a learner's progress journal, not a business report.
- **Childish / cartoonish ed-tech.** Educational and credible, not juvenile. No primary-color sticker soup, no cartoon gradients, no gamified carnival. The mascot and warmth carry friendliness; the typography and layout stay grown-up and trustworthy.

## Design Principles

- **The writing surface is sacred.** The core task (Practice) gets the most space and the least chrome. Tools recede into a floating rail until summoned; nothing competes with the act of writing.
- **Feedback teaches, it doesn't grade.** Corrections are specific and actionable (what to fix, why, what's next), framed to invite the next attempt. A score is context, never a verdict.
- **Earned familiarity over novelty.** Standard app affordances (bottom tabs, toggles, sheets, modals) behave exactly as a fluent tablet user expects. The tool disappears into the task; surprise is reserved for small moments, not whole screens.
- **Encouragement is structural.** Streaks, goals, and weekly progress are visible and warm, celebrating consistency without turning practice into a slot machine.
- **Bilingual and legible by default.** Korean and the learner's language sit together as equals; Hangul stroke clarity and CJK legibility are treated as first-order typography, not an afterthought.

## Accessibility & Inclusion

Target **WCAG 2.2 AA**. Body text ≥4.5:1 and large/bold text ≥3:1 against its surface, verified in **both light and dark themes** independently (dark-mode accent legibility is a known risk for tinted metric tiles). Visible focus and clear pressed/disabled states on every interactive control. Touch targets ≥44pt with adequate spacing; expand hit areas for small rail icons. Honor reduced-motion with crossfade/instant fallbacks, and support OS dynamic-type scaling without truncation or layout breakage. Provide descriptive accessibility labels for icon-only buttons and the writing tools. Never rely on color alone for meaning (pair score/state color with text or icon). Hangul legibility (stroke separation, generous sizing for Korean glyphs) is an explicit inclusion goal.
