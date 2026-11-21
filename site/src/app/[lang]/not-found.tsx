import type { Metadata } from "next";
import Link from "next/link";
import { Arrow } from "@/components/Icons";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="wrap">
      <div className="page-top">
        <div className="shead-bar"><span className="mlabel">Not found</span><span className="mlabel">404</span></div>
        <h1 className="page-h1">No such page.<span className="b">Every hour is still on the record.</span></h1>
        <div className="cta" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 32 }}>
          <Link className="btn btn-solid" href="/hours">Every hour <Arrow /></Link>
          <Link className="btn btn-line" href="/">Home</Link>
        </div>
      </div>
      <div style={{ height: 120 }} />
    </div>
  );
}
