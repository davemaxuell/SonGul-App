---
name: SonGul
description: A warm paper-notebook Korean handwriting tutor for tablet.
colors:
  paper: "#FBF6E9"
  paper-2: "#F4ECD7"
  surface: "#FFFDF6"
  pen: "#3F51D6"
  pen-deep: "#3343C0"
  pen-100: "#E7E9FB"
  pen-50: "#F2F3FD"
  navy: "#23244D"
  ink: "#2E2C25"
  ink-soft: "#645F52"
  ink-faint: "#8B8575"
  line: "#E7DFCB"
  grid: "#E4D9BE"
  grid-soft: "#EEE6D2"
  margin: "#CE7B72"
  green: "#3F9B66"
  gold: "#E0922B"
  danger: "#C8463B"
  teal: "#2FA8A8"
  pink: "#E0719C"
  white: "#FFFFFF"
  dark-bg: "#15162B"
  dark-surface: "#1E2039"
  dark-line: "#343761"
  dark-ink: "#ECEAF6"
  dark-ink-soft: "#B7B5CC"
typography:
  display:
    fontFamily: "Poppins, 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "42px"
    fontWeight: 800
    lineHeight: 1.28
    letterSpacing: "0"
  headline:
    fontFamily: "Poppins, 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "25px"
    fontWeight: 800
    lineHeight: 1.28
  title:
    fontFamily: "Inter, 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.28
  body:
    fontFamily: "Inter, 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.28
  label:
    fontFamily: "Inter, 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.28
    letterSpacing: "0.5px"
  metric:
    fontFamily: "Poppins, 'Noto Sans KR', system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.28
  korean:
    fontFamily: "'Noto Sans KR', Inter, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.28
rounded:
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "30px"
  full: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "34px"
components:
  button-primary:
    backgroundColor: "{colors.pen}"
    textColor: "{colors.white}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "48px"
  button-primary-pressed:
    backgroundColor: "{colors.pen}"
    textColor: "{colors.white}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.white}"
    rounded: "{rounded.full}"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  pill:
    backgroundColor: "{colors.pen-50}"
    textColor: "{colors.pen}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "7px 12px"
  metric-tile:
    backgroundColor: "{colors.pen-50}"
    textColor: "{colors.pen}"
    rounded: "{rounded.md}"
    padding: "16px"
  tab-dock:
    backgroundColor: "{colors.navy}"
    rounded: "{rounded.full}"
    height: "64px"
  toggle-on:
    backgroundColor: "{colors.pen}"
    rounded: "{rounded.full}"
  toggle-off:
    backgroundColor: "{colors.line}"
    rounded: "{rounded.full}"
---

# Design System: SonGul

## 1. Overview

**Creative North Star: "The Hand and the Page"**

SonGul is a tablet where a learner writes Korean by hand, so the whole system bends toward one act: pen meeting paper. The page is warm cream (#FBF6E9), the ink is a single confident blue (#3F51D6), and everything else, the dashboard, the review cards, the settings, is the quiet margin around that act. Depth is carried by soft warm shadows, as if a sheet were lifting off a desk, never by cool drop-shadows or glass. The mood is a patient tutor's notebook: unhurried, legible, bilingual by default, with Korean and English sitting as equals on the same ruled line.

This system rejects two things by name. It is **not a generic SaaS dashboard**: no cool navy-and-grey corporate chrome, no KPI-card-template coldness, no "metrics for managers." The dashboard here is a learner's progress journal, warm and personal. And it is **not childish ed-tech**: no primary-color sticker soup, no cartoon gradients, no gamified carnival. Friendliness comes from warmth and the mascot, never from juvenility; the typography and layout stay grown-up and trustworthy.

The page is sacred. Practice is full-bleed warm paper with the tools floating aside in a rail that recedes until summoned. Chrome earns its presence only when it serves the stroke.

**Key Characteristics:**
- Warm paper world: every surface, border, and shadow tints toward the paper hue, never cool.
- One pen: #3F51D6 is the single action color, used for primary actions, active state, and selection only.
- Restraint with warmth: calm density, generous whitespace, friendliness from color temperature and copy rather than decoration.
- Bilingual equals: Hangul and Latin share the scale; Korean legibility is first-order.
- Soft lift, not hard shadow: warm brown-tinted elevation, flat at rest.

## 2. Colors

A warm paper palette: cream surfaces and warm-neutral ink, with a single saturated pen-blue carrying every action and three muted semantics for feedback.

### Primary
- **Pen Blue** (#3F51D6): The one action and brand color. Primary buttons, active tab, current selection, links, the active chart bar, progress fill, focus ring. Its rarity is the point; it should never be decorative.
- **Pen Deep** (#3343C0): Pressed/hover depth for pen surfaces.
- **Pen Tint** (#F2F3FD `pen-50`) and **Pen Track** (#E7E9FB `pen-100`): The faint pen washes. `pen-50` fills tinted chips and metric tiles; `pen-100` is the inactive track behind chart bars and progress bars in light mode (it darkens to #2D3066 in dark mode so the track never inverts).

### Secondary
- **Navy** (#23244D): Dark chrome and contrast surfaces, the floating tab dock, tooltips, modal scrims. Never used as a text/value color on a dark background (it disappears).

### Tertiary (feedback semantics)
- **Encouraging Green** (#3F9B66): Success, high scores, "goal complete."
- **Warm Gold** (#E0922B): Attention, streak/goal nudges, "keep writing," test-build markers.
- **Correction Red** (#C8463B): Errors and destructive actions only. Always paired with text or icon, never color alone.
- **Study Teal** (#2FA8A8) and **Ink Magenta** (#E0719C): Two extra accents for variety, the fourth metric tile and a writing-ink option. Both are mid-tones chosen to read in light and dark.

### Neutral
- **Paper** (#FBF6E9): The app body background. The warm cream that names the whole system.
- **Paper 2** (#F4ECD7): Alt surface and pressed states (vocabulary tiles, section blocks).
- **Surface** (#FFFDF6): Card and panel fill, a warm off-white, never pure white.
- **Ink** (#2E2C25): Primary text. Warm near-black, ~13.5:1 on Surface.
- **Ink Soft** (#645F52): Secondary/muted text. ~6:1 on Surface; meets AA, never lighter.
- **Ink Faint** (#8B8575): Tertiary text and empty-state captions only.
- **Line** (#E7DFCB): Borders and dividers. **Grid** (#E4D9BE) and **Grid Soft** (#EEE6D2): notebook ruling on the writing surface. **Margin** (#CE7B72): the red margin rule.
- **Dark set**: Bg #15162B, Surface #1E2039, Line #343761, Ink #ECEAF6, Ink Soft #B7B5CC. The dark theme is desaturated and tonal, not an inversion.

### Named Rules
**The Warm Paper Rule.** Every surface, border, and shadow tints warm, toward the paper hue. A cool grey or blue-white anywhere (#F8FAFF, #EEF3FF, #DDE4F2, #BBC8F7) is a regression, not a choice.

**The One Pen Rule.** #3F51D6 is the only action/brand color. Primary buttons, active nav, current selection, links, focus. It is never used for decoration, and no second saturated blue is introduced to "balance" it.

## 3. Typography

**Display Font:** Poppins (target) with `Noto Sans KR`, `system-ui` fallback.
**Body Font:** Inter (target) with `Noto Sans KR`, `system-ui` fallback.
**Korean Font:** `Noto Sans KR`.

**Character:** A clean geometric display over a neutral humanist body, warm but grown-up, never decorative. Note: the Poppins/Inter/Gaegu `.ttf` files are not yet bundled, so the app currently renders the `system-ui` fallback; the families above are the design intent and the target to wire via `expo-font`.

### Hierarchy
- **Display** (800, 42px, 1.28): Hero lockup on the Home overview only.
- **Headline** (800, 25px, 1.28): Screen and card titles ("Weekly progress", "Vocabulary bank").
- **Title** (800, 18px, 1.28): Sub-titles, list-item leads, lesson names.
- **Body** (500, 15px, 1.28): All running text and descriptions. Cap prose at 65–75ch.
- **Label** (700, 12px, 0.5px tracking, UPPERCASE): Eyebrow pills and metric captions. The only place caps and tracking are allowed.
- **Metric** (800, 34px, tabular-nums): Big numbers on dashboard tiles and scores. Always tabular figures so values don't jitter.
- **Korean** (800, 28px): Recognized Hangul and vocabulary fronts; sized larger than Latin body so strokes stay legible.

### Named Rules
**The Bilingual Equals Rule.** Korean and the learner's language share scale and weight on the same line; neither is shrunk, greyed, or treated as a parenthetical. Korean glyphs may be sized up for stroke clarity, never down.

**The System-Sans Rule.** One sans carries everything: headings, buttons, labels, body, data. No display or script face appears in UI labels, buttons, or numeric data.

## 4. Elevation

Surfaces are nearly flat and rest on a **warm**, brown-tinted shadow, as if paper on a desk. Cool or black drop-shadows are forbidden; they read as SaaS, not paper. Cards sit on the smallest lift; only genuinely floating chrome (the tab dock, the practice tool rail, modals) earns deeper elevation.

### Shadow Vocabulary
- **sh-sm** (`box-shadow: 0 2px 8px rgba(80, 66, 30, 0.07)`): Cards and panels at rest.
- **sh** (`box-shadow: 0 14px 34px rgba(80, 66, 30, 0.12)`): Raised surfaces.
- **sh-lg** (`box-shadow: 0 30px 60px rgba(60, 48, 20, 0.18)`): Floating chrome and modals.
- The tab dock uses a navy-tinted lift (`0 16px 36px rgba(35, 36, 77, 0.30)`) because it floats over warm paper as a dark object.

### Named Rules
**The Warm Lift Rule.** Shadow color is always warm (rgba(80,66,30) family), never grey or pure black. If a shadow looks cool or hard-edged, it's wrong.

## 5. Components

### Buttons
- **Shape:** Fully rounded pills (radius 999px), minimum height 48px, horizontal padding 24px.
- **Primary:** Pen Blue (#3F51D6) fill, white label (weight 800). The single most important action per screen.
- **Pressed:** Opacity drops to ~0.78; no layout shift.
- **Ghost:** Transparent fill, Line border (#E7DFCB), Ink label. Secondary actions.
- **Danger:** Correction Red (#C8463B) fill, white label. Destructive only, visually separated from the primary action.

### Chips (Pills)
- **Style:** Tinted by tone: background = tone at ~10% alpha, border = tone at ~33% alpha, label = full tone in Label type. Tones: pen (default), green, gold, pink.
- **Use:** Eyebrows ("LEARNING TRACKER"), status ("12 DAY STREAK"), filters, and quiz/goal selectors. Tappable pills must still meet 44pt hit areas.

### Cards / Containers
- **Corner Style:** 20px (rounded.lg).
- **Background:** Surface (#FFFDF6); alt/pressed surfaces use Paper 2 (#F4ECD7).
- **Shadow Strategy:** sh-sm at rest (see Elevation). Never nested cards.
- **Border:** 1px Line (#E7DFCB), warm.
- **Internal Padding:** 24px (spacing.lg), 16px gap between children.

### Metric Tile (signature)
- A learning stat, not a SaaS KPI card. Background = its accent tone at ~8% alpha, border = the same tone at ~20%, value in the accent tone (Metric type, tabular), caption in Ink Soft. Tones rotate pen / gold / green / teal so the dashboard reads as a warm journal.
- **Dark-mode rule:** the value color must read on the dark tile. Mid-tones (pen, green, gold, teal) pass; dark hues (navy) do not, never tone a metric value with navy.

### Inputs / Toggles / Fields
- **Quiz options / list rows:** Surface fill, 1px Line border, ~14px radius, pressed state shifts to Paper 2. Min height 54px.
- **Toggle:** Pen Blue (#3F51D6) track when on, Line track when off, white knob, 56×32px. Whole row is the tap target (≥68px).
- **Focus:** Pen focus ring `0 0 0 3px rgba(63, 81, 214, 0.35)` on keyboard focus.

### Navigation (signature: the floating dock)
- A navy (#23244D) pill that floats over warm paper, full-width up to 430px, height 58–64px, with a soft warm-white rim (`rgba(255,253,246,0.16)`). The active tab is a Pen Blue circle that springs between positions; the active icon is white, inactive icons are Ink Soft / Dark Ink Soft. Max 5 destinations, icon + spring indicator. Respects the bottom safe area.

### Writing Surface (signature)
- Full-bleed warm paper (Surface in blank/grid/hangul, Paper 2 warmth in lined). Notebook guides drawn in Grid / Grid Soft; lined, grid, and Hangul formats. Tools live in a floating left rail with a warm-glass fill (`rgba(255,253,246,0.94)`) and pen-tinted active states. Empty state in Ink Faint, bilingual. The page is the focus; the rail recedes.

## 6. Do's and Don'ts

### Do:
- **Do** keep every surface, border, and shadow warm (paper hue). Body is #FBF6E9; cards are #FFFDF6; borders are #E7DFCB.
- **Do** reserve Pen Blue (#3F51D6) for actions, active state, and selection only (the One Pen Rule).
- **Do** verify contrast in **both** light and dark themes independently. Body text ≥4.5:1, large/bold ≥3:1. Bump toward Ink before going lighter.
- **Do** pair every semantic color with text or an icon (score, error, success), never color alone.
- **Do** use warm, brown-tinted shadows (rgba(80,66,30) family) and flat-at-rest surfaces.
- **Do** size Korean for stroke legibility and keep it equal to Latin in hierarchy.
- **Do** keep ≥44pt touch targets and provide reduced-motion fallbacks (crossfade/instant) for every animation.

### Don't:
- **Don't** let it read as a **generic SaaS / analytics dashboard**: no cool navy-and-grey corporate chrome, no KPI-card template, no "metrics for managers" coldness.
- **Don't** drift **childish / cartoonish**: no primary-color sticker soup, no cartoon gradients, no gamified carnival. Educational and credible, not juvenile.
- **Don't** introduce cool greys or blue-whites anywhere (#F8FAFF, #EEF3FF, #DDE4F2, #BBC8F7, cool rgba shadows). They are the pre-realign regression.
- **Don't** tone a metric value (or any text) with Navy in dark mode, it vanishes into the background. Use a mid-tone.
- **Don't** gamify encouragement into a slot machine; streaks and goals are warm and quiet, not loud rewards.
- **Don't** put display/script fonts in UI labels, buttons, or numeric data; one sans carries all of it.
- **Don't** reinvent standard affordances (custom scrollbars, weird toggles, modal-first flows). Earned familiarity wins; modals are a last resort.
- **Don't** nest cards or use cool/black hard drop-shadows; if a shadow looks like 2014 SaaS, it's wrong.
