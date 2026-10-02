"use client";

// Valley Meats promo: a deterministic canvas animation (1080×1920, 30 fps) in the style of a "creator spotlight"
// motion graphic — dark background, ember glow, big counting numbers with particle bursts, glowing cards, a stat
// panel with rolling digits, and a wireframe-globe logo with pulse rings.
//
// Everything is a pure function of time `t`, so `scripts/render-promo.mjs` can render it frame by frame to an MP4
// that is perfectly smooth no matter how fast the machine is. Open /valley-meats/promo to preview it live.

import { useEffect, useRef, useState } from "react";
import type { PromoCard, PromoData } from "@/lib/valley-meats/promo-data";

const W = 1080;
const H = 1920;
const FPS = 30;

// Palette — swap these to re-theme the whole video (the reference video used neon lime #b6ff2e).
const ACCENT = "#ff6a1f"; // ember orange
const GOLD = "#ffb627";
const HOT = "#ff3d2e";
const BG = "#070605";
const DIM = "rgba(255,255,255,0.62)";

const XF = 0.22; // half-length of the zoom/blur transition between scenes (seconds)

type Ctx = CanvasRenderingContext2D;
type Fonts = { sans: string; mono: string };
type Images = Partial<Record<PromoCard["img"], HTMLImageElement>>;
type Scene = { dur: number; draw: (c: Ctx, t: number) => void };

// ---- math -------------------------------------------------------------------------------------------------------
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const eOut = (x: number) => 1 - Math.pow(1 - x, 3);
const eInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const eExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---- drawing primitives -----------------------------------------------------------------------------------------
function glow(c: Ctx, x: number, y: number, r: number, color: string, a: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

type TextOpts = {
  size: number;
  weight?: number;
  color?: string;
  align?: CanvasTextAlign;
  font?: "sans" | "mono";
  glow?: number;
  glowColor?: string;
  spacing?: number;
};
function text(c: Ctx, F: Fonts, s: string, x: number, y: number, o: TextOpts) {
  c.save();
  c.font = `${o.weight ?? 700} ${o.size}px ${o.font === "mono" ? F.mono : F.sans}`;
  c.letterSpacing = `${o.spacing ?? 0}px`;
  c.textAlign = o.align ?? "center";
  c.textBaseline = "alphabetic";
  c.fillStyle = o.color ?? "#fff";
  if (o.glow) {
    c.shadowColor = o.glowColor ?? ACCENT;
    c.shadowBlur = o.glow;
  }
  c.fillText(s, x, y);
  c.restore();
}

/** Lowercase headline where the last part is the accent word; parts rise in one after another. */
function headline(c: Ctx, F: Fonts, parts: [string, string], y: number, t: number, size = 88) {
  c.save();
  c.font = `800 ${size}px ${F.sans}`;
  c.letterSpacing = `${-size * 0.035}px`;
  const widths = parts.map((p) => c.measureText(p).width);
  let x = W / 2 - (widths[0] + widths[1]) / 2;
  parts.forEach((p, i) => {
    const q = eOut(seg(t, 0.05 + i * 0.16, 0.6 + i * 0.16));
    c.globalAlpha = q;
    c.textAlign = "left";
    c.fillStyle = i === 1 ? ACCENT : "#fff";
    if (i === 1) {
      c.shadowColor = ACCENT;
      c.shadowBlur = 30;
    }
    c.fillText(p, x, y + (1 - q) * 46);
    c.shadowBlur = 0;
    x += widths[i];
  });
  c.restore();
}

function pill(c: Ctx, F: Fonts, label: string, x: number, y: number, a: number) {
  c.save();
  c.globalAlpha = a;
  c.font = `600 24px ${F.mono}`;
  c.letterSpacing = "3px";
  const w = c.measureText(label).width + 76;
  rr(c, x, y, w, 52, 26);
  c.fillStyle = "rgba(255,255,255,0.06)";
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.2)";
  c.lineWidth = 2;
  c.stroke();
  c.fillStyle = ACCENT;
  c.shadowColor = ACCENT;
  c.shadowBlur = 14;
  c.beginPath();
  c.arc(x + 28, y + 26, 7, 0, Math.PI * 2);
  c.fill();
  c.shadowBlur = 0;
  c.fillStyle = "rgba(255,255,255,0.85)";
  c.textBaseline = "middle";
  c.fillText(label, x + 48, y + 27);
  c.restore();
}

/** Particle burst (deterministic). `age` is seconds since the burst started. */
function burst(c: Ctx, cx: number, cy: number, age: number, seed: number, n = 150, power = 1) {
  if (age < 0 || age > 2.4) return;
  const r = rng(seed);
  c.save();
  for (let i = 0; i < n; i++) {
    const ang = r() * Math.PI * 2;
    const sp = (180 + r() * 900) * power;
    const life = 0.7 + r() * 1.5;
    const size = 1.5 + r() * 4.5;
    const col = r();
    const k = 2.4;
    const dist = (sp * (1 - Math.exp(-age * k))) / k;
    const x = cx + Math.cos(ang) * dist;
    const y = cy + Math.sin(ang) * dist * 0.62 + age * age * 70;
    const a = clamp(1 - age / life);
    if (a <= 0) continue;
    c.globalAlpha = a;
    c.fillStyle = col < 0.45 ? ACCENT : col < 0.75 ? GOLD : "#fff";
    c.beginPath();
    c.arc(x, y, size * (0.6 + 0.4 * a), 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** Ambient embers drifting upward. */
function embers(c: Ctx, t: number) {
  const r = rng(99);
  c.save();
  for (let i = 0; i < 70; i++) {
    const x0 = r() * W;
    const speed = 40 + r() * 90;
    const phase = r() * H;
    const y = H - ((phase + t * speed) % (H + 100));
    const x = x0 + Math.sin(t * (0.5 + r()) + i) * 30;
    const a = 0.15 + r() * 0.45;
    c.globalAlpha = a * (0.6 + 0.4 * Math.sin(t * 3 + i));
    c.fillStyle = r() < 0.5 ? ACCENT : GOLD;
    c.beginPath();
    c.arc(x, y, 1.2 + r() * 2.4, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** Draw an image to fit (contain) inside a box. */
function drawContain(c: Ctx, img: HTMLImageElement | undefined, x: number, y: number, w: number, h: number) {
  if (!img || !img.naturalWidth) return;
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * s;
  const ih = img.naturalHeight * s;
  c.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

/** A number that rolls up to `target` with motion blur, then pops. */
function rollingMoney(c: Ctx, F: Fonts, targetCents: number, x: number, y: number, p: number, o: TextOpts) {
  const v = Math.round(targetCents * eExpo(p));
  c.save();
  if (p < 1) c.filter = `blur(${(1 - p) * 5}px)`;
  text(c, F, money(v), x, y, o);
  c.restore();
}

function micGlyph(c: Ctx, x: number, y: number, s: number, color: string) {
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = s * 0.09;
  c.lineCap = "round";
  rr(c, x - s * 0.17, y - s * 0.42, s * 0.34, s * 0.58, s * 0.17);
  c.fill();
  c.beginPath();
  c.arc(x, y - s * 0.08, s * 0.3, 0.1 * Math.PI, 0.9 * Math.PI);
  c.stroke();
  c.beginPath();
  c.moveTo(x, y + s * 0.22);
  c.lineTo(x, y + s * 0.38);
  c.moveTo(x - s * 0.16, y + s * 0.38);
  c.lineTo(x + s * 0.16, y + s * 0.38);
  c.stroke();
  c.restore();
}

function wrapLines(c: Ctx, s: string, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (c.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---- scenes -----------------------------------------------------------------------------------------------------
function buildScenes(D: PromoData, F: Fonts, I: Images): Scene[] {
  // 1 — hook: "two street tacos" → $7.50 with a burst
  const hook: Scene = {
    dur: 3.6,
    draw(c, t) {
      // photo backdrop, slowly pushing in, dimmed like the reference's background footage
      c.save();
      c.globalAlpha = 0.5 * eOut(seg(t, 0, 0.8));
      const s = 1.55 + t * 0.03;
      c.translate(W / 2, 1520);
      c.scale(s, s);
      drawContain(c, I.tacos, -500, -210, 1000, 420);
      c.restore();
      // Feather the photo's top and bottom edges into the background (erases only the photo: it's alone on this layer).
      c.save();
      c.globalCompositeOperation = "destination-out";
      const fade = c.createLinearGradient(0, 1150, 0, 1920);
      fade.addColorStop(0, "rgba(0,0,0,1)");
      fade.addColorStop(0.4, "rgba(0,0,0,0.25)");
      fade.addColorStop(0.75, "rgba(0,0,0,0.3)");
      fade.addColorStop(1, "rgba(0,0,0,0.9)");
      c.fillStyle = fade;
      c.fillRect(0, 1150, W, 770);
      c.fillStyle = "#000";
      c.fillRect(0, 0, W, 1150);
      c.restore();

      pill(c, F, `${D.name.toUpperCase()} · ORDER BY VOICE`, 60, 130, eOut(seg(t, 0.05, 0.5)));
      const a1 = eOut(seg(t, 0.2, 0.7));
      c.globalAlpha = a1;
      text(c, F, `two ${D.tacoName.toLowerCase()}s`, W / 2, 760 + (1 - a1) * 30, { size: 46, weight: 500, color: DIM });
      c.globalAlpha = 1;

      const p = seg(t, 0.45, 1.55);
      const land = t - 1.55;
      const pop = land > 0 ? 1 + 0.07 * Math.exp(-land * 7) * Math.cos(land * 22) : 1;
      c.save();
      c.translate(W / 2, 960);
      c.scale(pop, pop);
      rollingMoney(c, F, D.twoTacosCents, 0, 0, p, { size: 250, weight: 800, glow: 60, spacing: -6 });
      c.restore();
      burst(c, W / 2, 880, land, 7, 170, 1.1);

      const a2 = eOut(seg(t, 1.8, 2.4));
      c.globalAlpha = a2;
      text(c, F, D.proteins.join(" · "), W / 2, 1075, { size: 30, weight: 500, font: "mono", color: rgba(GOLD, 0.9), spacing: 1 });
      c.globalAlpha = 1;
    },
  };

  // 2 — pick your protein: blocks rise, a selector sweeps and lands
  const protein: Scene = {
    dur: 3.6,
    draw(c, t) {
      headline(c, F, ["pick your ", "protein."], 470, t);
      const a = eOut(seg(t, 0.35, 0.8));
      c.globalAlpha = a;
      text(c, F, `${D.proteins.length} ways to build it.`, W / 2, 545, { size: 36, weight: 500, color: DIM });
      c.globalAlpha = 1;

      const n = D.proteins.length;
      const colW = 150;
      const gap = 34;
      const x0 = W / 2 - (n * colW + (n - 1) * gap) / 2;
      const base = 1360;
      const fullH = 500;
      let sel = -1;
      if (t > 1.7) sel = t < 2.75 ? Math.floor((t - 1.7) / 0.21) % n : 0;
      const settled = t >= 2.75;
      for (let i = 0; i < n; i++) {
        const p = clamp(eBack(seg(t, 0.5 + i * 0.12, 1.25 + i * 0.12)), 0, 1.15);
        const h = fullH * p;
        const x = x0 + i * (colW + gap);
        const isSel = i === sel;
        c.save();
        if (isSel) {
          c.shadowColor = ACCENT;
          c.shadowBlur = settled ? 70 : 40;
        }
        const g = c.createLinearGradient(0, base - h, 0, base);
        if (isSel) {
          g.addColorStop(0, GOLD);
          g.addColorStop(0.5, ACCENT);
          g.addColorStop(1, HOT);
        } else {
          g.addColorStop(0, "#3a3633");
          g.addColorStop(1, "#141211");
        }
        c.fillStyle = g;
        rr(c, x, base - h, colW, h, 14);
        c.fill();
        c.shadowBlur = 0;
        // top face for a little depth
        c.fillStyle = isSel ? rgba("#ffffff", 0.35) : "rgba(255,255,255,0.08)";
        c.beginPath();
        c.moveTo(x + 10, base - h);
        c.lineTo(x + colW - 10, base - h);
        c.lineTo(x + colW - 26, base - h - 18 * Math.min(p, 1));
        c.lineTo(x + 26, base - h - 18 * Math.min(p, 1));
        c.closePath();
        c.fill();
        c.restore();
        // label under the block
        c.save();
        c.globalAlpha = eOut(seg(t, 0.9 + i * 0.1, 1.3 + i * 0.1));
        c.font = `600 24px ${F.mono}`;
        const lines = wrapLines(c, D.proteins[i], colW + 20);
        lines.forEach((ln, k) =>
          text(c, F, ln, x + colW / 2, base + 50 + k * 30, { size: 24, weight: 600, font: "mono", color: isSel ? GOLD : DIM }),
        );
        c.restore();
      }
      if (settled) {
        const q = eOut(seg(t, 2.75, 3.1));
        c.globalAlpha = q;
        text(c, F, `${money(D.tacoPriceCents)} each`, x0 + colW / 2, base - fullH - 60 - (1 - q) * 20, {
          size: 40,
          weight: 700,
          font: "mono",
          color: GOLD,
          glow: 24,
          glowColor: GOLD,
        });
        c.globalAlpha = 1;
      }
    },
  };

  // 3 — meet your new waiter: glowing profile card + pickup-time ring
  const waiter: Scene = {
    dur: 3.8,
    draw(c, t) {
      headline(c, F, ["meet your new ", "waiter."], 430, t, 82);
      const s1 = eOut(seg(t, 0.35, 0.8));
      c.globalAlpha = s1;
      text(c, F, "it answers, takes the order, reads it back.", W / 2, 505, { size: 34, weight: 500, color: DIM });
      c.globalAlpha = 1;

      // card
      const p = eOut(seg(t, 0.35, 1.1));
      c.save();
      c.globalAlpha = p;
      c.translate(W / 2, 880 + (1 - p) * 120);
      c.scale(0.9 + 0.1 * p, 0.75 + 0.25 * p);
      if (p < 1) c.filter = `blur(${(1 - p) * 10}px)`;
      const cw = 900;
      const ch = 330;
      rr(c, -cw / 2, -ch / 2, cw, ch, 34);
      c.fillStyle = "rgba(20,17,15,0.94)";
      c.fill();
      c.shadowColor = GOLD;
      c.shadowBlur = 36;
      c.strokeStyle = GOLD;
      c.lineWidth = 3;
      c.stroke();
      c.shadowBlur = 0;
      // moving sheen along the top edge
      const sx = -cw / 2 + ((t * 0.55) % 1) * (cw + 400) - 200;
      const sheen = c.createLinearGradient(sx - 120, 0, sx + 120, 0);
      sheen.addColorStop(0, "rgba(255,255,255,0)");
      sheen.addColorStop(0.5, "rgba(255,240,200,0.5)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      c.strokeStyle = sheen;
      c.lineWidth = 4;
      rr(c, -cw / 2, -ch / 2, cw, ch, 34);
      c.stroke();
      // avatar
      const ax = -cw / 2 + 150;
      const avatar = c.createRadialGradient(ax - 30, -30, 10, ax, 0, 105);
      avatar.addColorStop(0, GOLD);
      avatar.addColorStop(0.6, ACCENT);
      avatar.addColorStop(1, HOT);
      c.fillStyle = avatar;
      c.shadowColor = ACCENT;
      c.shadowBlur = 40;
      c.beginPath();
      c.arc(ax, 0, 100, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
      micGlyph(c, ax, 4, 120, "#fff");
      // text
      const tx = ax + 150;
      text(c, F, `${D.name.toUpperCase()} AI`, tx, -38, { size: 44, weight: 700, font: "mono", align: "left", color: GOLD, spacing: 1 });
      text(c, F, "voice ordering assistant", tx, 12, { size: 32, weight: 500, align: "left", color: DIM });
      let px = tx;
      for (const tag of ["orders", "questions", "checkout"]) {
        c.font = `600 24px ${F.mono}`;
        const w = c.measureText(tag).width + 36;
        rr(c, px, 48, w, 44, 22);
        c.strokeStyle = rgba(ACCENT, 0.8);
        c.lineWidth = 2;
        c.stroke();
        text(c, F, tag, px + w / 2, 79, { size: 24, weight: 600, font: "mono", color: "#fff" });
        px += w + 14;
      }
      c.restore();

      // ring with pickup minutes
      const rp = eInOut(seg(t, 1.3, 2.6));
      const ra = eOut(seg(t, 1.1, 1.5));
      const cx = W / 2;
      const cy = 1390;
      const R = 170;
      c.save();
      c.globalAlpha = ra;
      c.lineWidth = 18;
      c.strokeStyle = "rgba(255,255,255,0.08)";
      c.beginPath();
      c.arc(cx, cy, R, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = GOLD;
      c.shadowColor = GOLD;
      c.shadowBlur = 30 + 15 * Math.sin(t * 6);
      c.lineCap = "round";
      c.beginPath();
      c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, rp));
      c.stroke();
      c.restore();
      c.globalAlpha = ra;
      text(c, F, String(Math.round(D.pickupMin * rp)), cx, cy + 40, { size: 130, weight: 800, font: "mono", glow: 30, glowColor: GOLD });
      text(c, F, "MIN PICKUP", cx, cy + 92, { size: 26, weight: 600, font: "mono", color: DIM, spacing: 3 });
      c.globalAlpha = eOut(seg(t, 2.5, 2.9));
      text(c, F, `~${D.pickupMin} min pickup · ~${D.deliveryMin} min delivery`, cx, cy + R + 95, { size: 30, weight: 500, color: DIM });
      c.globalAlpha = 1;
    },
  };

  // 4 — absolute flavor: photo cards stack in, item counter climbs
  const flavor: Scene = {
    dur: 4.2,
    draw(c, t) {
      headline(c, F, ["absolute ", "flavor."], 400, t, 92);
      const s1 = eOut(seg(t, 0.35, 0.8));
      c.globalAlpha = s1;
      text(c, F, D.categories.join(" · "), W / 2, 478, { size: 28, weight: 500, font: "mono", color: DIM });
      c.globalAlpha = 1;

      const starts = D.cards.map((_, i) => 0.45 + i * 0.75);
      const cw = 640;
      const ch = 780;
      D.cards.forEach((card, i) => {
        const e = eOut(seg(t, starts[i], starts[i] + 0.5));
        if (e <= 0) return;
        let depth = 0;
        for (let j = i + 1; j < D.cards.length; j++) depth += eOut(seg(t, starts[j], starts[j] + 0.5));
        c.save();
        c.globalAlpha = clamp(1 - depth * 0.28, 0.25, 1) * e;
        c.translate(lerp(W + 420, W / 2 + 40, e) - depth * 55, 1010 - depth * 34);
        c.rotate(lerp(0.32, 0, e) - depth * 0.055);
        c.scale(1 - depth * 0.07, 1 - depth * 0.07);
        if (e < 1) c.filter = `blur(${(1 - e) * 8}px)`;
        rr(c, -cw / 2, -ch / 2, cw, ch, 30);
        c.fillStyle = "#11100f";
        c.fill();
        c.shadowColor = ACCENT;
        c.shadowBlur = depth < 0.5 ? 40 : 0;
        c.strokeStyle = depth < 0.5 ? ACCENT : "rgba(255,255,255,0.12)";
        c.lineWidth = 3;
        c.stroke();
        c.shadowBlur = 0;
        // photo on a warm glow
        c.save();
        rr(c, -cw / 2 + 16, -ch / 2 + 16, cw - 32, ch * 0.7, 22);
        c.clip();
        c.fillStyle = "#0b0a09";
        c.fillRect(-cw / 2, -ch / 2, cw, ch);
        glow(c, 0, -ch / 2 + ch * 0.36, 360, ACCENT, 0.35);
        const zoom = 1 + 0.06 * seg(t, starts[i], starts[i] + 3);
        c.translate(0, -ch / 2 + 16 + ch * 0.35);
        c.scale(zoom, zoom);
        drawContain(c, I[card.img], -(cw - 60) / 2, -ch * 0.33, cw - 60, ch * 0.66);
        c.restore();
        // caption
        text(c, F, card.title, -cw / 2 + 36, ch / 2 - 110, { size: 40, weight: 700, align: "left", color: "#fff" });
        if (card.priceCents != null) {
          text(c, F, money(card.priceCents), cw / 2 - 36, ch / 2 - 110, { size: 40, weight: 700, font: "mono", align: "right", color: GOLD });
        }
        c.font = `600 22px ${F.mono}`;
        text(c, F, D.name.toUpperCase(), -cw / 2 + 36, ch / 2 - 54, { size: 22, weight: 600, font: "mono", align: "left", color: rgba(ACCENT, 0.9), spacing: 3 });
        c.restore();
      });

      // item counter (bottom-left), like the reference's live counter
      const cp = seg(t, 0.6, 3.4);
      const ca = eOut(seg(t, 0.5, 0.9));
      c.globalAlpha = ca;
      c.save();
      c.fillStyle = HOT;
      c.shadowColor = HOT;
      c.shadowBlur = 20;
      // little flame
      c.beginPath();
      c.moveTo(100, 1585);
      c.quadraticCurveTo(70, 1545, 100, 1500);
      c.quadraticCurveTo(108, 1530, 122, 1525);
      c.quadraticCurveTo(140, 1560, 100, 1585);
      c.fill();
      c.restore();
      text(c, F, String(Math.round(D.itemCount * eOut(cp))), 150, 1585, { size: 110, weight: 800, font: "mono", align: "left", glow: 30 });
      text(c, F, "ITEMS ON THE MENU", 152, 1630, { size: 24, weight: 600, font: "mono", align: "left", color: DIM, spacing: 3 });
      c.globalAlpha = 1;
    },
  };

  // 5 — just say it: voice → order → rolling totals
  const say: Scene = {
    dur: 4.0,
    draw(c, t) {
      headline(c, F, ["just ", "say it."], 400, t, 96);
      // user bubble (typing)
      const typed = D.sample.utterance.slice(0, Math.floor(D.sample.utterance.length * seg(t, 0.3, 1.4)));
      const ua = eOut(seg(t, 0.2, 0.45));
      c.save();
      c.globalAlpha = ua;
      c.font = `500 38px ${F.sans}`;
      const lines = wrapLines(c, D.sample.utterance, 600);
      const shownLines = wrapLines(c, typed || " ", 600);
      const bw = Math.max(...lines.map((l) => c.measureText(l).width)) + 64;
      const bh = lines.length * 50 + 44;
      const bx = 990 - bw;
      const by = 560;
      const ug = c.createLinearGradient(bx, by, bx + bw, by + bh);
      ug.addColorStop(0, ACCENT);
      ug.addColorStop(1, HOT);
      rr(c, bx, by, bw, bh, 30);
      c.fillStyle = ug;
      c.shadowColor = ACCENT;
      c.shadowBlur = 30;
      c.fill();
      c.shadowBlur = 0;
      shownLines.forEach((ln, k) => text(c, F, ln, bx + 32, by + 64 + k * 50, { size: 38, weight: 500, align: "left" }));
      // live mic waveform while speaking
      if (t < 1.6) {
        for (let k = 0; k < 7; k++) {
          const hgt = 14 + Math.abs(Math.sin(t * 14 + k * 1.3)) * 46 * (t < 1.4 ? 1 : 0.2);
          c.fillStyle = rgba(GOLD, 0.9);
          rr(c, bx - 110 + k * 14, by + bh / 2 - hgt / 2, 8, hgt, 4);
          c.fill();
        }
      }
      c.restore();

      // assistant reply
      const rp = eBack(seg(t, 1.55, 1.95));
      if (rp > 0) {
        c.save();
        c.font = `500 36px ${F.sans}`;
        const rl = wrapLines(c, D.sample.reply, 620);
        const rw = Math.max(...rl.map((l) => c.measureText(l).width)) + 64;
        const rh = rl.length * 48 + 44;
        const rx = 90;
        const ry = 560 + bh + 50;
        c.globalAlpha = clamp(rp);
        c.translate(rx, ry + rh);
        c.scale(clamp(rp, 0, 1.2), clamp(rp, 0, 1.2));
        c.translate(-rx, -(ry + rh));
        rr(c, rx, ry, rw, rh, 30);
        c.fillStyle = "#1b1816";
        c.fill();
        c.strokeStyle = "rgba(255,255,255,0.14)";
        c.lineWidth = 2;
        c.stroke();
        rl.forEach((ln, k) => text(c, F, ln, rx + 32, ry + 62 + k * 48, { size: 36, weight: 500, align: "left" }));
        c.restore();
      }

      // receipt panel with rolling digits
      const pa = eOut(seg(t, 1.9, 2.3));
      const pp = seg(t, 2.05, 3.05);
      const top = 1180;
      c.save();
      c.globalAlpha = pa;
      c.translate(0, (1 - pa) * 60);
      rr(c, 90, top, 900, 330, 28);
      c.fillStyle = "rgba(16,14,13,0.95)";
      c.fill();
      c.strokeStyle = rgba(GOLD, 0.8);
      c.shadowColor = GOLD;
      c.shadowBlur = 24;
      c.lineWidth = 2.5;
      c.stroke();
      c.shadowBlur = 0;
      const cols: [string, number, string][] = [
        ["SUBTOTAL", D.sample.subtotalCents, "#fff"],
        ["TAX", D.sample.taxCents, rgba(HOT, 1)],
        ["TOTAL", D.sample.totalCents, GOLD],
      ];
      cols.forEach(([label, cents, color], i) => {
        const x = 150 + i * 290;
        text(c, F, label, x, top + 80, { size: 24, weight: 600, font: "mono", align: "left", color: DIM, spacing: 3 });
        rollingMoney(c, F, cents, x, top + 160, pp, {
          size: 62,
          weight: 800,
          font: "mono",
          align: "left",
          color,
          glow: i === 2 ? 26 : 0,
          glowColor: GOLD,
        });
      });
      c.strokeStyle = "rgba(255,255,255,0.08)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(130, top + 215);
      c.lineTo(950, top + 215);
      c.stroke();
      text(c, F, `PICKUP ~${D.pickupMin} MIN`, 150, top + 280, { size: 26, weight: 600, font: "mono", align: "left", color: ACCENT, spacing: 2 });
      text(c, F, "READ BACK BEFORE IT'S PLACED", 930, top + 280, { size: 22, weight: 600, font: "mono", align: "right", color: DIM, spacing: 2 });
      c.restore();
    },
  };

  // 6 — logo: wireframe globe, pulse rings, wordmark
  const logo: Scene = {
    dur: 3.6,
    draw(c, t) {
      const cx = W / 2;
      const cy = 900;
      // pulse rings
      for (let k = 0; k < 3; k++) {
        const f = (t * 0.7 + k / 3) % 1;
        c.save();
        c.globalAlpha = (1 - f) * 0.55 * eOut(seg(t, 0, 0.4));
        c.strokeStyle = ACCENT;
        c.lineWidth = 6;
        c.shadowColor = ACCENT;
        c.shadowBlur = 30;
        c.beginPath();
        c.arc(cx, cy, 230 + f * 680, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
      // wireframe globe
      const sp = eBack(seg(t, 0, 0.7));
      const R = 280 * sp;
      if (R > 1) {
        c.save();
        c.strokeStyle = ACCENT;
        c.lineWidth = 5;
        c.shadowColor = ACCENT;
        c.shadowBlur = 28;
        c.beginPath();
        c.arc(cx, cy, R, 0, Math.PI * 2);
        c.stroke();
        for (const lat of [-60, -30, 0, 30, 60]) {
          const phi = (lat * Math.PI) / 180;
          c.beginPath();
          c.ellipse(cx, cy + R * Math.sin(phi), R * Math.cos(phi), R * Math.cos(phi) * 0.16, 0, 0, Math.PI * 2);
          c.stroke();
        }
        const rot = t * 0.9;
        for (let k = 0; k < 6; k++) {
          const th = rot + (k * Math.PI) / 6;
          c.beginPath();
          c.ellipse(cx, cy, Math.abs(Math.sin(th)) * R, R, 0, 0, Math.PI * 2);
          c.stroke();
        }
        c.restore();
      }
      // wordmark
      const wp = eBack(seg(t, 0.2, 0.85));
      c.save();
      c.translate(cx, cy + 40);
      c.scale(wp, wp);
      if (wp < 1) c.filter = `blur(${(1 - clamp(wp)) * 8}px)`;
      c.font = `900 124px ${F.sans}`;
      c.letterSpacing = "-4px";
      c.textAlign = "center";
      const chrome = c.createLinearGradient(0, -100, 0, 20);
      chrome.addColorStop(0, "#ffffff");
      chrome.addColorStop(0.55, "#e9e2da");
      chrome.addColorStop(0.56, "#a39a91");
      chrome.addColorStop(1, "#f4efe9");
      c.lineWidth = 10;
      c.strokeStyle = "#0a0908";
      c.strokeText(D.name.toUpperCase(), 0, 0);
      c.shadowColor = ACCENT;
      c.shadowBlur = 40;
      c.fillStyle = chrome;
      c.fillText(D.name.toUpperCase(), 0, 0);
      c.restore();
      // tagline
      const a1 = eOut(seg(t, 0.85, 1.25));
      c.globalAlpha = a1;
      text(c, F, "order by voice.", cx, 1330 + (1 - a1) * 30, { size: 68, weight: 800, color: ACCENT, glow: 30, spacing: -2 });
      const a2 = eOut(seg(t, 1.05, 1.45));
      c.globalAlpha = a2;
      text(c, F, "pickup & delivery", cx, 1400, { size: 36, weight: 500, color: DIM });
      c.globalAlpha = 1;
      // entrance flash
      const fl = 1 - seg(t, 0, 0.35);
      if (fl > 0) glow(c, cx, cy, 900, "#ffffff", 0.45 * fl);
    },
  };

  return [hook, protein, waiter, flavor, say, logo];
}

// ---- renderer ---------------------------------------------------------------------------------------------------
class Renderer {
  scenes: Scene[];
  starts: number[];
  duration: number;
  layer: HTMLCanvasElement;
  noise: HTMLCanvasElement;

  constructor(
    private c: Ctx,
    D: PromoData,
    F: Fonts,
    I: Images,
  ) {
    this.scenes = buildScenes(D, F, I);
    this.starts = [];
    let acc = 0;
    for (const s of this.scenes) {
      this.starts.push(acc);
      acc += s.dur;
    }
    this.duration = acc;
    this.layer = document.createElement("canvas");
    this.layer.width = W;
    this.layer.height = H;
    // film grain tile
    this.noise = document.createElement("canvas");
    this.noise.width = this.noise.height = 256;
    const nc = this.noise.getContext("2d")!;
    const img = nc.createImageData(256, 256);
    const r = rng(5);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(r() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    nc.putImageData(img, 0, 0);
  }

  render(t: number) {
    const c = this.c;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.filter = "none";
    // background
    c.fillStyle = BG;
    c.fillRect(0, 0, W, H);
    glow(c, W * 0.5 + Math.sin(t * 0.6) * 220, H * 0.6 + Math.cos(t * 0.45) * 160, 820, ACCENT, 0.26);
    glow(c, W * 0.18 + Math.cos(t * 0.35) * 140, H * 0.22, 560, HOT, 0.12);
    glow(c, W * 0.85, H * 0.85 + Math.sin(t * 0.5) * 80, 520, GOLD, 0.08);
    embers(c, t);

    // scenes with zoom + blur transitions
    const lc = this.layer.getContext("2d")!;
    this.scenes.forEach((s, i) => {
      const st = this.starts[i];
      const en = st + s.dur;
      if (t < st - XF || t > en + XF) return;
      const last = i === this.scenes.length - 1;
      const e = i === 0 ? 1 : eInOut(seg(t, st - XF, st + XF));
      const x = last ? 0 : eInOut(seg(t, en - XF, en + XF));
      const alpha = e * (1 - x);
      if (alpha <= 0.001) return;
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.globalAlpha = 1;
      lc.filter = "none";
      lc.clearRect(0, 0, W, H);
      s.draw(lc, Math.max(0, t - st));
      const scale = lerp(0.93, 1, e) * lerp(1, 1.14, x);
      const blur = (1 - e) * 12 + x * 16;
      c.save();
      c.globalAlpha = alpha;
      if (blur > 0.2) c.filter = `blur(${blur}px)`;
      c.translate(W / 2, H / 2);
      c.scale(scale, scale);
      c.drawImage(this.layer, -W / 2, -H / 2);
      c.restore();
    });

    // grain + vignette
    c.save();
    c.globalAlpha = 0.07;
    c.globalCompositeOperation = "overlay";
    const ox = (Math.floor(t * FPS) * 97) % 256;
    const oy = (Math.floor(t * FPS) * 57) % 256;
    c.translate(-ox, -oy);
    c.fillStyle = c.createPattern(this.noise, "repeat")!;
    c.fillRect(0, 0, W + 256, H + 256);
    c.restore();
    const v = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.7)");
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
    c.restore();
  }
}

declare global {
  interface Window {
    __promo?: { isReady: boolean; duration: number; fps: number; frame: (t: number) => string };
  }
}

async function loadImage(src: string) {
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    /* missing image: scene draws without it */
  }
  return img;
}

export default function Promo({ data }: { data: PromoData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playingRef = useRef(true);
  const seekRef = useRef<number | null>(null);
  playingRef.current = playing;

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    (async () => {
      const canvas = ref.current!;
      const c = canvas.getContext("2d")!;
      const css = getComputedStyle(document.body);
      const fonts: Fonts = {
        sans: css.getPropertyValue("--font-geist-sans").trim() || "system-ui, sans-serif",
        mono: css.getPropertyValue("--font-geist-mono").trim() || "ui-monospace, monospace",
      };
      await Promise.all(
        ["500", "600", "700", "800", "900"].flatMap((w) => [
          document.fonts.load(`${w} 64px ${fonts.sans}`),
          document.fonts.load(`${w} 64px ${fonts.mono}`),
        ]),
      ).catch(() => {});
      await document.fonts.ready;
      const entries = await Promise.all(
        (["tacos", "asada", "bowl", "tray"] as const).map(async (k) => [k, await loadImage(`/promo/${k}.png`)] as const),
      );
      if (cancelled) return;
      const r = new Renderer(c, data, fonts, Object.fromEntries(entries));
      setDuration(r.duration);
      window.__promo = {
        isReady: true,
        duration: r.duration,
        fps: FPS,
        frame: (t: number) => {
          r.render(t);
          return canvas.toDataURL("image/jpeg", 0.95);
        },
      };
      if (new URLSearchParams(location.search).has("export")) {
        r.render(0);
        return; // the render script drives frames itself
      }
      let t0 = performance.now();
      let tt = 0;
      const loop = (now: number) => {
        if (seekRef.current != null) {
          tt = seekRef.current;
          seekRef.current = null;
        } else if (playingRef.current) tt += (now - t0) / 1000;
        t0 = now;
        if (tt > r.duration + 1) tt = 0; // hold the logo for a second, then loop
        r.render(Math.min(tt, r.duration));
        setTime(tt);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [data]);

  return (
    <main style={{ minHeight: "100vh", background: "#000", display: "grid", placeItems: "center", padding: 16, gap: 12 }}>
      <canvas
        ref={ref}
        width={W}
        height={H}
        style={{ height: "min(86vh, calc((100vw - 32px) * 16 / 9))", aspectRatio: "9 / 16", borderRadius: 12, background: BG }}
        aria-label={`${data.name} promo animation`}
      />
      <div style={{ display: "flex", gap: 10, alignItems: "center", color: "#bbb", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
        <button onClick={() => setPlaying((p) => !p)} style={btn}>
          {playing ? "Pause" : "Play"}
        </button>
        <button onClick={() => (seekRef.current = 0)} style={btn}>
          Restart
        </button>
        <span>
          {Math.min(time, duration).toFixed(1)}s / {duration.toFixed(1)}s
        </span>
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  border: "1px solid #444",
  background: "#111",
  color: "#eee",
  cursor: "pointer",
};
