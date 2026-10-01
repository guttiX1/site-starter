import { json, rateLimited } from "@/lib/valley-meats/http";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;

/** Speech-to-text via ElevenLabs Scribe. */
export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return json({ error: "ELEVENLABS_API_KEY is not configured." }, 503);
  if (rateLimited(req, "stt", 30)) return json({ error: "Too many requests." }, 429);

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
  out.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v1");
  out.append("language_code", "en");
  out.append("tag_audio_events", "false");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
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
