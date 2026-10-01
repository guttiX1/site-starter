"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MENU_BY_ID, formatMoney } from "@/lib/valley-meats/menu";
import { EMPTY_ORDER, describeLine, totals, type OrderState } from "@/lib/valley-meats/order";

type Msg = { role: "user" | "assistant"; content: string };
type Engine = "browser" | "premium";

// Minimal typing for the (prefixed, non-standard) Web Speech recognition API.
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => Recognition;
const getRecognitionCtor = (): RecognitionCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|google|samantha|aria|jenny/i.test(v.name) ? 2 : 0) + (v.lang === "en-US" ? 1 : 0);
  return voices.sort((a, b) => score(b) - score(a))[0];
}

type Phase = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

const GREETING =
  "Welcome to Valley Meats! You can order, ask about our menu or hours, and check out, all by voice. What can I get started for you?";
const SILENCE_MS = 1400; // stop recording after this much quiet following speech
const SPEECH_RMS = 0.03;
const MAX_RECORD_MS = 20_000;

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Tap to talk",
  listening: "Listening… tap to send",
  transcribing: "Transcribing…",
  thinking: "Thinking…",
  speaking: "Speaking… tap to interrupt",
};

export default function VoiceAgent() {
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: GREETING }]);
  const [order, setOrder] = useState<OrderState>(EMPTY_ORDER);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [text, setText] = useState("");
  // "premium" = ElevenLabs voice (if its key is set) + Whisper listening (only if an OpenAI key is set).
  const [engine, setEngine] = useState<Engine>("browser");
  const [caps, setCaps] = useState({ tts: false, stt: false });
  const premiumTtsRef = useRef(false);
  const premiumSttRef = useRef(false);
  premiumTtsRef.current = engine === "premium" && caps.tts;
  premiumSttRef.current = engine === "premium" && caps.stt;
  const recognitionRef = useRef<Recognition | null>(null);

  // Default to premium voice only when the server has both keys; otherwise free browser voice.
  useEffect(() => {
    fetch("/api/valley-meats/config")
      .then((r) => r.json())
      .then((c) => {
        setCaps({ tts: !!c.premiumTts, stt: !!c.premiumStt });
        if (c.premiumTts) setEngine("premium");
      })
      .catch(() => {});
  }, []);

  const messagesRef = useRef(messages);
  const orderRef = useRef(order);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopTimersRef = useRef<() => void>(() => {});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const turnRef = useRef(0); // invalidates in-flight work when the user interrupts
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;

  useEffect(() => {
    messagesRef.current = messages;
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  const stopAudio = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.src = "";
      audioRef.current = null;
    }
  }, []);

  const releaseMic = useCallback(() => {
    stopTimersRef.current();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(
    () => () => {
      turnRef.current++;
      abortRef.current?.abort();
      stopAudio();
      releaseMic();
    },
    [stopAudio, releaseMic],
  );

  const speak = useCallback(
    async (reply: string, turn: number) => {
      if (!voiceOnRef.current) return setPhase("idle");
      setPhase("speaking");
      if (!premiumTtsRef.current) {
        if (!window.speechSynthesis) {
          setPhase("idle");
          return;
        }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(reply);
        u.lang = "en-US";
        const v = pickVoice();
        if (v) u.voice = v;
        const done = () => turn === turnRef.current && setPhase("idle");
        u.onend = done;
        u.onerror = done;
        window.speechSynthesis.speak(u);
        return;
      }
      try {
        const res = await fetch("/api/valley-meats/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: reply }),
          signal: abortRef.current?.signal,
        });
        if (!res.ok) throw new Error("tts");
        const blob = await res.blob();
        if (turn !== turnRef.current) return;
        const audio = new Audio(URL.createObjectURL(blob));
        audioRef.current = audio;
        const done = () => {
          URL.revokeObjectURL(audio.src);
          if (turn === turnRef.current) setPhase("idle");
        };
        audio.onended = done;
        audio.onerror = done;
        await audio.play();
      } catch {
        if (turn === turnRef.current) {
          setPhase("idle");
          setError("Couldn't play the voice reply — the text answer is above.");
        }
      }
    },
    [],
  );

  const send = useCallback(
    async (userText: string, turn: number) => {
      const next: Msg[] = [...messagesRef.current, { role: "user", content: userText }];
      setMessages(next);
      setPhase("thinking");
      try {
        const res = await fetch("/api/valley-meats/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next, state: orderRef.current }),
          signal: abortRef.current?.signal,
        });
        const data = await res.json();
        if (turn !== turnRef.current) return;
        if (!res.ok) throw new Error(data.error || "Request failed");
        setOrder(data.state);
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
        await speak(data.reply, turn);
      } catch (e) {
        if (turn !== turnRef.current) return;
        setPhase("idle");
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    },
    [speak],
  );

  const transcribe = useCallback(
    async (blob: Blob, turn: number) => {
      setPhase("transcribing");
      try {
        const form = new FormData();
        form.append("audio", blob, "speech.webm");
        const res = await fetch("/api/valley-meats/transcribe", {
          method: "POST",
          body: form,
          signal: abortRef.current?.signal,
        });
        const data = await res.json();
        if (turn !== turnRef.current) return;
        if (!res.ok) throw new Error(data.error || "Transcription failed");
        if (!data.text) {
          setPhase("idle");
          setError("I didn't catch that — try again.");
          return;
        }
        await send(data.text, turn);
      } catch (e) {
        if (turn !== turnRef.current) return;
        setPhase("idle");
        setError(e instanceof Error ? e.message : "Transcription failed.");
      }
    },
    [send],
  );

  const startBrowserListening = useCallback(
    (Ctor: RecognitionCtor) => {
      const turn = ++turnRef.current;
      abortRef.current = new AbortController();
      stopAudio();
      const rec = new Ctor();
      recognitionRef.current = rec;
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      let got = false;
      rec.onresult = (e) => {
        const t = e.results[0]?.[0]?.transcript?.trim();
        if (!t || turn !== turnRef.current) return;
        got = true;
        void send(t, turn);
      };
      rec.onerror = (e) => {
        if (turn !== turnRef.current) return;
        setPhase("idle");
        setError(
          e.error === "not-allowed" || e.error === "service-not-allowed"
            ? "Microphone access was blocked. Allow it in your browser, or type instead."
            : e.error === "no-speech" || e.error === "aborted"
              ? "I didn't hear anything — tap and try again."
              : `Speech recognition error (${e.error}). You can type instead.`,
        );
      };
      rec.onend = () => {
        if (!got && turn === turnRef.current) setPhase((p) => (p === "listening" ? "idle" : p));
      };
      try {
        rec.start();
        setPhase("listening");
      } catch {
        setPhase("idle");
      }
    },
    [send, stopAudio],
  );

  const startListening = useCallback(async () => {
    setError(null);
    if (!premiumSttRef.current) {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        setError("This browser has no built-in speech recognition (use Chrome, Edge or Safari), or type instead.");
        return;
      }
      return startBrowserListening(Ctor);
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice input isn't supported in this browser — type your message instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("Microphone access was blocked. Allow it in your browser, or type instead.");
      return;
    }
    streamRef.current = stream;
    const turn = ++turnRef.current;
    abortRef.current = new AbortController();

    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    recorderRef.current = rec;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      releaseMic();
      if (turn !== turnRef.current) return;
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (blob.size < 1500) {
        setPhase("idle");
        setError("I didn't hear anything — tap and try again.");
        return;
      }
      void transcribe(blob, turn);
    };

    // Auto-stop after a pause following speech, so ordering feels hands-free.
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let heardSpeech = false;
    let lastLoud = Date.now();
    const poll = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
      if (rms > SPEECH_RMS) {
        heardSpeech = true;
        lastLoud = Date.now();
      } else if (heardSpeech && Date.now() - lastLoud > SILENCE_MS) {
        stop();
      }
    }, 100);
    const maxTimer = setTimeout(() => stop(), MAX_RECORD_MS);
    function stop() {
      if (rec.state !== "inactive") rec.stop();
    }
    stopTimersRef.current = () => {
      clearInterval(poll);
      clearTimeout(maxTimer);
      void ctx.close().catch(() => {});
    };

    stopAudio();
    rec.start();
    setPhase("listening");
  }, [releaseMic, startBrowserListening, stopAudio, transcribe]);

  const onMic = () => {
    if (phase === "listening") {
      recognitionRef.current?.stop();
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
    } else if (phase === "idle") {
      void startListening();
    } else if (phase === "speaking") {
      turnRef.current++;
      abortRef.current?.abort();
      stopAudio();
      void startListening();
    } else {
      // transcribing / thinking: cancel
      turnRef.current++;
      abortRef.current?.abort();
      recognitionRef.current?.abort();
      setPhase("idle");
    }
  };

  const onSubmitText = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || (phase !== "idle" && phase !== "speaking")) return;
    setText("");
    setError(null);
    stopAudio();
    const turn = ++turnRef.current;
    abortRef.current = new AbortController();
    void send(t, turn);
  };

  const t = totals(order);
  const busy = phase === "transcribing" || phase === "thinking";

  return (
    <section className="vm-agent" aria-label="Valley Meats voice assistant">
      <div className="vm-chat">
        <div className="vm-log" ref={logRef} aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`vm-msg ${m.role}`}>
              {m.content}
            </div>
          ))}
          {busy && <div className="vm-msg assistant vm-dim">…</div>}
        </div>

        {error && (
          <div className="vm-error" role="alert">
            {error}
          </div>
        )}

        <div className="vm-controls">
          <button
            type="button"
            className={`vm-mic ${phase}`}
            onClick={onMic}
            aria-label={PHASE_LABEL[phase]}
          >
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
            </svg>
          </button>
          <div className="vm-status">{PHASE_LABEL[phase]}</div>
          <label className="vm-toggle">
            Voice
            <select
              value={engine}
              disabled={phase !== "idle"}
              onChange={(e) => setEngine(e.target.value as Engine)}
              aria-label="Voice engine"
            >
              <option value="browser">Browser (free)</option>
              <option value="premium" disabled={!caps.tts}>
                Premium voice (ElevenLabs){caps.tts ? "" : " – no key"}
              </option>
            </select>
          </label>
          <label className="vm-toggle">
            <input
              type="checkbox"
              checked={voiceOn}
              onChange={(e) => {
                setVoiceOn(e.target.checked);
                if (!e.target.checked) stopAudio();
              }}
            />
            Voice replies
          </label>
        </div>

        <p className="vm-note">
          You’re talking to an AI assistant. Your messages and order details are processed by third-party services to make this work. Never say
          card numbers. <a href="/privacy">Privacy policy</a>
        </p>

        <form className="vm-text" onSubmit={onSubmitText}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Or type here…"
            maxLength={500}
            aria-label="Type a message"
          />
          <button type="submit" disabled={!text.trim() || busy || phase === "listening"}>
            Send
          </button>
        </form>
      </div>

      <aside className="vm-order" aria-label="Your order">
        <h2>Your order</h2>
        {order.placed ? (
          <div className="vm-placed">
            <strong>Order {order.placed.orderId} placed ✓</strong>
            <p>
              Total {formatMoney(order.placed.totalCents)} · ready in about {order.placed.etaMinutes} min.
              {order.placed.paymentUrl
                ? "Please complete payment with the secure link below."
                : `Pay at ${order.fulfillment === "delivery" ? "the door" : "the counter"}.`}
            </p>
            {order.placed.paymentUrl && (
              <p>
                <a className="vm-pay" href={order.placed.paymentUrl} target="_blank" rel="noopener noreferrer">
                  Pay online securely →
                </a>
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setOrder(EMPTY_ORDER);
                setMessages([{ role: "assistant", content: GREETING }]);
              }}
            >
              Start a new order
            </button>
          </div>
        ) : order.cart.length === 0 ? (
          <p className="vm-dim">Nothing yet — try “Two carne asada tacos and a horchata.”</p>
        ) : (
          <>
            <ul>
              {order.cart.map((l, i) => (
                <li key={i}>
                  <span>{describeLine(l)}</span>
                  <span>{formatMoney((MENU_BY_ID.get(l.itemId)?.priceCents ?? 0) * l.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl>
              <div><dt>Subtotal</dt><dd>{formatMoney(t.subtotalCents)}</dd></div>
              <div><dt>Tax</dt><dd>{formatMoney(t.taxCents)}</dd></div>
              {t.deliveryFeeCents > 0 && <div><dt>Delivery</dt><dd>{formatMoney(t.deliveryFeeCents)}</dd></div>}
              <div className="total"><dt>Total</dt><dd>{formatMoney(t.totalCents)}</dd></div>
            </dl>
            <p className="vm-dim">
              {order.fulfillment ? `${order.fulfillment === "delivery" ? "Delivery" : "Pickup"}` : "Pickup or delivery: not set"}
              {order.customerName ? ` · ${order.customerName}` : ""}
              {order.payment ? ` · ${order.payment === "online" ? "paying online" : "paying in person"}` : ""}
            </p>
          </>
        )}
      </aside>
    </section>
  );
}
