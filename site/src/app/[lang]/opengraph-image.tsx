// The share card for X and anywhere else a link unfurls. Static on purpose: it is prerendered at build time and
// served as a plain file, which is what X's image fetcher handles best, and X keeps a card for days, so live
// numbers would only go stale there. (The first post's card came out empty while this route rendered per request.)
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { LOCALES } from "@/i18n/config";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export const alt = "Casebook: Holmes remembers, Moriarty starts over. One fresh Robinhood Chain quiz, every hour.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [font, ring] = await Promise.all([
    readFile(join(process.cwd(), "assets/archivo-700-wdth112.ttf")),
    readFile(join(process.cwd(), "public/ring-512.png")),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#050c08", color: "#e9efec", padding: "64px 72px", position: "relative" }}>
        <img src={`data:image/png;base64,${ring.toString("base64")}`} width={560} height={560} alt="" style={{ position: "absolute", right: -60, top: 30, opacity: 0.9 }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%" }}>
          <div style={{ fontSize: 26, letterSpacing: 6, color: "#a4b3ab" }}>CASEBOOK</div>
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "Archivo", fontSize: 92, lineHeight: 0.95, letterSpacing: -3 }}>
            <span style={{ color: "#3bdc92" }}>Holmes remembers.</span>
            <span style={{ color: "#c7ced5" }}>Moriarty starts over.</span>
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#a4b3ab" }}>One fresh Robinhood Chain quiz, every hour.</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Archivo", data: font, style: "normal", weight: 700 }] },
  );
}
