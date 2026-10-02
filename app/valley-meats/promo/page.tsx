import type { Metadata } from "next";
import { promoData } from "@/lib/valley-meats/promo-data";
import Promo from "./Promo";

// A tool page for making the promo video, not a page for customers or search engines.
export const metadata: Metadata = {
  title: "Valley Meats promo",
  robots: { index: false, follow: false },
};

export default function PromoPage() {
  return <Promo data={promoData()} />;
}
