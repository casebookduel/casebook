import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Not found" };

// Any path no page claims gets the site's own not-found page, inside the layout, instead of the framework's bare one.
export default function Missing() {
  notFound();
}
