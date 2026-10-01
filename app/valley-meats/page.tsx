import type { Metadata } from "next";
import { MENU, RESTAURANT, formatMoney, hoursText } from "@/lib/valley-meats/menu";
import VoiceAgent from "./VoiceAgent";
import "./valley-meats.css";

export const metadata: Metadata = {
  title: "Valley Meats — order by voice",
  description: "Order, ask questions and check out at Valley Meats just by talking.",
};

const CATEGORIES = [...new Set(MENU.map((m) => m.category))];

export default function ValleyMeatsPage() {
  return (
    <main className="vm">
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
