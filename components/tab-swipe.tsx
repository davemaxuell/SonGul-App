// Swipe left/right anywhere on a tab screen to move between menus, the way a
// fluid tablet app behaves. Pointer-based (no extra gesture dependency): a
// quick, mostly-horizontal drag triggers navigation; vertical scrolling and
// taps never qualify. Screens that own horizontal gestures (the saved-pages
// shelf) wrap themselves in <TabSwipeExclude> so their pans stay theirs.
// The Write tab deliberately has no swipe — every drag there is ink.
import { useRouter } from "expo-router";
import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { View, type PointerEvent, type ViewStyle } from "react-native";

import { setScreenTransitionDirection } from "@/components/motion";

const SWIPE_MIN_X = 72; // px of horizontal travel
const SWIPE_MAX_Y = 52; // tolerated vertical drift
const SWIPE_MAX_MS = 600; // must be a flick, not a slow drag

const BlockContext = createContext<{ block: () => void } | null>(null);

export function TabSwipe({
  swipeLeftTo,
  swipeRightTo,
  children,
}: {
  /** Route to open when the user swipes leftward (revealing the menu to the right). */
  swipeLeftTo?: string;
  /** Route to open when the user swipes rightward (revealing the menu to the left). */
  swipeRightTo?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const gesture = useRef<{ id: number; x: number; y: number; t: number; blocked: boolean } | null>(null);
  const blocked = useRef(false);
  const context = useMemo(() => ({ block: () => { blocked.current = true; } }), []);

  function handleDown(event: PointerEvent) {
    const native = event.nativeEvent as unknown as { pointerId: number; clientX?: number; clientY?: number; offsetX: number; offsetY: number };
    // A second concurrent pointer (a resting palm, a two-finger touch) is
    // never a tab swipe: poison the whole gesture rather than re-anchor it.
    if (gesture.current !== null) {
      gesture.current = null;
      blocked.current = false;
      return;
    }
    // Children (TabSwipeExclude) bubble before us, so the flag is already set.
    gesture.current = {
      id: native.pointerId,
      x: native.clientX ?? native.offsetX,
      y: native.clientY ?? native.offsetY,
      t: Date.now(),
      blocked: blocked.current,
    };
    blocked.current = false;
  }

  function handleUp(event: PointerEvent) {
    const native = event.nativeEvent as unknown as { pointerId: number; clientX?: number; clientY?: number; offsetX: number; offsetY: number };
    const start = gesture.current;
    if (!start || start.id !== native.pointerId) return; // only the anchoring pointer may complete the swipe
    gesture.current = null;
    if (start.blocked) return;
    const dx = (native.clientX ?? native.offsetX) - start.x;
    const dy = (native.clientY ?? native.offsetY) - start.y;
    if (Date.now() - start.t > SWIPE_MAX_MS || Math.abs(dy) > SWIPE_MAX_Y || Math.abs(dx) < SWIPE_MIN_X) return;
    const href = dx < 0 ? swipeLeftTo : swipeRightTo;
    if (href) {
      // The incoming menu slides in from the side the finger traveled toward.
      setScreenTransitionDirection(dx < 0 ? "fromRight" : "fromLeft");
      router.navigate(href as never);
    }
  }

  return (
    <BlockContext.Provider value={context}>
      <View
        style={[
          { flex: 1 },
          // pan-y: vertical scrolling stays native, but horizontal drags keep
          // their pointer stream (no pointercancel), so the swipe can complete.
          // Nested horizontal scrollers (the shelf) still pan natively — the
          // touch-action walk stops at the nearest scroll container owning the
          // axis — and a native scroll's pointercancel clears the gesture here.
          process.env.EXPO_OS === "web" ? ({ touchAction: "pan-y" } as unknown as ViewStyle) : null,
        ]}
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerCancel={() => {
          gesture.current = null;
        }}
      >
        {children}
      </View>
    </BlockContext.Provider>
  );
}

/** Wrap horizontally-scrolling children so their pans never switch tabs. */
export function TabSwipeExclude({ children }: { children: ReactNode }) {
  const context = useContext(BlockContext);
  return <View onPointerDown={() => context?.block()}>{children}</View>;
}
