import type { Metadata } from "next";
import { MENU, RESTAURANT, formatMoney, hoursText } from "@/lib/valley-meats/menu";
import { faqs, jsonLdString, restaurantJsonLd } from "@/lib/valley-meats/seo";
import VoiceAgent from "./VoiceAgent";
import "./valley-meats.css";

const title = `${RESTAURANT.name} — ${RESTAURANT.cuisine} Restaurant | Order Online or by Voice`;
const description = `${RESTAURANT.name}: ${RESTAURANT.cuisine} food at ${RESTAURANT.address}. See the menu, hours and delivery info, then order for pickup or delivery by voice or online.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/valley-meats", types: { "text/markdown": "/valley-meats/menu.md" } },
  openGraph: { title, description, url: "/valley-meats", siteName: RESTAURANT.name, type: "website", locale: "en_US" },
  twitter: { card: "summary", title, description },
};

const CATEGORIES = [...new Set(MENU.map((m) => m.category))];

export default function ValleyMeatsPage() {
  return (
    <main className="vm">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(restaurantJsonLd()) }} />
      <header className="vm-hero">
        <h1>{RESTAURANT.name}</h1>
        <p>
          {RESTAURANT.address} · {RESTAURANT.phone}
        </p>
      </header>

      <VoiceAgent />

      <div className="vm-info">
        <section>
          <h2>Menu</h2>
          {CATEGORIES.map((c) => (
            <div key={c}>
              <h3>{c}</h3>
              <ul>
                {MENU.filter((m) => m.category === c).map((m) => (
                  <li key={m.id}>
                    <span>
                      <strong>{m.name}</strong>
                      <br />
                      <small>{m.description}</small>
                    </span>
                    <span>{formatMoney(m.priceCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <section>
          <h2>Hours</h2>
          <pre>{hoursText()}</pre>
          <h2>Find us</h2>
          <p>{RESTAURANT.address}</p>
          <h2>FAQ</h2>
          <dl className="vm-faq">
            {faqs().map((f) => (
              <div key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
          <ul className="vm-notes">
            {RESTAURANT.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
