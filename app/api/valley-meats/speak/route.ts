import { budgetExceeded, crossSite, json, rateLimited } from "@/lib/valley-meats/http";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Text-to-speech via ElevenLabs; streams MP3 back to the browser. */
export async function POST(req: Request) {
  if (crossSite(req)) return json({ error: "Forbidden." }, 403);
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return json({ error: "ELEVENLABS_API_KEY is not configured." }, 503);
  if (await rateLimited(req, "tts", 40)) return json({ error: "Too many requests." }, 429);
  if (await budgetExceeded("tts", Number(process.env.DAILY_VOICE_CALL_LIMIT) || 3000)) return json({ error: "Voice is busy right now." }, 503);

  let text = "";
  try {
    text = String((await req.json()).text ?? "").trim().slice(0, 600);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  if (!text) return json({ error: "No text." }, 400);

  // "Rachel" is a stock ElevenLabs voice; override with ELEVENLABS_VOICE_ID.
  const voice = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal: AbortSignal.timeout(25_000),
    },
  );
  if (!res.ok || !res.body) {
    console.error("[valley-meats] tts failed", res.status, (await res.text()).slice(0, 200));
    return json({ error: "Couldn't generate speech." }, 502);
  }
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
