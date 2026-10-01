import { markdown } from "@/lib/site-kit";
import { site } from "@/site.config";

export function GET() {
  return new Response(markdown(site), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=900" } });
}
