import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/valley-meats/seo";

// Search and AI crawlers are explicitly welcome on public pages; the order/voice APIs are not for crawling.
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Applebot-Extended"];

export default function robots(): MetadataRoute.Robots {
  const disallow = ["/api/valley-meats/agent", "/api/valley-meats/speak", "/api/valley-meats/transcribe"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow })),
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
