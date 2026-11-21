// The share card for one hour: its own score, so a link to /hours/13 unfurls as hour 13, not the latest hour.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getDuel } from "@/lib/duel";

export const alt = "Casebook: one graded hour of the duel between Holmes and Moriarty.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ hour: string }> }) {
  const { hour } = await params;
  const [duel, font, ring] = await Promise.all([
    getDuel(),
    readFile(join(process.cwd(), "assets/archivo-700-wdth112.ttf")),
    readFile(join(process.cwd(), "public/ring-512.png")),
  ]);
  const h = duel.hours.find((x) => String(x.hour) === hour) ?? duel.latest;
  if (!h) return new Response("no hours yet", { status: 404 });
  const lead = h.holmes === h.moriarty ? "Tied." : h.holmes > h.moriarty ? "Holmes ahead." : "Moriarty ahead.";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#050c08", color: "#e9efec", padding: "64px 72px", position: "relative" }}>
        <img src={`data:image/png;base64,${ring.toString("base64")}`} width={460} height={460} alt="" style={{ position: "absolute", right: -40, top: 40, opacity: 0.75 }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%" }}>
          <div style={{ fontSize: 26, letterSpacing: 6, color: "#a4b3ab" }}>{`CASEBOOK · HOUR ${h.hour}`}</div>
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "Archivo", fontSize: 96, lineHeight: 0.95, letterSpacing: -3 }}>
            <span>{`Hour ${h.hour}.`}</span>
            <span style={{ color: "#7f8e86" }}>{lead}</span>
          </div>
          <div style={{ display: "flex", gap: 64, fontFamily: "Archivo", fontSize: 64 }}>
            <span style={{ color: "#3bdc92" }}>{`Holmes ${h.holmes}/${h.n}`}</span>
            <span style={{ color: "#c7ced5" }}>{`Moriarty ${h.moriarty}/${h.n}`}</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Archivo", data: font, style: "normal", weight: 700 }] },
  );
}
