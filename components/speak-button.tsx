// A small round "hear it" button: speaks Korean text via the device TTS
// (expo-speech). Stays quiet-failing — if the platform has no Korean voice
// (e.g. a bare CI browser), tapping simply does nothing audible.
import * as Speech from "expo-speech";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState, type ComponentProps } from "react";

import { PressableScale } from "@/components/motion";
import { colors } from "@/constants/theme";

type IconName = ComponentProps<typeof SymbolView>["name"];
const speakerIcon = { ios: "speaker.wave.2.fill", android: "volume_up", web: "volume_up" } as IconName;
const stopIcon = { ios: "speaker.slash.fill", android: "volume_off", web: "volume_off" } as IconName;

export function SpeakButton({
  text,
  size = 36,
  tint = colors.pen,
  background,
  border,
  accessibilityLabel,
}: {
  text: string;
  size?: number;
  /** Icon color. */
  tint?: string;
  /** Defaults to a faint wash of the tint. */
  background?: string;
  border?: string;
  accessibilityLabel?: string;
}) {
  const [speaking, setSpeaking] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      Speech.stop();
    },
    [],
  );

  function onPress() {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    const settle = () => {
      if (mounted.current) setSpeaking(false);
    };
    Speech.speak(text, {
      language: "ko-KR",
      rate: 0.92,
      onDone: settle,
      onStopped: settle,
      onError: settle,
    });
  }

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `Hear "${text}" spoken`}
      hitSlop={8}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: background ?? `${tint}1F`,
        borderWidth: 1,
        borderColor: border ?? `${tint}40`,
      }}
    >
      <SymbolView name={speaking ? stopIcon : speakerIcon} tintColor={tint} size={Math.round(size * 0.52)} />
    </PressableScale>
  );
}
