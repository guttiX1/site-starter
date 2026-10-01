import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/valley-meats/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/valley-meats`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/valley-meats/menu.md`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/engine`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];
}
