// English pages live at the root, so /hours is served by app/[lang] with lang = "en".
// The other languages keep their prefix (/zh/hours).
import { NextResponse, type NextRequest } from "next/server";
import { hasLocale } from "./i18n/config";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const first = pathname.split("/")[1];
  // /en/... is left alone (redirecting it looped in production, where the rewrite below comes back through here);
  // the pages name the root form as canonical instead
  if (hasLocale(first)) return NextResponse.next();
  return NextResponse.rewrite(new URL(`/en${pathname === "/" ? "" : pathname}`, req.url));
}

export const config = { matcher: ["/((?!_next|data|api|models|sitemap.xml|robots.txt|.*\\.[a-z0-9]+$).*)"] };
