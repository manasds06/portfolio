"use client";

import { useEffect, useRef, useState } from "react";
import { Decode } from "./Decode";

/**
 * "Ask the blob": a single question field under the sentence. While the
 * answer is on its way the blob ripples; the reply decodes into place.
 */
export default function AskBlob({ onThinking }: { onThinking: (thinking: boolean) => void }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setAsked(q);
    setAnswer(null);
    onThinking(true);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: abort.current.signal,
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      setAnswer(data.answer ? { text: data.answer, error: false } : { text: data.error ?? "Something went wrong. Try again.", error: true });
      if (data.answer) setQuestion("");
    } catch (err) {
      if ((err as Error).name !== "AbortError") setAnswer({ text: "Couldn't reach the chat. Check your connection and try again.", error: true });
    } finally {
      setBusy(false);
      onThinking(false);
    }
  };

  return (
    <div className="ask pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center px-6">
      <div className="ask-answer pointer-events-auto" aria-live="polite">
        {busy && (
          <p className="text-white/60">
            <span className="sr-only">Thinking</span>
            <span aria-hidden="true">thinking…</span>
          </p>
        )}
        {answer && (
          <>
            <p className="ask-q">{asked}</p>
            <p className={answer.error ? "text-white/70" : undefined}>
              <Decode key={answer.text} text={answer.text} />
            </p>
            <button type="button" className="ask-clear" onClick={() => setAnswer(null)} aria-label="Clear the answer">
              <span aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      <form className="ask-form pointer-events-auto" onSubmit={ask}>
        <label htmlFor="ask-input" className="sr-only">
          Ask me a question
        </label>
        <input
          id="ask-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={280}
          placeholder="Ask the blob about me"
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !question.trim()} aria-label="Send question" className="ask-send">
          <span aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
