// Weekly league card. Rankings come from [DEMO-DATA] (data/demo-leaderboard.ts)
// until accounts exist; the learner's row tracks today's real practice.
// Graphics: medal chips for the podium, a trophy on the leader, ▲/▼ movement
// chips, and a points bar per row scaled against the leader.
import { SymbolView } from "expo-symbols";
import { type ComponentProps } from "react";
import { Text, View } from "react-native";

import { ProgressBar } from "@/components/motion";
import { AppText, Card, Pill, usePalette } from "@/components/ui";
import { colors, families, spacing } from "@/constants/theme";
import type { LeagueRow } from "@/data/demo-leaderboard";

type IconName = ComponentProps<typeof SymbolView>["name"];
const trophyIcon = { ios: "trophy.fill", android: "trophy", web: "trophy" } as IconName;

// AA-safe medal text colors on their light tints.
const MEDAL: Record<number, { tone: string; text: string }> = {
  1: { tone: colors.gold, text: "#8A5200" },
  2: { tone: "#8B8575", text: "#5C5747" },
  3: { tone: colors.margin, text: "#A6453B" },
};
const AVATAR_TONES = [colors.pen, colors.teal, colors.green, colors.gold, colors.pink];
const VISIBLE_ROWS = 5;

function MovementChip({ delta }: { delta: number }) {
  const palette = usePalette();
  if (delta === 0) {
    return <Text style={{ width: 34, textAlign: "center", color: palette.muted, fontFamily: families.bodyBold, fontSize: 12 }}>–</Text>;
  }
  const up = delta > 0;
  return (
    <Text
      style={{
        width: 34,
        textAlign: "center",
        color: up ? "#2C7A4E" : colors.danger,
        fontFamily: families.bodyBold,
        fontSize: 12,
      }}
    >
      {up ? "▲" : "▼"}{Math.abs(delta)}
    </Text>
  );
}

function Row({ row, leaderPoints }: { row: LeagueRow; leaderPoints: number }) {
  const palette = usePalette();
  const dark = palette.settings.darkMode;
  const medal = MEDAL[row.rank];
  const tone = AVATAR_TONES[row.name.length % AVATAR_TONES.length];
  const barFill = row.isYou ? (dark ? colors.penOnDark : colors.pen) : tone;
  return (
    <View
      style={{
        gap: 6,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.sm,
        borderRadius: 12,
        backgroundColor: row.isYou ? (dark ? colors.darkPen50 : colors.pen50) : "transparent",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: medal ? `${medal.tone}1F` : "transparent",
            borderWidth: medal ? 1 : 0,
            borderColor: medal ? `${medal.tone}55` : "transparent",
          }}
        >
          <Text
            style={{
              fontFamily: families.bodyExtra,
              fontSize: 13,
              color: medal ? medal.text : palette.muted,
              fontVariant: ["tabular-nums"],
            }}
          >
            {row.rank}
          </Text>
        </View>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${tone}1F`,
            borderWidth: 1,
            borderColor: `${tone}40`,
          }}
        >
          <Text style={{ fontSize: 14 }}>{row.flag}</Text>
        </View>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          <AppText variant="subtitle" style={{ fontSize: 15.5 }} color={palette.text}>{row.name}</AppText>
          {row.rank === 1 ? <SymbolView name={trophyIcon} tintColor="#8A5200" size={15} /> : null}
          {row.isYou ? <Pill>You</Pill> : null}
        </View>
        <MovementChip delta={row.delta} />
        <Text style={{ fontFamily: families.bodyExtra, fontSize: 16, color: palette.text, fontVariant: ["tabular-nums"] }}>
          {row.points}
          <Text style={{ fontSize: 11, fontFamily: families.bodyBold, color: palette.muted }}> pts</Text>
        </Text>
      </View>
      {/* Points bar: every score read against the leader at a glance. */}
      <View style={{ marginLeft: 28 + spacing.sm }}>
        <ProgressBar fraction={row.points / leaderPoints} trackColor={palette.track} fillColor={barFill} height={6} />
      </View>
    </View>
  );
}

export function Leaderboard({ rows }: { rows: LeagueRow[] }) {
  const palette = usePalette();
  const leaderPoints = rows[0]?.points ?? 1;
  // Keep the card compact for the shared row: podium + neighbors, and the
  // learner's row always shown even from further down the table.
  const visible = rows.slice(0, VISIBLE_ROWS);
  const you = rows.find((row) => row.isYou);
  const youHidden = you && !visible.some((row) => row.isYou);

  return (
    <Card style={{ gap: 2, flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
        <AppText variant="title">Weekly league</AppText>
        {/* [DEMO-DATA] visible tag — remove with the demo table */}
        <Pill tone="gold">Sample</Pill>
      </View>
      {/* Rows distribute over whatever height the shared row gives the card,
          so the league always fills its box instead of pooling whitespace. */}
      <View style={{ flex: 1, justifyContent: "space-evenly" }}>
        {visible.map((row) => (
          <Row key={row.name} row={row} leaderPoints={leaderPoints} />
        ))}
        {youHidden && you ? (
          <>
            <AppText variant="label" color={palette.muted} style={{ textAlign: "center" }}>· · ·</AppText>
            <Row row={you} leaderPoints={leaderPoints} />
          </>
        ) : null}
      </View>
      <AppText variant="label" color={palette.muted} style={{ marginTop: spacing.sm }}>
        Practice today moves your row · real rankings arrive with accounts
      </AppText>
    </Card>
  );
}
