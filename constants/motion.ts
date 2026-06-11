// Motion tokens for SonGul. Mirrors the DESIGN.md "Elevation/Motion" intent:
// product-register timing (150-300ms for most state changes), the --ease curve,
// and spring physics with minimal overshoot (no bounce/elastic). Single source
// so every animation shares one rhythm. Consumed by components/motion.tsx and
// the screens via react-native-reanimated.
import { Easing } from "react-native-reanimated";

// Durations (ms). Exits run ~75% of their entrance for a responsive feel.
export const duration = {
  press: 110, // finger-down acknowledgement
  micro: 180, // small state changes (color, opacity)
  state: 240, // toggles, selection, reveals
  screen: 280, // tab/menu switches (ScreenTransition)
  enter: 360, // mount entrances (dashboard data reveal)
  exit: 200, // ~75% of enter; modal/sheet dismissal
} as const;

// Spring configs (Reanimated physical springs). Damping kept high enough to
// avoid visible bounce while still feeling alive.
export const spring = {
  // Snappy selection/press feedback. Mirrors the practice tool-rail spring.
  selection: { damping: 18, stiffness: 240, mass: 0.7 },
  // Travelling indicators / knobs. Mirrors the tab-indicator spring.
  indicator: { damping: 21, stiffness: 230, mass: 0.8 },
  // Softer settle for larger surfaces (cards, sheets).
  gentle: { damping: 22, stiffness: 190, mass: 0.9 },
} as const;

// Easing curves. `standard` is the web --ease (cubic-bezier(.22,.85,.25,1));
// `out` is ease-out-expo for confident entrances.
export const easing = {
  standard: Easing.bezier(0.22, 0.85, 0.25, 1),
  out: Easing.bezier(0.16, 1, 0.3, 1),
} as const;

// Press-feedback amounts.
export const press = {
  scale: 0.96, // buttons, chips
  cardScale: 0.985, // large surfaces (subtler)
  dim: 0.92, // opacity on press
} as const;

// List entrance stagger. Capped so a full list never exceeds ~270ms of lead-in.
export const stagger = {
  step: 45, // per-item delay (ms)
  max: 6, // items past this share the last delay (avoid long tails)
  rise: 10, // translateY start offset (px)
} as const;

export function staggerDelay(index: number) {
  "worklet";
  return Math.min(index, stagger.max) * stagger.step;
}
