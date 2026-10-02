#!/usr/bin/env node
// Blocks commits that contain API keys or secrets.
//   node scripts/scan-secrets.mjs --staged    scan what is staged (git pre-commit hook)
//   node scripts/scan-secrets.mjs --pending   staged + modified + untracked files (Claude Code guard)
//   node scripts/scan-secrets.mjs --all       every tracked file (CI / npm run scan:secrets)
// Exit 1 when something is found. Findings never print the secret itself, only a masked preview.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  ["Groq API key", /\bgsk_[A-Za-z0-9]{20,}/],
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ["xAI API key", /\bxai-[A-Za-z0-9]{20,}/],
  ["Stripe key", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/],
  ["ElevenLabs API key", /\bsk_[a-f0-9]{40,}\b/],
  ["Resend API key", /\bre_[A-Za-z0-9]{24,}\b/],
  ["Twilio Account SID", /\bAC[a-f0-9]{32}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{30,}/],
  ["Private key block", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["Hard-coded secret assignment", /\b[A-Z0-9_]*(?:API_KEY|AUTH_TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*[=:]\s*["']?[A-Za-z0-9_\-/+]{20,}/],
];

const SKIP_FILE = /(^|\/)(package-lock\.json|\.env\.example)$|^food-media\/|\.(png|jpe?g|gif|ico|mp4|woff2?)$/i;
// A line can opt out with this marker (use only for obvious test fixtures).
const ALLOW_MARK = "secret-scan:allow";

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const lines = (out) => out.split("\n").map((s) => s.trim()).filter(Boolean);

const mode = process.argv.includes("--all") ? "all" : process.argv.includes("--pending") ? "pending" : "staged";

let files;
if (mode === "all") files = lines(git(["ls-files"]));
else if (mode === "pending")
  files = [...new Set([...lines(git(["diff", "--cached", "--name-only", "--diff-filter=ACM"])), ...lines(git(["ls-files", "-m", "-o", "--exclude-standard"]))])];
else files = lines(git(["diff", "--cached", "--name-only", "--diff-filter=ACM"]));

const mask = (s) => (s.length <= 10 ? "***" : `${s.slice(0, 6)}…(${s.length} chars)`);
const findings = [];

for (const file of files) {
  if (SKIP_FILE.test(file)) continue;
  let text;
  try {
    // For staged scans read the staged version, otherwise the working copy.
    text = mode === "staged" ? git(["show", `:${file}`]) : readFileSync(file, "utf8");
  } catch {
    continue; // deleted or unreadable
  }
  if (text.includes("\0")) continue; // binary
  text.split("\n").forEach((line, i) => {
    if (line.includes(ALLOW_MARK)) return;
    for (const [name, re] of PATTERNS) {
      const m = line.match(re);
      if (m) findings.push(`${file}:${i + 1}  ${name}  ${mask(m[0])}`);
    }
  });
}

if (findings.length) {
  console.error(`\n✖ Possible secrets found (${findings.length}). Nothing was committed.\n`);
  for (const f of findings) console.error("  " + f);
  console.error("\nMove the value into .env.local (git-ignored), and if a real key was exposed, revoke it and create a new one.");
  console.error(`If it is a harmless test fixture, add "${ALLOW_MARK}" on that line.\n`);
  process.exit(1);
}
console.log(`✓ secret scan clean (${mode}: ${files.length} files)`);
