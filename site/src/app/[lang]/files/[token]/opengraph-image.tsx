// The share card for one file: its symbol and Holmes's notes, so a link posted under a launch says what the file
// says. Rendered per request (files open all day); a file not yet open for everyone gets the plain card, so a share
// never shows more than the page would. Always English: the card's font has Latin glyphs only.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { noteText, short } from "@/components/FileCard";
import en from "@/i18n/en";
import { notesOf } from "@/lib/fileNotes";
import { getFile, isOpen } from "@/lib/files";

export const alt = "A launch file on Casebook: the dev's record, read from the chain.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [font, ring, f] = await Promise.all([
    readFile(join(process.cwd(), "assets/archivo-700-wdth112.ttf")),
    readFile(join(process.cwd(), "public/ring-512.png")),
    getFile(token),
  ]);
  const t = en.files, open = !!f && isOpen(f);
  const notes = open ? notesOf(f!).slice(0, 3) : [];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#050c08", color: "#e9efec", padding: "56px 68px", position: "relative" }}>
        <img src={`data:image/png;base64,${ring.toString("base64")}`} width={420} height={420} alt="" style={{ position: "absolute", right: -70, top: -40, opacity: 0.55 }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 6, color: "#3bdc92" }}>{open ? `FILE · ${short(f!.token)}` : "CASEBOOK FILES"}</div>
          {open ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontFamily: "Archivo", fontSize: 96, lineHeight: 1, letterSpacing: -3, marginBottom: 22 }}>{f!.symbol || short(f!.token)}</div>
              {(notes.length ? notes : [null]).map((x, i) => (
                <div key={i} style={{ display: "flex", fontSize: 34, lineHeight: 1.25, marginTop: 8, color: x?.tone === "bad" ? "#e8907b" : x?.tone === "good" ? "#3bdc92" : "#c7ced5" }}>
                  {x ? noteText(t, x.key, x.v) : `Dev ${short(f!.creator)}: ${f!.creator_record.n24} launches in 24 hours.`}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", fontFamily: "Archivo", fontSize: 84, lineHeight: 0.98, letterSpacing: -3 }}>
              <span>Every launch</span><span style={{ color: "#3bdc92" }}>opens with a file.</span>
            </div>
          )}
          <div style={{ display: "flex", fontSize: 28, color: "#a4b3ab" }}>casebookduel.com/files</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Archivo", data: font, style: "normal", weight: 700 }] },
  );
}
