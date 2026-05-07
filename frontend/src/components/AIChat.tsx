"use client";
import { useState, useRef, useEffect, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Message {
  role: "user" | "assistant";
  content: string;
  ts: string;
}

const SUGGESTED = [
  "Which ward has the highest risk right now?",
  "Generate an enforcement report for Thanisandra",
  "Which dumps are near water bodies?",
  "Show carbon credit potential for all sites",
  "What does the 7-day forecast say?",
  "Which kabadiwala is closest to the worst dump?",
];

function MarkdownText({ text }: { text: string }) {
  // Minimal inline markdown: **bold**, `code`, newlines
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <span>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**"))
          return <strong key={i} style={{ color: "var(--tx)", fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("`") && p.endsWith("`"))
          return (
            <code key={i} style={{ background: "rgba(255,255,255,0.07)", padding: "1px 5px", borderRadius: 4, fontSize: "11px", fontFamily: "monospace" }}>
              {p.slice(1, -1)}
            </code>
          );
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold"
        style={
          isUser
            ? { background: "rgba(59,130,246,0.2)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)" }
            : { background: "rgba(20,184,166,0.15)", color: "#2dd4bf", border: "1px solid rgba(20,184,166,0.3)" }
        }
      >
        {isUser ? "You" : "AI"}
      </div>

      {/* Bubble */}
      <div
        className="max-w-[85%] rounded-xl px-3 py-2.5"
        style={
          isUser
            ? { background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.22)" }
            : { background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }
        }
      >
        <div style={{ fontSize: "12px", color: "var(--tx)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {msg.content.split("\n").map((line, i) => (
            <div key={i}>
              <MarkdownText text={line} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: "9px", color: "var(--mu)", marginTop: 4, textAlign: isUser ? "right" : "left" }}>
          {msg.ts}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2.5">
      <div
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold"
        style={{ background: "rgba(20,184,166,0.15)", color: "#2dd4bf", border: "1px solid rgba(20,184,166,0.3)" }}
      >
        AI
      </div>
      <div
        className="rounded-xl px-3 py-3 flex items-center gap-1"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: "#2dd4bf",
              animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm the OrbitClean AI assistant.\n\nI have live access to 48 satellite-detected dump sites, the XGBoost risk grid, 5-zone route data, waste forecasts, anomaly alerts, and recycler locations for Thanisandra Ward 26.\n\nAsk me anything about enforcement priorities, carbon credits, or route optimization.",
      ts: now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (!q || loading) return;

      const userMsg: Message = { role: "user", content: q, ts: now() };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      setError(null);

      // Build history (exclude welcome message, exclude new user msg)
      const history = messages
        .filter((m) => !(m.role === "assistant" && messages.indexOf(m) === 0))
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch(`${API_BASE}/api/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, use_claude: true, history }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response, ts: now() },
        ]);
      } catch (e) {
        setError("Backend unreachable — make sure the FastAPI server is running on port 8000.");
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [loading, messages]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const canSend = input.trim().length > 0 && !loading;

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        height: "480px",
      }}
    >
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)", background: "rgba(20,184,166,0.05)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #14b8a6, #0891b2)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--tx)" }}>OrbitClean AI</span>
            <span
              className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-semibold"
              style={{ background: "rgba(20,184,166,0.15)", color: "#2dd4bf", border: "1px solid rgba(20,184,166,0.25)" }}
            >
              Claude Haiku
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
          <span style={{ fontSize: "9px", color: "var(--mu)" }}>Live spatial data</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {messages.map((m, i) => (
          <MessageBubble key={i} msg={m} />
        ))}
        {loading && <TypingIndicator />}
        {error && (
          <div
            className="rounded-lg px-3 py-2 text-[11px]"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
          >
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested queries — only show when no conversation yet */}
      {messages.length === 1 && (
        <div className="shrink-0 px-4 pb-3 flex flex-wrap gap-1.5">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={loading}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors hover:brightness-110 disabled:opacity-40"
              style={{
                background: "rgba(59,130,246,0.08)",
                border: "1px solid rgba(59,130,246,0.2)",
                color: "#93c5fd",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div
        className="shrink-0 px-4 pb-4 pt-2"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div
          className="flex items-end gap-2 rounded-xl px-3 py-2"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about dumps, risk, routes, carbon credits…"
            disabled={loading}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              fontSize: "12px",
              color: "var(--tx)",
              lineHeight: 1.5,
              maxHeight: "80px",
              overflowY: "auto",
              paddingTop: "2px",
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={!canSend}
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all"
            style={{
              background: canSend
                ? "linear-gradient(135deg, #14b8a6, #0891b2)"
                : "rgba(255,255,255,0.05)",
              border: canSend ? "none" : "1px solid var(--border)",
              cursor: canSend ? "pointer" : "not-allowed",
              boxShadow: canSend ? "0 2px 8px rgba(20,184,166,0.3)" : "none",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={canSend ? "white" : "#64748b"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div style={{ fontSize: "9px", color: "var(--mu)", marginTop: 4, textAlign: "center" }}>
          Enter to send · Shift+Enter for new line · Prompt caching enabled
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function now() {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
