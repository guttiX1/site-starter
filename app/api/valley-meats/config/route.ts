import { json } from "@/lib/valley-meats/http";

export const runtime = "nodejs";

/** Tells the UI whether premium (ElevenLabs + Whisper) voice is configured. Never exposes keys. */
export async function GET() {
  return json({ premiumVoice: !!process.env.ELEVENLABS_API_KEY && !!process.env.OPENAI_API_KEY });
}
