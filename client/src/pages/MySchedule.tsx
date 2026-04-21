import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Session } from "../api.js";
import { SessionCard } from "../components/SessionCard.js";
import { Timeline } from "../components/Timeline.js";
import { useStarred, getStarredIdsNow } from "../starred.js";

type View = "list" | "timeline";

export default function MySchedule() {
  const { starred, count } = useStarred();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("timeline");

  // Fetch all sessions once and filter locally. 793 rows is fine to send.
  useEffect(() => {
    api.sessions().then((rows) => {
      setSessions(rows);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const mine = sessions
    .filter((s) => starred.has(s.id))
    .sort((a, b) => a.start_utc.localeCompare(b.start_utc));

  const downloadIcs = () => {
    const ids = new Set(getStarredIdsNow());
    const picks = sessions.filter((s) => ids.has(s.id));
    const ics = toIcs(picks);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "la28-my-schedule.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const medals = mine.filter((s) => s.medal).length;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="h-eyebrow uppercase text-black/50 font-semibold">Starred</div>
          <h1 className="font-display h-section font-bold tracking-tight">
            My schedule <span className="text-black/40 font-normal">· {count}</span>
          </h1>
          {count > 0 && (
            <div className="text-sm text-black/60 mt-1">
              {medals > 0 ? `${medals} medal session${medals === 1 ? "" : "s"}` : "No medal sessions yet"}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-black/5 p-1 rounded-xl">
            {(["timeline", "list"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={
                  "px-3 md:px-4 py-1.5 rounded-lg text-sm font-medium transition " +
                  (view === v ? "bg-white shadow-sm" : "text-black/60 hover:text-black")
                }
              >
                {v === "timeline" ? "Days" : "List"}
              </button>
            ))}
          </div>
          {count > 0 && (
            <button className="btn" onClick={downloadIcs}>
              📅 Export .ics
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-black/50 text-sm">Loading…</div>
      ) : count === 0 ? (
        <div className="card text-center py-10">
          <div className="text-5xl mb-3">☆</div>
          <div className="font-display text-xl font-bold">Star sessions you want to follow</div>
          <div className="text-black/60 mt-1 max-w-md mx-auto">
            Tap the star on any session in the schedule and it'll show up here. Works offline —
            your picks live in this browser.
          </div>
          <Link to="/schedule" className="btn mt-4 inline-flex">Browse schedule →</Link>
        </div>
      ) : view === "timeline" ? (
        <Timeline sessions={mine} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {mine.map((s) => <SessionCard key={s.id} s={s} />)}
        </div>
      )}
    </div>
  );
}

function toIcs(sessions: Session[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LA28 Dashboard//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const s of sessions) {
    const start = s.start_utc.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const end = (s.end_utc ?? s.start_utc).replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const summary = `${s.medal ? "🏅 " : ""}${s.sport}${s.event ? " — " + s.event.split("·")[0].trim() : ""}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:la28-${s.id}@dashboard`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escIcs(summary)}`,
      s.venue ? `LOCATION:${escIcs(s.venue)}` : "",
      s.event ? `DESCRIPTION:${escIcs(s.event)}` : "",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}

function escIcs(v: string) {
  return v.replace(/[\\,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
}
