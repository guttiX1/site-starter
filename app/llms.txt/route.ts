import { llmsTxt } from "@/lib/site-kit";
import { site } from "@/site.config";

export function GET() {
  return new Response(llmsTxt(site), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
