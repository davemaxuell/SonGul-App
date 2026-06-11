import en from "@/i18n-source/en.json";
import id from "@/i18n-source/id.json";
import ja from "@/i18n-source/ja.json";
import ko from "@/i18n-source/ko.json";
import ru from "@/i18n-source/ru.json";
import vi from "@/i18n-source/vi.json";
import zh from "@/i18n-source/zh.json";
import type { LanguageCode } from "@/types/songul";

type Dictionary = Record<string, string>;

export const languageNames: Record<LanguageCode, string> = {
  en: "English",
  ko: "한국어",
  zh: "中文",
  vi: "Tiếng Việt",
  ru: "Русский",
  ja: "日本語",
  id: "Bahasa Indonesia",
};

// Country flag shown next to each language in the picker. Emoji flags render
// natively on iOS/Android and via Noto Color Emoji on the web preview.
export const languageFlags: Record<LanguageCode, string> = {
  en: "🇺🇸",
  ko: "🇰🇷",
  zh: "🇨🇳",
  vi: "🇻🇳",
  ru: "🇷🇺",
  ja: "🇯🇵",
  id: "🇮🇩",
};

const dictionaries: Record<LanguageCode, Dictionary> = { en, ko, zh, vi, ru, ja, id };

export function cleanText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "-")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

export function translate(language: LanguageCode, key: string, fallback: string) {
  const dict = dictionaries[language] ?? dictionaries.en;
  const raw = dict[key] ?? dictionaries.en[key] ?? fallback;
  return cleanText(raw);
}

export function normalizeLanguage(value: string | undefined): LanguageCode {
  const code = value?.slice(0, 2).toLowerCase() as LanguageCode | undefined;
  return code && code in dictionaries ? code : "en";
}
