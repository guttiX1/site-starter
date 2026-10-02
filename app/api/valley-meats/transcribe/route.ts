import { MENU, MEATS } from "@/lib/valley-meats/menu";
import { budgetExceeded, crossSite, json, rateLimited } from "@/lib/valley-meats/http";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;

// Whisper does better on menu vocabulary (al pastor, suadero, buche…) with a hint.
const VOCAB_PROMPT = `Valley Meats Mexican restaurant order. Menu: ${MENU.map((m) => m.name)
  .concat(MEATS, ["salsa naranja", "salsa verde"])
  .join(", ")}.`;

/** Speech-to-text via OpenAI Whisper. */
export async function POST(req: Request) {
  if (crossSite(req)) return json({ error: "Forbidden." }, 403);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: "OPENAI_API_KEY is not configured." }, 503);
  if (await rateLimited(req, "stt", 30)) return json({ error: "Too many requests." }, 429);
  if (await budgetExceeded("stt", Number(process.env.DAILY_VOICE_CALL_LIMIT) || 3000)) return json({ error: "Voice is busy right now." }, 503);

  let audio: File;
  try {
    const form = await req.formData();
    const f = form.get("audio");
    if (!(f instanceof File)) return json({ error: "Missing audio." }, 400);
    audio = f;
  } catch {
    return json({ error: "Invalid upload." }, 400);
  }
  if (audio.size === 0 || audio.size > MAX_BYTES) return json({ error: "Audio empty or too large." }, 413);

  const out = new FormData();
  out.append("file", audio, audio.name || "speech.webm");
  out.append("model", process.env.OPENAI_STT_MODEL || "whisper-1");
  out.append("language", "en");
  out.append("prompt", VOCAB_PROMPT.slice(0, 600));

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: out,
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    console.error("[valley-meats] stt failed", res.status, (await res.text()).slice(0, 200));
    return json({ error: "Couldn't transcribe audio." }, 502);
  }
  const data = (await res.json()) as { text?: string };
  return json({ text: (data.text ?? "").trim() });
}
