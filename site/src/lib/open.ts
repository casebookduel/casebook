// Features that are built and open one at a time after launch. OPEN_FEATURES lists the open ones, comma-separated
// ("trail,teach"); a feature that is not listed has no page, no data route and no link.
export const OPEN = new Set((process.env.OPEN_FEATURES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
