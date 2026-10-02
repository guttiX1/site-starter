import { afterEach, describe, expect, it, vi } from "vitest";
import { hoursText, jsonLd, jsonLdString, llmsTxt, markdown, openStatus, robots, siteData, sitemap } from "@/lib/site-kit";

describe("hours", () => {
  const hours = { 0: null, 1: { open: "08:00", close: "17:00" }, 2: null, 3: null, 4: null, 5: null, 6: null };
  it("formats hours", () => expect(hoursText(hours)).toContain("Monday: 8 AM – 5 PM"));
  it("knows when it is open and closed (business-local time)", () => {
    expect(openStatus(hours, "America/Chicago", new Date("2026-10-05T17:00:00Z")).open).toBe(true); // Mon 12:00 Chicago
    expect(openStatus(hours, "America/Chicago", new Date("2026-10-05T23:30:00Z")).open).toBe(false); // Mon 18:30
    expect(openStatus(hours, "America/Chicago", new Date("2026-10-06T17:00:00Z")).open).toBe(false); // Tue closed
  });
});

describe("site kit output", () => {
  afterEach(() => vi.unstubAllEnvs());
  const base = {
    name: "Acme Plumbing",
    tagline: "Plumbing contractor",
    schemaType: "LocalBusiness" as const,
    currency: "USD",
    primaryPath: "/",
    faqs: [{ q: "Emergency calls?", a: "Yes, 24/7." }],
    sitemap: [{ path: "/", priority: 1, changeFrequency: "weekly" as const }],
    disallow: ["/admin"],
    page: { title: "Acme", description: "Plumbing" },
    llms: { summary: "Austin plumber.", pages: [{ label: "Home", path: "/", description: "services" }] },
  };

  it("non-restaurants get no Menu and no cuisine", () => {
    const g = (jsonLd(base) as { "@graph": { "@type": string }[] })["@graph"];
    expect(g.map((n) => n["@type"])).toEqual(["LocalBusiness", "FAQPage"]);
  });

  it("restaurants with a catalog get a Menu", () => {
    const site = { ...base, schemaType: "Restaurant" as const, cuisine: "Mexican", catalog: [{ name: "Taco", category: "Food", priceCents: 375 }] };
    const g = (jsonLd(site) as { "@graph": { "@type": string }[] })["@graph"];
    expect(g.map((n) => n["@type"])).toEqual(["Restaurant", "Menu", "FAQPage"]);
  });

  it("allows search and AI crawlers but blocks private paths", () => {
    const rules = robots(base).rules as { userAgent: string; allow: string; disallow: string[] }[];
    expect(rules.map((r) => r.userAgent)).toEqual(expect.arrayContaining(["*", "GPTBot", "ClaudeBot", "PerplexityBot"]));
    expect(rules.every((r) => r.allow === "/" && r.disallow.includes("/admin"))).toBe(true);
  });

  it("uses SITE_URL for absolute URLs", () => {
    vi.stubEnv("SITE_URL", "https://example.test/");
    expect(sitemap(base)[0].url).toBe("https://example.test/");
    expect(llmsTxt(base)).toContain("https://example.test/");
  });

  it("emits llms.txt, markdown and data with the FAQ", () => {
    expect(llmsTxt(base)).toMatch(/^# Acme Plumbing/);
    expect(markdown(base)).toContain("Emergency calls?");
    expect(siteData(base).faq).toHaveLength(1);
  });

  it("escapes </script> in JSON-LD", () => {
    expect(jsonLdString({ x: "</script><script>alert(1)" })).not.toContain("</script");
  });

});
