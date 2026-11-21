// MCP server on stdio (newline-delimited JSON-RPC 2.0). The index goes out once, as the server's instructions, so it
// sits in the agent's context from the first turn; everything else is a tool call.
import readline from "node:readline";
import { describe, Store } from "./store.js";

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export const TOOLS = [
  {
    name: "recall",
    description: "Search this project's memories: lessons from earlier tasks, each with its receipt (uses, outcomes, measured uplift). Pass a few words about the task, or memory ids such as m3.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, k: { type: "number", description: "How many to return (default 5)." } }, required: ["query"] },
  },
  {
    name: "remember",
    description: "Store one short lesson for future tasks: a fact or procedure you checked in this task, in one or two sentences. Secrets are refused; duplicates and contradictions are flagged.",
    inputSchema: { type: "object", properties: { text: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["text"] },
  },
  {
    name: "outcome",
    description: "Report the result when the task is done, so every memory that was in your context gets the credit or the blame.",
    inputSchema: { type: "object", properties: { result: { type: "string", enum: ["solved", "failed"] }, note: { type: "string" } }, required: ["result"] },
  },
  {
    name: "forget",
    description: "Retire a memory that turned out to be wrong or out of date.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id"] },
  },
];

type Msg = { jsonrpc: "2.0"; id?: string | number | null; method?: string; params?: Record<string, any> };
const text = (t: string, isError = false) => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });

// One server per agent session. In a duel, CASEBOOK_ARM=B turns memory off, CASEBOOK_EXCLUDE leaves memories out
// (the leave-one-out checks) and CASEBOOK_TRIAL tags what was served, so the duel knows which memories were in play.
export function handler(store: Store, version: string, env: NodeJS.ProcessEnv = process.env) {
  const off = env.CASEBOOK_ARM === "B" || env.CASEBOOK_OFF === "1";
  const trial = env.CASEBOOK_TRIAL || undefined;
  const exclude = new Set((env.CASEBOOK_EXCLUDE ?? "").split(",").filter(Boolean));
  const served = new Set<string>();
  const give = (ids: string[], via: "index" | "recall") => {
    const fresh = ids.filter((id) => !served.has(id));
    for (const id of fresh) served.add(id);
    store.serve(fresh, via, trial);
  };

  const call = (name: string, a: Record<string, any>) => {
    if (name === "recall") {
      if (off) return text("No memories.");
      const found = store.recall(String(a.query ?? ""), Math.max(1, Math.min(20, Number(a.k) || 5)), exclude);
      give(found.map((m) => m.id), "recall");
      return text(found.length ? found.map(describe).join("\n\n") : "No memory matches that.");
    }
    if (name === "remember") {
      if (trial) return text("Not stored: memories stay fixed during a duel trial.");
      if (off) return text("Not stored: memory is off for this session.");
      const tags = Array.isArray(a.tags) ? a.tags.map(String) : [];
      const r = store.remember(String(a.text ?? ""), tags, "agent");
      if (r.error) return text(r.error, true);
      if (r.duplicate) return text(`Already known as ${r.duplicate.id}${r.duplicate.status === "retired" ? `, which was retired (${r.duplicate.reason})` : ""}.`);
      const warn = r.conflicts.map((m) => `\nIt may conflict with ${m.id}: "${m.text}". If one of them is wrong, forget it.`).join("");
      return text(`Stored as ${r.id}, on probation until checks measure it.${warn}`);
    }
    if (name === "outcome") {
      if (trial) return text("Noted. A duel trial is graded by its check command.");
      if (off) return text("Noted.");
      const result = a.result === "solved" ? "solved" : "failed";
      const ids = store.outcome(result, [...served], a.note ? String(a.note).slice(0, 300) : undefined);
      return text(ids.length ? `Recorded ${result} for ${ids.join(", ")}.` : `Recorded ${result}; no memories were in context.`);
    }
    if (name === "forget") {
      if (trial || off) return text("Not changed: memory is fixed for this session.");
      const ok = store.setStatus(String(a.id), "retired", `forgotten: ${String(a.reason ?? "no reason given").slice(0, 200)}`);
      return text(ok ? `Retired ${a.id}.` : `No memory ${a.id}.`, !ok);
    }
    throw Object.assign(new Error(`unknown tool ${name}`), { code: -32602 });
  };

  return (msg: Msg): object | null => {
    if (msg.id === undefined || msg.id === null || !msg.method) return null; // notifications and responses
    const reply = (result: object) => ({ jsonrpc: "2.0", id: msg.id, result });
    try {
      const p = msg.params ?? {};
      if (msg.method === "initialize") {
        const ix = off ? null : store.index(undefined, exclude);
        if (ix) give(ix.ids, "index");
        return reply({
          protocolVersion: VERSIONS.includes(p.protocolVersion) ? p.protocolVersion : VERSIONS[1],
          capabilities: { tools: {} },
          serverInfo: { name: "casebook-memory", version },
          ...(ix ? { instructions: ix.text } : {}),
        });
      }
      if (msg.method === "ping") return reply({});
      if (msg.method === "tools/list") return reply({ tools: TOOLS });
      if (msg.method === "tools/call") return reply(call(String(p.name), p.arguments ?? {}));
      return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } };
    } catch (e) {
      const err = e as Error & { code?: number };
      return { jsonrpc: "2.0", id: msg.id, error: { code: err.code ?? -32603, message: err.message } };
    }
  };
}

export function runMcp(store: Store, version: string) {
  const handle = handler(store, version);
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg: Msg;
    try { msg = JSON.parse(line); } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }) + "\n");
      return;
    }
    const out = handle(msg);
    if (out) process.stdout.write(JSON.stringify(out) + "\n");
  });
}
