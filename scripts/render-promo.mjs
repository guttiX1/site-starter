#!/usr/bin/env node
// Renders the promo at /valley-meats/promo to an MP4, frame by frame, so the video is perfectly smooth
// regardless of how fast the computer is.
//
// Needs: the site running (npm run build && npm start), Playwright's Chromium, and ffmpeg (brew install ffmpeg).
// Usage: node scripts/render-promo.mjs [url] [output.mp4]
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium");
  process.exit(1);
}

const url = process.argv[2] || "http://localhost:3000/valley-meats/promo?export=1";
const out = process.argv[3] || "valley-meats-promo.mp4";
const HOLD_SECONDS = 1.0; // keep the logo on screen a little longer at the end

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__promo?.isReady === true, null, { timeout: 60_000 });
const { duration, fps } = await page.evaluate(() => ({ duration: window.__promo.duration, fps: window.__promo.fps }));
const frames = Math.round((duration + HOLD_SECONDS) * fps);

const ff = spawn(
  "ffmpeg",
  ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "-",
   "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-movflags", "+faststart", out],
  { stdio: ["pipe", "inherit", "inherit"] },
);
const done = new Promise((resolve, reject) => {
  ff.on("error", (e) => reject(new Error(`ffmpeg failed to start (${e.message}). Install it: brew install ffmpeg`)));
  ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
});

for (let i = 0; i < frames; i++) {
  const t = Math.min(i / fps, duration);
  const dataUrl = await page.evaluate((tt) => window.__promo.frame(tt), t);
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % fps === 0) process.stdout.write(`\rrendering ${Math.round((i / frames) * 100)}%`);
}
ff.stdin.end();
await done;
await browser.close();
console.log(`\rrendered ${frames} frames (${(frames / fps).toFixed(1)}s) -> ${out}`);
