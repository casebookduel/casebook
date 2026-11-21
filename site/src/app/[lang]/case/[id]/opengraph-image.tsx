// The share card for one visitor case, so a link to /case/<id> unfurls as that case and its verdict.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getCase } from "@/lib/cases";
import { KIND_LABEL, short } from "@/lib/duel";

export const alt = "Casebook: a visitor's case, answered by Holmes and Moriarty.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, font, ring] = await Promise.all([
    getCase(id),
    readFile(join(process.cwd(), "assets/archivo-700-wdth112.ttf")),
    readFile(join(process.cwd(), "public/ring-512.png")),
  ]);
  if (!c) return new Response("no such case", { status: 404 });
  const arm = (who: string, a: { ok: boolean; calls: number }) => `${who} ${a.ok ? "right" : "wrong"} · ${a.calls} calls`;   // words: the card font has no check marks
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#050c08", color: "#e9efec", padding: "64px 72px", position: "relative" }}>
        <img src={`data:image/png;base64,${ring.toString("base64")}`} width={460} height={460} alt="" style={{ position: "absolute", right: -40, top: 40, opacity: 0.75 }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%" }}>
          <div style={{ fontSize: 26, letterSpacing: 6, color: "#a4b3ab" }}>{`CASEBOOK · A VISITOR'S CASE`}</div>
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "Archivo", fontSize: 72, lineHeight: 1, letterSpacing: -2 }}>
            <span>{`${KIND_LABEL[c.kind] ?? c.kind},`}</span>
            <span style={{ color: "#7f8e86" }}>{`${short(c.token)}.`}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: "Archivo", fontSize: 48 }}>
            <span style={{ color: "#3bdc92" }}>{arm("Holmes", c.holmes)}</span>
            <span style={{ color: "#c7ced5" }}>{arm("Moriarty", c.moriarty)}</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Archivo", data: font, style: "normal", weight: 700 }] },
  );
}
