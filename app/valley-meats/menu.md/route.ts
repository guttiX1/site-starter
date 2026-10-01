import { menuMarkdown } from "@/lib/valley-meats/seo";

export function GET() {
  return new Response(menuMarkdown(), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=900" },
  });
}
