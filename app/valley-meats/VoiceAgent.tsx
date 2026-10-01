"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MENU_BY_ID, formatMoney } from "@/lib/valley-meats/menu";
import { EMPTY_ORDER, describeLine, totals, type OrderState } from "@/lib/valley-meats/order";

type Msg = { role: "user" | "assistant"; content: string };
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

  const startListening = useCallback(async () => {
    setError(null);
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
  }, [releaseMic, stopAudio, transcribe]);

  const onMic = () => {
    if (phase === "listening") {
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
              Pay at {order.fulfillment === "delivery" ? "the door" : "the counter"}.
            </p>
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
          <p className="vm-dim">Nothing yet — try “I’ll have a ribeye, medium rare.”</p>
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
            </p>
          </>
        )}
      </aside>
    </section>
  );
}
