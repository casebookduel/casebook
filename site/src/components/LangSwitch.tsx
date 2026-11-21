"use client";
// The language menu: the same page in another language. A native <details> menu, so it works with the keyboard as is.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOCALE_NAMES, LOCALES, swapLocale, type Locale } from "@/i18n/config";

export default function LangSwitch({ lang, label }: { lang: Locale; label: string }) {
  const path = usePathname();
  return (
    <details className="lang">
      <summary aria-label={label}><span className="mlabel">{lang.toUpperCase()}</span></summary>
      <div className="lang-menu" role="menu">
        {LOCALES.map((l) => (
          <Link key={l} role="menuitem" prefetch={false} href={swapLocale(path, l)} hrefLang={l} aria-current={l === lang ? "true" : undefined} onClick={(e) => (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open")}>
            {LOCALE_NAMES[l]}
          </Link>
        ))}
      </div>
    </details>
  );
}
