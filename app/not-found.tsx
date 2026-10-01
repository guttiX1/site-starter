import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ maxWidth: 520, margin: "20vh auto", padding: "0 16px", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.8rem", fontWeight: 700 }}>Page not found</h1>
      <p style={{ margin: "12px 0 20px", opacity: 0.75 }}>That page doesn&apos;t exist. You can still see the menu and order.</p>
      <Link href="/valley-meats" style={{ textDecoration: "underline" }}>Go to the Valley Meats menu</Link>
    </main>
  );
}
