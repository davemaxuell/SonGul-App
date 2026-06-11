// GitHub-style practice calendar: one square per day, columns are weeks,
// intensity climbs a pen-blue ramp (the One Pen Rule — activity is an action).
// Tapping a square reads out its day; the week count adapts to the card width.
import { useMemo, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";

import { PressableScale } from "@/components/motion";
import { AppText, Card, usePalette } from "@/components/ui";
import { colors, families, spacing } from "@/constants/theme";

const CELL = 13;
const GAP = 3;
const STEP = CELL + GAP;
const DAY_MS = 86_400_000;
const MAX_WEEKS = 26;
const MIN_WEEKS = 12;

// Intensity ramps tuned per scheme (alpha tints of solid pen go muddy on dark).
const LIGHT_RAMP = ["#EEE6D2", `${colors.pen}2E`, `${colors.pen}59`, `${colors.pen}94`, colors.pen];
const DARK_RAMP = ["#2D3066", `${colors.penOnDark}3D`, `${colors.penOnDark}73`, `${colors.penOnDark}A6`, colors.penOnDark];

function level(count: number) {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 8) return 3;
  return 4;
}

function dayKey(date: Date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0); // noon: timezone shifts can't move the day
  return d.toISOString().slice(0, 10);
}

type Cell = { key: string; date: Date; count: number; future: boolean };

export function ActivityCalendar({ counts }: { counts: Map<string, number> }) {
  const palette = usePalette();
  const ramp = palette.settings.darkMode ? DARK_RAMP : LIGHT_RAMP;
  const [gridWidth, setGridWidth] = useState(0);
  const [selected, setSelected] = useState<Cell | null>(null);

  const weeks = Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, Math.floor((gridWidth - 30) / STEP)));

  const { columns, months, total } = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const startSunday = new Date(today.getTime() - (today.getDay() + (weeks - 1) * 7) * DAY_MS);

    const columns: Cell[][] = [];
    const months: { index: number; label: string }[] = [];
    let total = 0;
    let lastMonth = -1;
    let lastLabelIndex = -10;
    for (let w = 0; w < weeks; w += 1) {
      const column: Cell[] = [];
      for (let d = 0; d < 7; d += 1) {
        const date = new Date(startSunday.getTime() + (w * 7 + d) * DAY_MS);
        const key = dayKey(date);
        const count = counts.get(key) ?? 0;
        const future = date.getTime() > today.getTime();
        if (!future) total += count;
        column.push({ key, date, count, future });
      }
      const month = column[0].date.getMonth();
      // Label a month only when there's room: at least 3 columns since the
      // previous label so wide locales (6월, June) never collide.
      if (month !== lastMonth && w - lastLabelIndex >= 3) {
        months.push({ index: w, label: column[0].date.toLocaleDateString(undefined, { month: "short" }) });
        lastLabelIndex = w;
      }
      lastMonth = month;
      columns.push(column);
    }
    return { columns, months, total };
  }, [counts, weeks]);

  function onLayout(event: LayoutChangeEvent) {
    setGridWidth(event.nativeEvent.layout.width);
  }

  const caption = selected
    ? `${selected.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${
        selected.count === 1 ? "1 exercise" : `${selected.count} exercises`
      }`
    : `${total} exercises in the last ${weeks} weeks`;

  return (
    <Card style={{ gap: spacing.sm }} >
      {/* [DEMO-DATA] the fake month fills history until real practice accrues */}
      <AppText variant="title">Practice activity</AppText>

      <View onLayout={onLayout} style={{ alignItems: "flex-start" }}>
        {gridWidth > 0 ? (
          <View style={{ flexDirection: "row", gap: 6 }}>
            {/* Weekday rail (Mon/Wed/Fri, GitHub-style) */}
            <View style={{ marginTop: 18 }}>
              {["", "Mon", "", "Wed", "", "Fri", ""].map((label, i) => (
                <Text
                  key={i}
                  style={{ height: STEP, fontSize: 9.5, fontFamily: families.bodyBold, color: palette.muted, textAlignVertical: "center" }}
                >
                  {label}
                </Text>
              ))}
            </View>

            <View>
              {/* Month labels */}
              <View style={{ height: 18, flexDirection: "row" }}>
                {months.map((month) => (
                  <Text
                    key={`${month.label}-${month.index}`}
                    numberOfLines={1}
                    style={{
                      position: "absolute",
                      left: month.index * STEP,
                      // Explicit width: an absolute Text squeezed against the
                      // grid's right edge otherwise wraps vertically (6월 → 6/월).
                      width: 40,
                      fontSize: 10,
                      fontFamily: families.bodyBold,
                      color: palette.muted,
                    }}
                  >
                    {month.label}
                  </Text>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: GAP }}>
                {columns.map((column, w) => (
                  <View key={w} style={{ gap: GAP }}>
                    {column.map((cell) =>
                      cell.future ? (
                        <View key={cell.key} style={{ width: CELL, height: CELL }} />
                      ) : (
                        <PressableScale
                          key={cell.key}
                          onPress={() => setSelected(selected?.key === cell.key ? null : cell)}
                          accessibilityRole="button"
                          accessibilityLabel={`${cell.date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}, ${cell.count} exercises`}
                          hitSlop={2}
                          scaleTo={0.9}
                          style={{
                            width: CELL,
                            height: CELL,
                            borderRadius: 3,
                            backgroundColor: ramp[level(cell.count)],
                            borderWidth: selected?.key === cell.key ? 1.5 : 0,
                            borderColor: palette.text,
                          }}
                        />
                      ),
                    )}
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
        <AppText color={palette.muted} style={{ fontSize: 13.5, flexShrink: 1 }}>{caption}</AppText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 10.5, fontFamily: families.bodyBold, color: palette.muted }}>Less</Text>
          {ramp.map((color, i) => (
            <View key={i} style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: color }} />
          ))}
          <Text style={{ fontSize: 10.5, fontFamily: families.bodyBold, color: palette.muted }}>More</Text>
        </View>
      </View>
    </Card>
  );
}
