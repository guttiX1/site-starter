// Shared helpers for the API routes: abuse protection and JSON responses.
//
// Rate limits use Upstash Redis (REST) when UPSTASH_REDIS_REST_URL/TOKEN are set, so limits are shared across
// serverless instances. Without it they fall back to per-instance memory, which is only best-effort.

const hits = new Map<string, number[]>();
const budgets = new Map<string, number>();

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

async function upstashIncr(key: string, ttlSec: number): Promise<number | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, ttlSec, "NX"]]),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const n = Number(((await res.json()) as { result?: unknown }[])?.[0]?.result);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null; // Redis down: fall back to memory rather than blocking customers
  }
}

/** True if this client has exceeded `max` requests in the window. */
export async function rateLimited(req: Request, bucket: string, max: number, windowMs = 60_000): Promise<boolean> {
  const ip = clientIp(req);
  const shared = await upstashIncr(`vm:${bucket}:${ip}:${Math.floor(Date.now() / windowMs)}`, Math.ceil(windowMs / 1000) * 2);
  if (shared !== null) return shared > max;

  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return false;
}

/** Global daily cap on a paid resource (all customers together). True once `max` calls have been made today. */
export async function budgetExceeded(name: string, max: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const shared = await upstashIncr(`vm:budget:${name}:${day}`, 2 * 86400);
  if (shared !== null) return shared > max;
  const key = `${name}:${day}`;
  const n = (budgets.get(key) ?? 0) + 1;
  budgets.set(key, n);
  if (budgets.size > 14) for (const k of budgets.keys()) if (!k.endsWith(day)) budgets.delete(k);
  return n > max;
}

/** Browsers always send Origin on cross-site POSTs; reject ones that don't match our host. */
export function crossSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false; // non-browser clients are handled by rate limits and budgets
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
