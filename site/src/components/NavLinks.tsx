"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { lp, type Locale } from "@/i18n/config";

// Wide screens show the links in a row. Narrow ones fold them into one menu built like the language menu (a native
// <details>, so it works with the keyboard as is), which leaves room for the Latest-hour button in every language.
type Labels = { hours: string; notebook: string; how: string; menu: string; case?: string };

export default function NavLinks({ lang, labels }: { lang: Locale; labels: Labels }) {
  const path = usePathname();
  const links = [[lp(lang, "/hours"), labels.hours], [lp(lang, "/notebook"), labels.notebook],
    ...(labels.case ? [[lp(lang, "/case"), labels.case]] : []), [lp(lang, "/how"), labels.how]];
  const items = links.map(([href, text]) => (
    <Link key={href} href={href} aria-current={path === href || path.startsWith(href + "/") ? "page" : undefined}>{text}</Link>
  ));
  return (
    <>
      <nav aria-label="Main">{items}</nav>
      <nav aria-label="Main" className="nav-menu">
        <details className="lang">
          <summary><span className="mlabel">{labels.menu}</span></summary>
          <div className="lang-menu" onClick={(e) => (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open")}>{items}</div>
        </details>
      </nav>
    </>
  );
}
