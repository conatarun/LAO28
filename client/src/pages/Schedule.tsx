import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Session, type SportEntry, type Venue } from "../api.js";
import { SessionCard } from "../components/SessionCard.js";
import { Timeline } from "../components/Timeline.js";
import { SportIcon } from "../components/SportIcon.js";

type View = "list" | "timeline";

export default function Schedule() {
  const [params, setParams] = useSearchParams();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sports, setSports] = useState<SportEntry[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("list");
  const [loading, setLoading] = useState(true);

  const filters = useMemo(
    () => ({
      sport: params.get("sport") ?? "",
      venue: params.get("venue") ?? "",
      date: params.get("date") ?? "",
      medal: params.get("medal") ?? "",
    }),
    [params]
  );

  useEffect(() => {
    api.sports().then(setSports).catch(() => {});
    api.venues().then(setVenues).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const p: Record<string, string> = {};
    if (filters.sport) p.sport = filters.sport;
    if (filters.venue) p.venue = filters.venue;
    if (filters.date) p.date = filters.date;
    if (filters.medal) p.medal = filters.medal;
    api.sessions(p).then(setSessions).finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    if (q.length < 2) return;
    const t = setTimeout(() => {
      api.search(q).then(setSessions).catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const clearAll = () => setParams(new URLSearchParams(), { replace: true });
  const hasFilters = !!(filters.sport || filters.venue || filters.date || filters.medal || q);

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="h-eyebrow uppercase text-black/50 font-semibold">Schedule</div>
          <h1 className="font-display h-section font-bold tracking-tight">
            {filters.sport ? filters.sport : filters.venue ? filters.venue : "All sessions"}
            <span className="text-black/40 font-normal"> · {sessions.length}</span>
          </h1>
        </div>
        <div className="flex items-center bg-black/5 p-1 rounded-xl">
          {(["list", "timeline"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                "px-3 md:px-4 py-1.5 rounded-lg text-sm font-medium transition " +
                (view === v ? "bg-white shadow-sm" : "text-black/60 hover:text-black")
              }
            >
              {v === "list" ? "List" : "Days"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sport, event, venue…"
          className="flex-1 min-w-[14rem] rounded-xl border border-black/10 px-4 py-2.5 md:py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <select
          value={filters.sport}
          onChange={(e) => setFilter("sport", e.target.value)}
          className="rounded-xl border border-black/10 px-3 py-2.5 bg-white"
        >
          <option value="">All sports</option>
          {sports.map((s) => (
            <option key={s.sport} value={s.sport}>{s.sport} ({s.count})</option>
          ))}
        </select>
        <select
          value={filters.venue}
          onChange={(e) => setFilter("venue", e.target.value)}
          className="rounded-xl border border-black/10 px-3 py-2.5 bg-white"
        >
          <option value="">All venues</option>
          {venues.map((v) => (
            <option key={v.slug} value={v.name}>{v.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.date}
          onChange={(e) => setFilter("date", e.target.value)}
          className="rounded-xl border border-black/10 px-3 py-2.5 bg-white"
        />
        <label className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl bg-white border border-black/10 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.medal === "true"}
            onChange={(e) => setFilter("medal", e.target.checked ? "true" : "")}
          />
          🏅 Medals only
        </label>
        {hasFilters && (
          <button onClick={() => { clearAll(); setQ(""); }} className="btn-ghost text-black/60">
            Clear
          </button>
        )}
      </div>

      {/* Active filter summary row */}
      {(filters.sport || filters.venue) && (
        <div className="flex items-center gap-2">
          {filters.sport && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-ink text-white text-sm">
              <SportIcon sport={filters.sport} size={22} rounded="full" />
              {filters.sport}
            </span>
          )}
          {filters.venue && (
            <span className="chip bg-ink text-white">📍 {filters.venue}</span>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-black/50 text-sm">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="card text-center text-black/50">
          No sessions match. Try clearing filters.
        </div>
      ) : view === "list" ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {sessions.map((s) => <SessionCard key={s.id} s={s} />)}
        </div>
      ) : (
        <Timeline sessions={sessions} />
      )}
    </div>
  );
}
