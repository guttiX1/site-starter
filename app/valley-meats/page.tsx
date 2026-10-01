import type { Metadata } from "next";
import { MENU, RESTAURANT, formatMoney, hoursText } from "@/lib/valley-meats/menu";
import { jsonLd, jsonLdString, pageMetadata } from "@/lib/site-kit";
import { site } from "@/site.config";
import VoiceAgent from "./VoiceAgent";
import "./valley-meats.css";

export const metadata: Metadata = pageMetadata(site);

const CATEGORIES = [...new Set(MENU.map((m) => m.category))];

export default function ValleyMeatsPage() {
  return (
    <main className="vm">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd(site)) }} />
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
            {site.faqs.map((f) => (
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
      <footer className="vm-note">
        <a href="/privacy">Privacy policy</a>
      </footer>
    </main>
  );
}
