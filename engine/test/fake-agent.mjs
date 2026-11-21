// A stand-in for a coding agent in the duel tests. Like a real MCP client it starts `casebook-memory mcp`, reads the
// server's instructions (the memory index) and answers only what a memory tells it: "the answer to <x> is <y>".
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
const prompt = fs.readFileSync(0, "utf8");
const topic = prompt.match(/answer to (\w+)/i)?.[1] ?? "nothing";

const srv = spawn(process.execPath, [cli, "mcp"], { env: process.env, stdio: ["pipe", "pipe", "inherit"] });
const lines = readline.createInterface({ input: srv.stdout });
const reply = new Promise((resolve) => lines.once("line", (l) => resolve(JSON.parse(l))));
srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fake", version: "0" } } }) + "\n");
const { result } = await reply;
const known = (result.instructions ?? "").match(new RegExp(`answer to ${topic} is (\\w+)`, "i"))?.[1] ?? "unknown";
fs.writeFileSync(`out_${topic}.txt`, known);
srv.kill();
