"use client";

import { useRef, useState } from "react";

const CARD_STYLE = "border border-[#19e0ff44] shadow-[0_0_18px_#19e0ff18] bg-[#0f0f1a] rounded-xl";

function Section({ title, children }) {
  return (
    <div className={`${CARD_STYLE} p-4`}>
      <h2 className="text-xs uppercase tracking-wide text-[#19e0ff] mb-2">{title}</h2>
      <div className="text-[#e8e8f0] text-sm leading-relaxed">{children}</div>
    </div>
  );
}

export default function KanjiPage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false); // 二重送信防止（stateの更新を待たずに即ガードする）

  async function handleSubmit(e) {
    e.preventDefault();
    if (submittingRef.current || !input.trim()) return;

    submittingRef.current = true;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/kanji", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
      } else if (data.valid === false) {
        setError(data.error_message || "Please enter a Japanese kanji character or word.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0] px-4 py-10">
      <div className="max-w-xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[#19e0ff]">Kanji Deep Dive</h1>
          <p className="text-sm text-[#e8e8f0aa] mt-1">
            Enter a kanji character or Japanese word to explore it in depth.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. 桜 or 勉強"
            maxLength={20}
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl bg-[#0f0f1a] border border-[#19e0ff44] text-[#e8e8f0] placeholder-[#e8e8f066] outline-none focus:border-[#19e0ff] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-5 py-3 rounded-xl bg-[#19e0ff] text-[#0a0a0f] font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {loading ? "Looking up..." : "Explore"}
          </button>
        </form>

        {loading && (
          <p className="text-center text-sm text-[#19e0ff] animate-pulse mb-6">
            Analyzing with Claude...
          </p>
        )}

        {error && (
          <div className={`${CARD_STYLE} p-4 mb-6 text-sm text-[#ff8a8a]`}>{error}</div>
        )}

        {result && (
          <div className="space-y-4">
            <Section title="Meaning">{result.meaning}</Section>

            <Section title="Readings">
              <p>
                <span className="text-[#19e0ff]">On&apos;yomi:</span> {result.onyomi || "—"}
              </p>
              <p>
                <span className="text-[#19e0ff]">Kun&apos;yomi:</span> {result.kunyomi || "—"}
              </p>
            </Section>

            <Section title="Origin">{result.origin}</Section>

            <Section title="Radical & Stroke Count">
              <p>{result.radical}</p>
              <p className="text-[#e8e8f0aa] mt-1">{result.stroke_count} strokes</p>
            </Section>

            {result.examples?.length > 0 && (
              <Section title="Example Sentences">
                <ul className="space-y-3">
                  {result.examples.map((ex, i) => (
                    <li key={i}>
                      <p>{ex.japanese}</p>
                      <p className="text-[#e8e8f0aa] italic">{ex.romaji}</p>
                      <p className="text-[#e8e8f0aa]">{ex.english}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {result.similar?.length > 0 && (
              <Section title="Similar Kanji / Words">
                <ul className="space-y-2">
                  {result.similar.map((s, i) => (
                    <li key={i}>
                      <span className="text-[#19e0ff]">{s.item}</span>
                      {" — "}
                      <span className="text-[#e8e8f0cc]">{s.difference}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
