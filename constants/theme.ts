// Design tokens mirrored from the SonGul web UI (../SonGul-Web-UI: styles.css /
// dashboard.css :root). The brand is a warm "paper notebook" system, so keep
// these values in sync with the web's CSS custom properties. The mapping to each
// --css-var is noted inline. Existing token keys are preserved (some are aliases)
// so screens that import them keep working.

export const colors = {
  // ---- Paper & surfaces (warm) ----
  paper: "#FBF6E9", // --paper       app screen background
  paper2: "#F4ECD7", // --paper-2     alt section block
  surface: "#FFFDF6", // --surface     cards
  surfaceAlt: "#F4ECD7", // --paper-2  subtle alt surface / pressed states
  paperWarm: "#FBF0DC", // --warm-50   warm lined-paper tint

  // ---- Notebook lines ----
  grid: "#E4D9BE", // --grid
  gridSoft: "#EEE6D2", // --grid-soft
  line: "#E7DFCB", // --line
  border: "#E7DFCB", // alias of --line (kept for existing refs)
  margin: "#CE7B72", // --margin      red notebook margin rule

  // ---- Ink (warm neutrals) ----
  ink: "#2E2C25", // --ink
  inkMuted: "#645F52", // --ink-soft
  inkSoft: "#8B8575", // --ink-faint  (faintest)

  // ---- Brand / action ----
  pen: "#3F51D6", // --pen
  penDark: "#3343C0", // --pen-600
  pen100: "#E7E9FB", // --pen-100     tint: chart track, progress track, stat border
  pen50: "#F2F3FD", // --pen-50       tint: stat background
  navy: "#23244D", // --navy        tooltips, dark chrome

  // ---- Semantic ----
  green: "#3F9B66", // --green
  green50: "#EAF5EE", // --green-50
  gold: "#E0922B", // --warm
  gold50: "#FBF0DC", // --warm-50
  danger: "#C8463B", // --red
  danger50: "#FBEAE7", // --red-50

  // ---- Decorative accents (no direct web token) ----
  pink: "#E0719C", // magenta writing ink / focus pills
  teal: "#2FA8A8", // 4th-metric accent

  white: "#FFFFFF",

  // ---- Dark theme (dashboard.css html.dark block) ----
  darkBg: "#15162B", // dark --paper
  darkSurface: "#1E2039", // dark --surface
  darkSurfaceAlt: "#1B1D36", // dark --paper-2
  darkBorder: "#343761", // dark --line
  darkText: "#ECEAF6", // dark --ink
  darkMuted: "#B7B5CC", // dark --ink-soft
  darkPen50: "#23264F", // dark --pen-50
  darkPen100: "#2D3066", // dark --pen-100  tint: chart/progress track in dark mode
  penOnDark: "#9AA4EC", // pen lightened for AA text/icon contrast on dark surfaces (~6.7:1 on #1E2039)
};

export const radii = {
  sm: 10,
  md: 14, // --radius
  lg: 20, // --radius-lg (dashboard cards)
  xl: 30, // --radius-xl
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 34,
};

// Warm-tinted elevation scale, mirroring --sh-sm / --sh / --sh-lg. Each entry is
// spreadable into a React Native style object (RN 0.76+ supports `boxShadow`).
export const shadow = {
  sm: { boxShadow: "0 2px 8px rgba(80, 66, 30, 0.07)" }, // --sh-sm
  md: { boxShadow: "0 14px 34px rgba(80, 66, 30, 0.12)" }, // --sh
  lg: { boxShadow: "0 30px 60px rgba(60, 48, 20, 0.18)" }, // --sh-lg
} as const;

// Focus ring (--ring), e.g. for keyboard focus / active outlines.
export const ring = "0 0 0 3px rgba(63, 81, 214, 0.35)";

// Font-family stacks from the web (--f-display / --f-body / --f-ko / --f-hand).
// The real files now ship via @expo-google-fonts/* and are loaded in
// app/_layout.tsx before first render. expo-font registers each weight as its
// own family name, so weight selection happens by family (don't also set
// fontWeight on top of these — browsers would synthesize bold-on-bold).
export const fonts = {
  display: 'Poppins, "Noto Sans KR", system-ui, sans-serif',
  body: 'Inter, "Noto Sans KR", system-ui, sans-serif',
  ko: '"Noto Sans KR", Inter, sans-serif',
  hand: 'Gaegu, "Noto Sans KR", cursive',
};

const loadedFamilies = {
  display: "Poppins_800ExtraBold",
  bodyMedium: "Inter_500Medium",
  bodyBold: "Inter_700Bold",
  bodyExtra: "Inter_800ExtraBold",
  korean: "NotoSansKR_700Bold",
  hand: "Gaegu_400Regular",
  handBold: "Gaegu_700Bold",
} as const;

// On web a comma-separated stack lets missing glyphs (e.g. Hangul inside a
// Poppins headline) fall through to the bundled Korean face instead of the
// browser default. Native font props take a single name, and the OS handles
// glyph fallback itself.
function withFallback(family: string) {
  return process.env.EXPO_OS === "web"
    ? `${family}, NotoSansKR_700Bold, "Noto Sans KR", system-ui, sans-serif`
    : family;
}

export const families = {
  display: withFallback(loadedFamilies.display),
  bodyMedium: withFallback(loadedFamilies.bodyMedium),
  bodyBold: withFallback(loadedFamilies.bodyBold),
  bodyExtra: withFallback(loadedFamilies.bodyExtra),
  korean: withFallback(loadedFamilies.korean),
  hand: process.env.EXPO_OS === "web" ? 'Gaegu_400Regular, "Gaegu", cursive' : loadedFamilies.hand,
  handBold: process.env.EXPO_OS === "web" ? 'Gaegu_700Bold, "Gaegu", cursive' : loadedFamilies.handBold,
} as const;

// Animation easing from the web (--ease) for any web-targeted CSS transitions.
export const ease = "cubic-bezier(0.22, 0.85, 0.25, 1)";
