import type { Metadata, Viewport } from "next";
import { Archivo, Geist, Martian_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Backdrop from "@/components/Backdrop";
import { GitHubMark, XLogo } from "@/components/Icons";
import LangSwitch from "@/components/LangSwitch";
import LiveRefresh from "@/components/LiveRefresh";
import NavLinks from "@/components/NavLinks";
import RouteRing from "@/components/RouteRing";
import SmoothScroll from "@/components/SmoothScroll";
import { fmt, hasLocale, HTML_LANG, LOCALES, lp } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { clock, getDuel } from "@/lib/duel";
import { EXPLORER } from "@/lib/explorer";
import { CASES_LIVE } from "@/lib/cases";
import { ENGINE_LIVE, GITHUB_URL, SITE_URL, TOKEN_CA, X_URL } from "@/lib/site";
import { OPEN } from "@/lib/open";
import { TEACH_ON } from "@/lib/lessons";
import { LEAGUE_ON } from "@/lib/league";
import NotOurs from "@/components/NotOurs";
import "../globals.css";

const display = Archivo({ subsets: ["latin", "latin-ext", "vietnamese"], axes: ["wdth"], variable: "--font-display" });
const text = Geist({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--font-text" });
const mono = Martian_Mono({ subsets: ["latin", "latin-ext", "cyrillic"], axes: ["wdth"], variable: "--font-mono" });

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = await getDictionary(lang);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t.meta.title, template: "%s · Casebook" },
    description: t.meta.description,
    openGraph: { type: "website", siteName: "Casebook" },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: lp(lang, "/"), languages: Object.fromEntries(LOCALES.map((l) => [HTML_LANG[l], lp(l, "/")])) },
  };
}
export const viewport: Viewport = { themeColor: "#050c08", colorScheme: "dark" };

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [duel, t] = await Promise.all([getDuel(), getDictionary(lang)]);
  const last = duel.latest, f = t.footer, home = lp(lang, "/");
  return (
    <html lang={HTML_LANG[lang]} className={`${display.variable} ${text.variable} ${mono.variable}`}>
      <body>
        <Backdrop />
        <SmoothScroll />
        <header className="nav">
          <div className="wrap">
            <Link href={home} className="brand" aria-label="Casebook">
              <Image src="/ring-128.png" alt="" width={34} height={34} />
              <span>Casebook</span>
            </Link>
            <NavLinks lang={lang} labels={CASES_LIVE ? { ...t.nav, case: t.case.nav } : t.nav} />
            {(X_URL || GITHUB_URL) && (
              <span className="socials">
                {X_URL && <a href={X_URL} target="_blank" rel="noreferrer" aria-label="Casebook on X"><XLogo /></a>}
                {GITHUB_URL && <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="Casebook on GitHub"><GitHubMark /></a>}
              </span>
            )}
            <LangSwitch lang={lang} label={t.nav.language} />
            {last && <Link className="btn btn-solid btn-sm" href={lp(lang, `/hours/${last.hour}`)}>{t.nav.latest}</Link>}
          </div>
        </header>
        <main>{children}</main>
        <footer className="foot">
          <div className="foot-mark" aria-hidden="true">Casebook</div>
          <div className="wrap">
            <div className="foot-grid">
              <div className="foot-brand">
                <Link href={home} className="brand" aria-label="Casebook">
                  <Image src="/ring-128.png" alt="" width={34} height={34} />
                  <span>Casebook</span>
                </Link>
                <p>{f.tagline}</p>
                {(X_URL || GITHUB_URL) && (
                  <div className="socials foot-social">
                    {X_URL && <a href={X_URL} target="_blank" rel="noreferrer"><XLogo /> X</a>}
                    {GITHUB_URL && <a href={GITHUB_URL} target="_blank" rel="noreferrer"><GitHubMark /> GitHub</a>}
                  </div>
                )}
              </div>
              <nav aria-label={f.watch}><span className="mlabel">{f.watch}</span>{last && <Link href={lp(lang, `/hours/${last.hour}`)}>{f.latest}</Link>}<Link href={lp(lang, "/hours")}>{f.every}</Link><Link href={lp(lang, "/notebook")}>{f.notebook}</Link>{OPEN.has("trail") && <Link href={lp(lang, "/trail")}>{t.next.items[0].t}</Link>}{TEACH_ON && <Link href={lp(lang, "/teach")}>{t.next.items[1].t}</Link>}{LEAGUE_ON && <Link href={lp(lang, "/league")}>{t.next.items[3].t}</Link>}{CASES_LIVE && <Link href={lp(lang, "/case")}>{t.case.kicker}</Link>}</nav>
              <nav aria-label={f.check}><span className="mlabel">{f.check}</span><Link href={lp(lang, "/how")}>{f.how}</Link><a href="/data/results.jsonl">{f.raw}</a><a href="/data/duel.json">{f.summary}</a></nav>
              <nav aria-label={f.build}><span className="mlabel">{f.build}</span><Link href={lp(lang, "/how") + "#prompt"}>{f.prompts}</Link><Link href={lp(lang, "/how") + "#grading"}>{f.grading}</Link><Link href={home + "#build"}>{f.harness}</Link>{ENGINE_LIVE && <Link href={lp(lang, "/install")}>{f.engine}</Link>}</nav>
            </div>
            <div className="foot-legal">
              <p>{f.pd}</p>
              <p>{TOKEN_CA ? <>{f.ca} <a className="addr mono" href={`${EXPLORER}/token/${TOKEN_CA}`} target="_blank" rel="noreferrer">{TOKEN_CA}</a></> : f.contract}</p>
              <NotOurs text={f.notOurs} />
              {last && <p>{fmt(f.last, { h: last.hour, t: clock(last.ts) })}</p>}
              <p>{f.copy}</p>
            </div>
          </div>
        </footer>
        <RouteRing />
        <LiveRefresh updated={duel.updated} />
      </body>
    </html>
  );
}
