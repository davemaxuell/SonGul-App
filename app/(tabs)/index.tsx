import { useFocusEffect, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useMemo, useState, type ComponentProps } from "react";
import { Modal, Pressable, useWindowDimensions, View } from "react-native";

import { ActivityCalendar } from "@/components/activity-calendar";
import { CanvasCard, MockPageCard, NewPageTile } from "@/components/canvas-card";
import { HangulField } from "@/components/hangul-field";
import { Leaderboard } from "@/components/leaderboard";
import { Entrance, PressableScale, ProgressBar, ScreenTransition } from "@/components/motion";
import { SpeakButton } from "@/components/speak-button";
import { TabSwipe, TabSwipeExclude } from "@/components/tab-swipe";
import { ActionButton, AppText, AssetImage, Card, HorizontalScroller, MetricCard, Pill, Screen, usePalette } from "@/components/ui";
import { colors, families, radii, spacing } from "@/constants/theme";
import { curriculum } from "@/data/curriculum";
import { demoAugmentedActivity, demoAugmentedProgress, demoExpressionOfDay, demoWordOfDay } from "@/data/demo-history"; // [DEMO-DATA]
import { getDemoLeaderboard } from "@/data/demo-leaderboard"; // [DEMO-DATA]
import { demoPages } from "@/data/demo-pages"; // [DEMO-DATA]
import {
  getLearningProgress,
  getPracticeActivity,
  getRecentWriteAttempts,
  listCanvases,
  todayKey,
  type LearningProgress,
  type RecentAttempt,
  type SavedCanvas,
} from "@/lib/database";
import { summarizeQueue, type QueueSummary } from "@/lib/learning";
import type { SkillKey } from "@/types/songul";

const mascot = require("@/assets/songul/mascot-tutor.png");
const logo = require("@/assets/songul/SonGul-LOGO.png");

type IconName = ComponentProps<typeof SymbolView>["name"];
const flameIcon = { ios: "flame.fill", android: "local_fire_department", web: "local_fire_department" } as IconName;

const SKILL_LABEL: Record<SkillKey, string> = {
  shape: "Letter shape",
  stroke_order: "Stroke order",
  spacing: "Spacing",
  grammar: "Grammar",
};
const SKILL_TONE: Record<SkillKey, string> = {
  shape: colors.pen,
  stroke_order: colors.teal,
  spacing: colors.gold,
  grammar: colors.green,
};

// Text tints that stay AA-legible on the navy hero surface.
const HERO = {
  label: colors.penOnDark,
  date: "rgba(236, 234, 246, 0.72)",
  body: "rgba(236, 234, 246, 0.88)",
  chipText: "#ECEAF6",
  chipBg: "rgba(255, 253, 246, 0.10)",
  chipBorder: "rgba(255, 253, 246, 0.22)",
  gold: colors.gold,
  green: "#5BBF85",
};

function HeroChip({ children, tone }: { children: string; tone?: "gold" | "green" }) {
  const text = tone === "gold" ? HERO.gold : tone === "green" ? HERO.green : HERO.chipText;
  const border = tone === "gold" ? `${colors.gold}66` : tone === "green" ? "#5BBF8566" : HERO.chipBorder;
  const bg = tone === "gold" ? `${colors.gold}24` : tone === "green" ? "#5BBF8524" : HERO.chipBg;
  return (
    <View style={{ borderRadius: 999, backgroundColor: bg, borderWidth: 1, borderColor: border, paddingHorizontal: 12, paddingVertical: 6 }}>
      <AppText variant="label" color={text}>{children}</AppText>
    </View>
  );
}

type MetricDetail = "items" | "mastery" | "today" | null;

// Rotating Korean hellos, time-aware and always addressed to the learner.
const KOREAN_GREETINGS: Record<"morning" | "afternoon" | "evening" | "night" | "any", ((name: string) => string)[]> = {
  morning: [
    (n) => `좋은 아침이에요, ${n}!`,
    (n) => `${n}님, 상쾌한 아침이에요!`,
    (n) => `일찍 왔네요, ${n}!`,
  ],
  afternoon: [
    (n) => `안녕하세요, ${n}!`,
    (n) => `${n}님, 좋은 오후예요!`,
  ],
  evening: [
    (n) => `좋은 저녁이에요, ${n}!`,
    (n) => `${n}님, 오늘 하루 어땠어요?`,
  ],
  night: [
    (n) => `늦은 밤이네요, ${n}.`,
    (n) => `${n}님, 오늘도 수고했어요!`,
  ],
  any: [
    (n) => `안녕하세요, ${n}!`,
    (n) => `반가워요, ${n}!`,
    (n) => `${n}님, 어서 오세요!`,
    (n) => `또 만났네요, ${n}!`,
    (n) => `${n}님, 오늘도 화이팅!`,
  ],
};

function pickKoreanGreeting(name: string) {
  const hour = new Date().getHours();
  const bucket = hour < 5 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 22 ? "evening" : "night";
  const pool = [...KOREAN_GREETINGS[bucket], ...KOREAN_GREETINGS.any];
  return pool[Math.floor(Math.random() * pool.length)](name);
}

/** [DEMO-DATA] One of the daily-duo cards: the SonGul wordmark owns the label. */
function DailyCard({ label, item }: { label: string; item: { ko: string; romanization: string; meaning: string } }) {
  const palette = usePalette();
  return (
    <Card style={{ flex: 1, minWidth: 0, gap: spacing.sm, paddingVertical: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <AssetImage
          source={logo}
          accessibilityLabel="SonGul"
          tintColor={palette.settings.darkMode ? colors.darkText : undefined}
          style={{ width: 50, height: 18 }}
        />
        <AppText variant="label" color={palette.muted} style={{ flex: 1 }}>{label}</AppText>
        <SpeakButton text={item.ko} size={34} accessibilityLabel={`Hear it spoken: ${item.meaning}`} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: spacing.md, rowGap: 2 }}>
        <AppText variant="korean" style={{ fontSize: 23, lineHeight: 33 }}>{item.ko}</AppText>
        <AppText color={palette.muted} style={{ flexShrink: 1 }}>{`${item.romanization} · ${item.meaning}`}</AppText>
      </View>
    </Card>
  );
}

// Today is the hub: start the day's session, flip through saved pages, and see
// where you stand. Session numbers are real; filled-in stats are [DEMO-DATA].
export default function TodayScreen() {
  const palette = usePalette();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 900; // Saved pages + league share a row on tablets
  const name = palette.settings.name;
  const goal = palette.settings.dailyGoal;

  const [progress, setProgress] = useState<LearningProgress>(() => getLearningProgress());
  const [summary, setSummary] = useState<QueueSummary>(() => summarizeQueue());
  const [recent, setRecent] = useState<RecentAttempt[]>(() => getRecentWriteAttempts());
  const [detail, setDetail] = useState<MetricDetail>(null);
  const [activity, setActivity] = useState<Map<string, number>>(() => getPracticeActivity());
  // The user's saved canvas pages (auto-saved from the writing tab).
  const [pages, setPages] = useState<SavedCanvas[]>([]);
  useFocusEffect(
    useCallback(() => {
      setProgress(getLearningProgress());
      setSummary(summarizeQueue());
      setRecent(getRecentWriteAttempts());
      setActivity(getPracticeActivity());
      let alive = true;
      listCanvases(5) // the five most recent pages preview on Home
        .then((saved) => {
          if (alive) setPages(saved);
        })
        .catch((err) => console.warn("Could not load saved pages", err));
      return () => {
        alive = false;
      };
    }, []),
  );

  const itemById = useMemo(() => new Map(curriculum.map((item) => [item.id, item])), []);
  // [DEMO-DATA] blend the fake month into the dashboard until real history exists.
  const shown = demoAugmentedProgress(progress);
  const { todayCount } = progress;
  const goalMet = goal > 0 && todayCount >= goal;
  const hasSession = summary.total > 0;
  const currentLevel = shown.levels.find((l) => l.mastery < 0.6) ?? shown.levels[shown.levels.length - 1];
  const practicedSkills = shown.skills.filter((s) => s.attempts > 0);
  const overall = practicedSkills.length
    ? Math.round((practicedSkills.reduce((sum, s) => sum + s.mastery, 0) / practicedSkills.length) * 100)
    : 0;

  const heroTitle =
    summary.dueCount > 0
      ? "You have reviews due"
      : summary.newCount > 0
        ? `Keep going: ${currentLevel?.title ?? "your path"}`
        : "All caught up";

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const word = demoWordOfDay(); // [DEMO-DATA]
  const expression = demoExpressionOfDay(); // [DEMO-DATA]
  // [DEMO-DATA] typeset sample pages fill the shelf until five real ones exist.
  const mockPages = demoPages.slice(0, Math.max(0, 5 - pages.length));

  const greeting = goalMet
    ? "Today's goal is done. One more for the streak?"
    : todayCount > 0
      ? "You've started today. Keep the pen moving."
      : "Ready to write some Korean today?";
  // A fresh hello each visit, picked once per mount so it doesn't shuffle mid-read.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hello = useMemo(() => pickKoreanGreeting(name), [name]);

  return (
    <ScreenTransition>
      <TabSwipe swipeLeftTo="/practice">
      <Screen>
        <View style={{ gap: spacing.xs }}>
          <AppText variant="title">{hello}</AppText>
          <AppText color={palette.muted}>{greeting}</AppText>
        </View>

        {/* The day's marquee: a navy "session ticket" floating on the paper,
            kin to the tab dock. The single committed-color surface on screen. */}
        <Entrance index={0}>
          <View
            style={{
              backgroundColor: colors.navy,
              borderRadius: radii.xl,
              borderWidth: 1,
              borderColor: "rgba(255, 253, 246, 0.16)",
              padding: spacing.lg,
              gap: spacing.md,
              overflow: "hidden",
              boxShadow: "0 16px 36px rgba(35, 36, 77, 0.30)",
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -70,
                right: -50,
                width: 230,
                height: 230,
                borderRadius: 999,
                backgroundColor: `${colors.pen}33`,
              }}
            />
            {/* The promo site's living-Hangul background, scaled to the ticket. */}
            <HangulField count={9} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <AppText variant="label" color={HERO.label}>Today&apos;s</AppText>
                <AssetImage
                  source={logo}
                  accessibilityLabel="SonGul"
                  tintColor="#ECEAF6"
                  style={{ width: 64, height: 23 }}
                />
              </View>
              <AppText variant="label" color={HERO.date}>{dateLabel}</AppText>
            </View>

            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md }}>
              <View style={{ flex: 1, gap: spacing.md }}>
                <AppText variant="title" color={colors.white} style={{ fontSize: 30, lineHeight: 38 }}>
                  {heroTitle}
                </AppText>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {summary.newCount > 0 ? <HeroChip>{`${summary.newCount} new`}</HeroChip> : null}
                  {summary.dueCount > 0 ? <HeroChip>{`${summary.dueCount} to review`}</HeroChip> : null}
                  {summary.drillSkill ? <HeroChip tone="gold">{`Drill · ${SKILL_LABEL[summary.drillSkill]}`}</HeroChip> : null}
                  {goalMet ? <HeroChip tone="green">Goal done</HeroChip> : null}
                  {!hasSession ? <HeroChip>Nothing scheduled</HeroChip> : null}
                </View>
              </View>
              <AssetImage source={mascot} decorative style={{ width: 96, height: 96, marginBottom: -6 }} />
            </View>

            <ActionButton href="/session">{hasSession ? "Start session" : "Practice anyway"}</ActionButton>
          </View>
        </Entrance>

        {/* The daily duo: SonGul's word + expression, sharing one row. [DEMO-DATA] */}
        <Entrance index={1}>
          <View style={{ flexDirection: wide ? "row" : "column", gap: spacing.md }}>
            <DailyCard label="'s word of the day" item={word} />
            <DailyCard label="'s expression of the day" item={expression} />
          </View>
        </Entrance>

        <AppText variant="title" style={{ marginTop: spacing.sm }}>Your progress</AppText>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
          <MetricCard index={0} label="Day streak" value={String(shown.streak)} tone={colors.pen} icon={flameIcon} iconTint={colors.gold} />
          <MetricCard index={1} label="Items practiced" value={`${shown.seenItems}/${shown.totalItems}`} tone={colors.gold} onPress={() => setDetail("items")} />
          <MetricCard index={2} label="Overall mastery" value={`${overall}%`} tone={colors.green} onPress={() => setDetail("mastery")} />
          <MetricCard index={3} label="Written today" value={`${todayCount}/${goal}`} tone={colors.teal} onPress={() => setDetail("today")} />
        </View>

        {/* Saved pages and the league share one row on wide screens. */}
        <View style={{ flexDirection: wide ? "row" : "column", gap: spacing.lg, alignItems: "stretch", marginTop: spacing.sm }}>
          <Entrance index={2} style={{ flex: wide ? 1.15 : undefined, gap: spacing.lg, minWidth: 0 }}>
            <Card style={{ gap: spacing.sm, overflow: "hidden" }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
                <AppText variant="title">Saved pages</AppText>
                {pages.length ? <AppText variant="label" color={palette.muted}>last {pages.length}</AppText> : null}
              </View>
              <AppText color={palette.muted}>Every canvas saves itself. Tap a page to keep writing on it.</AppText>
              {/* The shelf bleeds to the card's edges so partial cards crop
                  cleanly at the box boundary; drags stay off the tab swipe. */}
              <TabSwipeExclude>
                <View style={{ marginHorizontal: -spacing.lg }}>
                  <HorizontalScroller contentStyle={{ paddingHorizontal: spacing.lg }}>
                    <NewPageTile onPress={() => router.push(`/practice?fresh=${Date.now()}`)} />
                    {pages.map((page) => (
                      <CanvasCard
                        key={page.id}
                        page={page}
                        onPress={() => router.push(`/practice?canvas=${page.id}&t=${Date.now()}`)}
                      />
                    ))}
                    {/* [DEMO-DATA] typeset fillers until five real pages exist. */}
                    {mockPages.map((page) => (
                      <MockPageCard
                        key={page.id}
                        page={page}
                        onPress={() => router.push(`/practice?fresh=${Date.now()}`)}
                      />
                    ))}
                  </HorizontalScroller>
                </View>
              </TabSwipeExclude>
            </Card>
            {/* Day-by-day intensity, GitHub style, tucked under the shelf. */}
            <ActivityCalendar counts={demoAugmentedActivity(activity)} />
          </Entrance>

          {/* Weekly league. [DEMO-DATA] rivals until accounts exist. */}
          <Entrance index={3} style={{ flex: 1, minWidth: 0 }}>
            <Leaderboard rows={getDemoLeaderboard(name, todayCount, shown.streak)} />
          </Entrance>
        </View>

        {recent.length ? (
          <Card>
            <AppText variant="title">Recent activity</AppText>
            {recent.map((attempt) => {
              const item = attempt.itemId ? itemById.get(attempt.itemId) : undefined;
              const good = attempt.score >= 85;
              return (
                <View
                  key={attempt.id}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.border, paddingVertical: spacing.sm }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 }}>
                    <AppText variant="korean" style={{ fontSize: 22 }}>{item?.content ?? "—"}</AppText>
                    <AppText color={palette.muted}>{item?.romanization ?? ""}</AppText>
                  </View>
                  <Pill tone={good ? "green" : "gold"}>{`${attempt.score}%`}</Pill>
                </View>
              );
            })}
          </Card>
        ) : null}
      </Screen>
      </TabSwipe>

      <MetricDetailModal
        detail={detail}
        onClose={() => setDetail(null)}
        progress={shown}
        overall={overall}
        todayCount={todayCount}
        goal={goal}
        recent={recent}
        itemById={itemById}
        onStartSession={() => {
          setDetail(null);
          router.push("/session");
        }}
      />
    </ScreenTransition>
  );
}

// ---- Metric detail views -------------------------------------------------------

function MetricDetailModal({
  detail,
  onClose,
  progress,
  overall,
  todayCount,
  goal,
  recent,
  itemById,
  onStartSession,
}: {
  detail: MetricDetail;
  onClose: () => void;
  progress: LearningProgress;
  overall: number;
  todayCount: number;
  goal: number;
  recent: RecentAttempt[];
  itemById: Map<string, (typeof curriculum)[number]>;
  onStartSession: () => void;
}) {
  const palette = usePalette();
  if (!detail) return null;

  const title =
    detail === "items" ? "Items practiced" : detail === "mastery" ? "Overall mastery" : "Written today";

  const todays = recent.filter((attempt) => attempt.createdAt.slice(0, 10) === todayKey());

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityLabel="Close details"
        style={{ flex: 1, backgroundColor: "rgba(35, 36, 77, 0.46)", alignItems: "center", justifyContent: "center", padding: spacing.lg }}
      >
        <Pressable onPress={() => undefined} style={{ width: "100%", maxWidth: 560 }}>
          <Card style={{ gap: spacing.md, maxHeight: 620 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <AppText variant="title">{title}</AppText>
              <PressableScale onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} style={{ minHeight: 44, justifyContent: "center" }}>
                <AppText color={palette.penText} style={{ fontFamily: families.bodyExtra }}>Close</AppText>
              </PressableScale>
            </View>

            {detail === "items" ? (
              <View style={{ gap: spacing.md }}>
                <AppText color={palette.muted}>
                  {`${progress.seenItems} of ${progress.totalItems} items practiced. A level unlocks the next once its mastery clears 60%.`}
                </AppText>
                {progress.levels.map((level) => (
                  <View key={level.level} style={{ gap: spacing.xs }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <AppText variant="subtitle">{level.title}</AppText>
                      <AppText variant="label" color={palette.muted}>{`${level.seen}/${level.total} · ${Math.round(level.mastery * 100)}%`}</AppText>
                    </View>
                    <ProgressBar fraction={level.mastery} trackColor={palette.track} fillColor={colors.pen} height={10} />
                  </View>
                ))}
              </View>
            ) : null}

            {detail === "mastery" ? (
              <View style={{ gap: spacing.md }}>
                <AppText color={palette.muted}>
                  {`${overall}% across the skills you've practiced. Weak skills get extra drills in your sessions.`}
                </AppText>
                {progress.skills.map((skill) => (
                  <View key={skill.skill} style={{ gap: spacing.xs }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <AppText variant="subtitle">{SKILL_LABEL[skill.skill]}</AppText>
                      <AppText variant="label" color={palette.muted}>
                        {skill.attempts > 0 ? `${Math.round(skill.mastery * 100)}% · ${skill.attempts} tries` : "Not yet"}
                      </AppText>
                    </View>
                    <ProgressBar fraction={skill.mastery} trackColor={palette.track} fillColor={SKILL_TONE[skill.skill]} height={10} />
                  </View>
                ))}
              </View>
            ) : null}

            {detail === "today" ? (
              <View style={{ gap: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
                  <AppText variant="metric" color={palette.settings.darkMode ? colors.penOnDark : colors.pen} style={{ fontVariant: ["tabular-nums"] }}>
                    {todayCount}
                  </AppText>
                  <AppText color={palette.muted}>{`of ${goal} for today's goal`}</AppText>
                </View>
                <ProgressBar fraction={goal > 0 ? todayCount / goal : 0} trackColor={palette.track} fillColor={colors.teal} height={12} />
                {todays.length ? (
                  <View>
                    {todays.map((attempt) => {
                      const item = attempt.itemId ? itemById.get(attempt.itemId) : undefined;
                      return (
                        <View key={attempt.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.border }}>
                          <AppText variant="korean" style={{ fontSize: 20 }}>{item?.content ?? "—"}</AppText>
                          <Pill tone={attempt.score >= 85 ? "green" : "gold"}>{`${attempt.score}%`}</Pill>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <AppText color={palette.muted}>Nothing written yet today. The first stroke is the hardest one.</AppText>
                )}
                <ActionButton onPress={onStartSession}>Start session</ActionButton>
              </View>
            ) : null}
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
