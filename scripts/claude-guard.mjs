#!/usr/bin/env node
// Claude Code PreToolUse guard (see .claude/settings.json). Reads the tool call as JSON on stdin and
// exits 2 (block, message to Claude) when:
//   - a Bash command runs `git commit` / `git push` and the pending changes contain a secret
//   - an Edit/Write targets a real .env file (only .env.example may be edited)
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

let input = "";
for await (const chunk of process.stdin) input += chunk;
let call = {};
try {
  call = JSON.parse(input);
} catch {
  process.exit(0); // never block on malformed input
}

const block = (msg) => {
  console.error(msg);
  process.exit(2);
};

const tool = call.tool_name;
const ti = call.tool_input || {};

if (tool === "Edit" || tool === "Write" || tool === "MultiEdit") {
  const base = path.basename(String(ti.file_path || ""));
  if (/^\.env(\..+)?$/.test(base) && base !== ".env.example") {
    block(`Blocked: ${base} holds real secrets and must not be edited by Claude. Ask the user to edit it themselves; use .env.example for documentation.`);
  }
}

if (tool === "Bash" && /\bgit\s+(commit|push)\b/.test(String(ti.command || ""))) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const r = spawnSync("node", [path.join(here, "scan-secrets.mjs"), "--pending"], { encoding: "utf8" });
  if (r.status === 1) block(`Blocked by secret scan:\n${r.stderr}`);
}
process.exit(0);
