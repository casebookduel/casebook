// Languages the site speaks. English lives at the root (/hours); the others under their code (/zh/hours).
// The data (questions, answers, notes, prompts) stays in English: it is what the agents read and write.
export const LOCALES = ["en", "zh", "ko", "vi", "tr", "ru", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", zh: "简体中文", ko: "한국어", vi: "Tiếng Việt", tr: "Türkçe", ru: "Русский", es: "Español" };
export const HTML_LANG: Record<Locale, string> = { en: "en", zh: "zh-CN", ko: "ko", vi: "vi", tr: "tr", ru: "ru", es: "es" };

export const hasLocale = (x: string): x is Locale => (LOCALES as readonly string[]).includes(x);
// a path inside the site, in the given language
export const lp = (lang: Locale, path: string) => (lang === DEFAULT_LOCALE ? path : `/${lang}${path === "/" ? "" : path}`);
// the language a pathname is in, and the same page in another language
export const localeOf = (pathname: string): Locale => { const s = pathname.split("/")[1]; return hasLocale(s) ? s : DEFAULT_LOCALE; };
export const swapLocale = (pathname: string, to: Locale) => { const rest = hasLocale(pathname.split("/")[1]) ? pathname.replace(/^\/[^/]+/, "") || "/" : pathname; return lp(to, rest); };
// "{name}" placeholders, filled in order-independent
// "{n}" is a value; "{n:s}" is an English plural ending: "s" unless n is 1
export const fmt = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{(\w+)(:s)?\}/g, (_, k, pl) => (pl ? (Number(v[k]) === 1 ? "" : "s") : String(v[k] ?? `{${k}}`)));

// numbers the way the reader writes them (1,483 / 1 483 / 1.483)
export const nf = (lang: Locale, digits = 0) => { const f = new Intl.NumberFormat(HTML_LANG[lang], { maximumFractionDigits: digits, minimumFractionDigits: digits }); return (n: number) => f.format(n); };
// shares the same way, one formatter for every percentage on a page (88% / %88 / 88 %); takes a fraction
export const pf = (lang: Locale) => { const f = new Intl.NumberFormat(HTML_LANG[lang], { style: "percent", maximumFractionDigits: 0 }); return (x: number) => f.format(x); };
