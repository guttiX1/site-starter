"use client";

import { RESTAURANT } from "@/lib/valley-meats/menu";

// Friendly fallback instead of a stack trace. Never show error details to customers.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ maxWidth: 520, margin: "20vh auto", padding: "0 16px", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.8rem", fontWeight: 700 }}>Something went wrong</h1>
      <p style={{ margin: "12px 0 20px", opacity: 0.75 }}>
        Sorry about that. Please try again, or call us at {RESTAURANT.phone} to place your order.
      </p>
      <button onClick={reset} style={{ padding: "8px 16px", border: "1px solid currentColor", borderRadius: 8, cursor: "pointer" }}>
        Try again
      </button>
    </main>
  );
}
