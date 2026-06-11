import "expo-sqlite/localStorage/install";

import { useSyncExternalStore } from "react";
import { NativeModules } from "react-native";

import { normalizeLanguage } from "@/i18n";
import type { AppSettings } from "@/types/songul";

const KEY = "songul.settings";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedSettings: AppSettings;

function deviceLanguage() {
  const settings = NativeModules.SettingsManager?.settings;
  return settings?.AppleLocale || settings?.AppleLanguages?.[0] || "en";
}

export const defaultSettings: AppSettings = {
  language: normalizeLanguage(deviceLanguage()),
  darkMode: false,
  name: "Dave",
  dailyGoal: 10,
  reminders: true,
  tracingGuide: false,
  saveWriting: true,
  penFocus: true,
  eraserMode: "touch",
  pageFormat: "blank",
};

function readSettings(): AppSettings {
  const raw = localStorage.getItem(KEY);
  if (raw === cachedRaw && cachedSettings) return cachedSettings;

  cachedRaw = raw;
  if (!raw) {
    cachedSettings = defaultSettings;
    return cachedSettings;
  }

  try {
    cachedSettings = { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    cachedSettings = defaultSettings;
  }
  return cachedSettings;
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function getSettings() {
  return readSettings();
}

export function setSettings(settings: AppSettings) {
  const raw = JSON.stringify(settings);
  localStorage.setItem(KEY, raw);
  cachedRaw = raw;
  cachedSettings = settings;
  emit();
}

export function updateSettings(patch: Partial<AppSettings>) {
  setSettings({ ...readSettings(), ...patch });
}

export function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings() {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings);
}
