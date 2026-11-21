import type { Locale } from "./config";
import type { Dict } from "./en";

// Each language loads only when a page in it is rendered.
const dictionaries: Record<Locale, () => Promise<Dict>> = {
  en: () => import("./en").then((m) => m.default),
  zh: () => import("./zh").then((m) => m.default),
  ko: () => import("./ko").then((m) => m.default),
  vi: () => import("./vi").then((m) => m.default),
  tr: () => import("./tr").then((m) => m.default),
  ru: () => import("./ru").then((m) => m.default),
  es: () => import("./es").then((m) => m.default),
};
export const getDictionary = (lang: Locale) => dictionaries[lang]();
