// The public address. Until the domain is live this falls back to the local dev server.
export const SITE_URL = (process.env.SITE_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");

// Public accounts. Each link appears only once its account exists and the address is set at build time.
export const X_URL = process.env.NEXT_PUBLIC_X_URL ?? "";
export const GITHUB_URL = process.env.NEXT_PUBLIC_GITHUB_URL ?? "";

// The memory engine (npm casebook-memory). Its install page and links appear once the package is published and
// ENGINE_LIVE=1 is set at build time.
export const ENGINE_LIVE = process.env.ENGINE_LIVE === "1";

// The $CASE contract, set on launch day. Until then the footer says there is no contract yet.
const ca = (process.env.NEXT_PUBLIC_TOKEN_CA ?? "").trim();
export const TOKEN_CA = /^0x[0-9a-fA-F]{40}$/.test(ca) ? ca : "";
