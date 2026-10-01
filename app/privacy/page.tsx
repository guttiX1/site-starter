import type { Metadata } from "next";
import Link from "next/link";
import { RESTAURANT } from "@/lib/valley-meats/menu";
import { provider } from "@/lib/valley-meats/agent";
import "../valley-meats/valley-meats.css";

// Reads which services are switched on at request time so the policy matches how the site really runs.
export const dynamic = "force-dynamic";

const { legal } = RESTAURANT;

export const metadata: Metadata = {
  title: `Privacy Policy — ${RESTAURANT.name}`,
  description: `How ${RESTAURANT.name} handles your information when you order on our website or with our voice assistant.`,
  alternates: { canonical: "/privacy" },
  robots: legal.reviewed ? { index: true, follow: true } : { index: false, follow: false },
};

function aiProviderName(): string {
  const p = provider();
  if (p === "anthropic") return "Anthropic (the Claude AI model)";
  if (p === "openai-compat") {
    try {
      return new URL(process.env.LLM_BASE_URL || "https://api.groq.com").hostname.replace(/^api\./, "");
    } catch {
      return "our AI provider";
    }
  }
  return "an AI model that runs on our own computer (your messages are not sent to an outside AI company)";
}

export default function PrivacyPage() {
  const ai = aiProviderName();
  const premiumVoice = !!process.env.ELEVENLABS_API_KEY;
  const whisper = !!process.env.OPENAI_API_KEY;
  const stripe = !!process.env.STRIPE_SECRET_KEY;

  return (
    <main className="vm vm-prose">
      {!legal.reviewed && (
        <div className="vm-error" role="note">
          <strong>DRAFT — not yet reviewed.</strong> Items marked [CONFIRM] must be completed by the business owner, and this policy should
          be reviewed by a qualified professional before launch. This page is hidden from search engines until then.
        </div>
      )}
      <h1>Privacy Policy</h1>
      <p className="vm-dim">Last updated: {legal.updated}</p>

      <h2>Who we are</h2>
      <p>
        {legal.entityName} (“{RESTAURANT.name}”, “we”) operates this website and the ordering assistant on it. Contact us at{" "}
        <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>, by phone at {RESTAURANT.phone}, or at {RESTAURANT.address}.
      </p>

      <h2>You are talking to an AI</h2>
      <p>
        The ordering assistant is an automated AI system, not a person. It can make mistakes, so always check the order summary and the read-back
        before you confirm. You can also order by phone at {RESTAURANT.phone}.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Order details you give us:</strong> items and special requests, pickup or delivery, your name, phone number, delivery address
          (for delivery), and whether you will pay in person or online.
        </li>
        <li>
          <strong>What you say or type to the assistant</strong> during your session.
        </li>
        <li>
          <strong>Technical data</strong> such as your IP address, which our hosting provider processes to deliver the site, keep it secure and
          limit abuse.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> ask for or accept card numbers by voice or chat. Please never say or type card details to the assistant.
      </p>

      <h2>How voice works</h2>
      <ul>
        <li>
          <strong>Browser voice (default):</strong> your browser’s own speech recognition turns your speech into text. Depending on your
          browser, the audio is processed by its maker (for example Google for Chrome, Apple for Safari, Microsoft for Edge) under their privacy
          policies. We do not receive or store your audio. Replies are read aloud with your device’s voices.
        </li>
        {(premiumVoice || whisper) && (
          <li>
            <strong>Premium voice (if you choose it):</strong>
            {whisper ? " your recorded audio is sent to OpenAI to be transcribed;" : ""}
            {premiumVoice ? " the assistant’s replies are sent to ElevenLabs to be turned into speech." : ""} These providers handle the data
            under their own terms.
          </li>
        )}
        <li>You can skip voice entirely and type, or order by phone.</li>
      </ul>

      <h2>Who we share information with</h2>
      <ul>
        <li>
          <strong>AI provider:</strong> your messages and order details are sent to {ai} to generate the assistant’s replies.
        </li>
        <li>
          <strong>Our order system and kitchen:</strong> to prepare and deliver your order.
        </li>
        {stripe && (
          <li>
            <strong>Stripe:</strong> if you choose to pay online, payment is completed on Stripe’s secure page. We never see your card number.
          </li>
        )}
        <li>
          <strong>Hosting and infrastructure providers</strong> that run this website for us.
        </li>
        <li>[CONFIRM: delivery partners, accounting or other service providers, if any.]</li>
        <li>[CONFIRM: whether you sell or share personal information for advertising. Most small restaurants do not; state the true position here.]</li>
      </ul>
      <p>We may also disclose information when required by law or to protect our rights, safety or customers.</p>

      <h2>How long we keep things</h2>
      <ul>
        <li>
          <strong>Your conversation</strong> with the assistant lives in your browser tab; this website does not save it. It is gone when you
          close or refresh the page (our AI provider’s own retention rules may apply to what it received).
        </li>
        <li>
          <strong>Order records</strong> (including name, phone and address) are kept for {legal.orderRetention}.
        </li>
        <li>Short-lived technical logs may be kept by our hosting provider for security and troubleshooting.</li>
      </ul>

      <h2>Your choices and rights</h2>
      <p>
        You can decline to use the voice assistant and order by phone instead. To ask us what we hold about you, or to have it corrected or
        deleted, email <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>. [CONFIRM: add rights and request process that apply
        in the places you serve, for example state privacy laws.]
      </p>

      <h2>Cookies</h2>
      <p>
        This site does not set advertising or analytics cookies. [CONFIRM: update this if you add analytics, chat widgets or other tools.]
      </p>

      <h2>Security</h2>
      <p>
        We use reasonable safeguards, including encrypted connections, but no method of transmission or storage is completely secure.
      </p>

      <h2>Children</h2>
      <p>This service is not directed to children under 13, and we do not knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>We may update this policy and will change the date above when we do.</p>

      <p>
        <Link href="/valley-meats">← Back to the menu</Link>
      </p>
    </main>
  );
}
