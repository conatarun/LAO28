import { useCallback, useEffect, useRef, useState } from "react";
import { useStarred, getStarredIdsNow } from "../starred.js";

type Msg = {
  role: "user" | "assistant" | "system";
  content: string;
  starred_ids?: string[];
};

const WIZARD_OPTIONS = [
  { label: "🏅 Medal finals", value: "I want to see medal finals — the big dramatic moments" },
  { label: "🏀 Team sports", value: "I love team sports like basketball, volleyball, soccer" },
  { label: "🏊 Swimming & aquatics", value: "I'm into swimming, diving, water polo" },
  { label: "🤙 Action sports", value: "Show me action sports — skateboarding, surfing, BMX, climbing" },
  { label: "🤺 Unique / niche", value: "I want to discover unique sports I wouldn't normally watch" },
  { label: "📅 Plan my day", value: "I'm attending in person and want help planning specific days — what should I see?" },
];

// Web Speech API — zero cost, runs in browser
function useSpeech(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const supported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const startListening = useCallback(() => {
    if (!supported) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      onResult(transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }, [supported, onResult]);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  return { listening, startListening, stopListening, supported };
}

export function Concierge() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toggle: toggleStar } = useStarred();

  const scrollBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }), 60);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 100); }, [open]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    setShowWizard(false);
    const userMsg: Msg = { role: "user", content: t };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    scrollBottom();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: next.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content })),
          starred_ids: getStarredIdsNow(),
        }),
      });
      const data = await res.json();
      if (data.disabled) setDisabled(true);
      const reply: Msg = { role: "assistant", ...data.reply };
      setMessages(prev => [...prev, reply]);
      if (reply.starred_ids?.length) {
        for (const id of reply.starred_ids) toggleStar(id);
        setMessages(prev => [
          ...prev,
          { role: "system", content: `⭐ Starred ${reply.starred_ids!.length} session${reply.starred_ids!.length > 1 ? "s" : ""} for you! Check your My Schedule.` },
        ]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Try again!" }]);
    } finally {
      setLoading(false);
      scrollBottom();
    }
  };

  // Voice
  const onVoiceResult = useCallback((text: string) => {
    setInput(text);
    // Auto-send after a short delay so user can see what was transcribed.
    setTimeout(() => send(text), 300);
  }, [messages, loading]);

  const { listening, startListening, stopListening, supported: voiceSupported } = useSpeech(onVoiceResult);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={
          "fixed bottom-5 right-5 z-40 shadow-2xl grid place-items-center transition-all duration-300 " +
          (open
            ? "h-14 w-14 rounded-2xl bg-ink text-white rotate-45 scale-90"
            : "h-[4.5rem] w-[4.5rem] rounded-[1.6rem] bg-gradient-to-br from-accent to-gold text-white hover:scale-110 active:scale-95 text-3xl")
        }
        aria-label={open ? "Close concierge" : "Open concierge"}
      >
        {open ? "+" : "💬"}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed z-40 bg-white flex flex-col overflow-hidden fade-in
            bottom-0 right-0 w-full h-[85vh]
            sm:bottom-24 sm:right-5 sm:w-[26rem] sm:max-h-[min(80vh,720px)] sm:rounded-3xl
            rounded-t-3xl shadow-2xl border border-black/10"
        >
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-ink via-gray-800 to-ink text-white flex items-center gap-3 shrink-0">
            <span className="text-3xl">🏅</span>
            <div className="flex-1">
              <div className="font-display font-bold text-xl">LA28 Concierge</div>
              <div className="text-xs text-white/50">Your AI Olympic guide · voice enabled</div>
            </div>
            <button onClick={() => setOpen(false)} className="sm:hidden h-8 w-8 rounded-full bg-white/10 grid place-items-center text-sm">✕</button>
            {disabled && <span className="chip bg-red-500/30 text-red-200 text-[10px]">Budget hit</span>}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="text-5xl mb-3">👋</div>
                <div className="font-display font-bold text-xl text-black/85">Welcome!</div>
                <div className="text-sm text-black/55 mt-1 max-w-[20rem] mx-auto leading-relaxed">
                  I'll help you find the perfect events, plan your days, and build your personal Olympic schedule.
                </div>
                {voiceSupported && (
                  <div className="text-xs text-black/40 mt-3 flex items-center justify-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-400" /> Voice enabled — tap the mic to talk
                  </div>
                )}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={
                    "max-w-[88%] rounded-2xl px-4 py-3 text-[0.95rem] leading-relaxed whitespace-pre-wrap " +
                    (m.role === "user"
                      ? "bg-ink text-white rounded-br-md"
                      : m.role === "system"
                      ? "bg-gold/10 text-gold/90 font-semibold text-sm text-center w-full rounded-xl"
                      : "bg-black/[0.04] text-black rounded-bl-md")
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-black/[0.04] rounded-2xl rounded-bl-md px-5 py-4">
                  <div className="flex gap-2">
                    <span className="w-2.5 h-2.5 bg-black/25 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2.5 h-2.5 bg-black/25 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2.5 h-2.5 bg-black/25 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Wizard quick-start pills */}
          {showWizard && messages.length === 0 && (
            <div className="px-4 py-3 border-t border-black/5 bg-paper/80 backdrop-blur space-y-2 shrink-0">
              <div className="text-[11px] font-bold text-black/40 uppercase tracking-widest">Quick start</div>
              <div className="flex flex-wrap gap-1.5">
                {WIZARD_OPTIONS.map(o => (
                  <button
                    key={o.label}
                    onClick={() => send(o.value)}
                    className="chip bg-white border border-black/10 hover:bg-ink hover:text-white hover:border-ink transition text-xs px-3 py-2 rounded-xl cursor-pointer shadow-sm"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input bar */}
          <div className="px-3 py-3 border-t border-black/5 bg-white flex gap-2 items-center shrink-0">
            {voiceSupported && (
              <button
                onClick={listening ? stopListening : startListening}
                disabled={disabled}
                className={
                  "h-11 w-11 rounded-xl grid place-items-center shrink-0 transition text-lg " +
                  (listening
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-black/5 hover:bg-black/10 text-black/60")
                }
                aria-label={listening ? "Stop listening" : "Speak"}
              >
                🎙
              </button>
            )}
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send(input)}
              placeholder={
                disabled ? "Budget reached this month"
                : listening ? "Listening…"
                : "Ask about sports, venues, days…"
              }
              disabled={disabled || loading}
              className="flex-1 bg-black/5 rounded-xl px-4 py-3 text-[0.95rem] focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading || disabled}
              className="h-11 w-11 rounded-xl bg-accent text-white grid place-items-center hover:opacity-90 disabled:opacity-25 transition shrink-0"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
