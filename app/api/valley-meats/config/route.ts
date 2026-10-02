import { json } from "@/lib/valley-meats/http";
import { customerSmsEnabled } from "@/lib/valley-meats/orders-out";

export const runtime = "nodejs";

/** Tells the UI which premium voice parts are configured. Never exposes keys. */
export async function GET() {
  return json({
    premiumTts: !!process.env.ELEVENLABS_API_KEY, // ElevenLabs speaks the replies
    premiumStt: !!process.env.OPENAI_API_KEY, // Whisper listens (optional; browser mic otherwise)
    customerSms: customerSmsEnabled(), // customers get a text receipt
  });
}
