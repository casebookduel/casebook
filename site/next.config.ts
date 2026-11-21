import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", ...(process.env.DEV_LAN_HOST ? [process.env.DEV_LAN_HOST] : [])],
  cacheComponents: true,
  partialPrefetching: true,
  // pages re-rendered at runtime stay in memory (an LRU of about 50 MB), not on disk: every unknown /case/<id> or
  // /hours/<n> would otherwise leave a cache file, and a full disk would stop the duel writing its results
  experimental: { isrFlushToDisk: false },
  // the agents' point clouds (about 0.9 MB) change only with a redesign: a week in the browser cache, then refreshed
  // in the background, so a returning visitor never waits on them (rename the files if they ever change)
  async headers() {
    return [{ source: "/points/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] }];
  },
};

export default nextConfig;
