import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { getDashboardSnapshot } from "@/lib/database";

export function useDashboardSnapshot() {
  const [snapshot, setSnapshot] = useState(() => getDashboardSnapshot());

  const refresh = useCallback(() => {
    setSnapshot(getDashboardSnapshot());
  }, []);

  useFocusEffect(refresh);

  return { snapshot, refresh };
}
