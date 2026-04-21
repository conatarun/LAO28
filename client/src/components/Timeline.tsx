import { useMemo } from "react";
import type { Session } from "../api.js";
import { SportIcon } from "./SportIcon.js";
import { useStarred } from "../starred.js";

/**
 * Day-column timeline: each day is a vertical column, sessions stack by
 * start time. Horizontally scrollable. Great for scanning the whole Games at
 * a glance, or a filtered subset.
 */
export function Timeline({ sessions }: { sessions: Session[] }) {
  const { isStarred, toggle } = useStarred();

  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      const day = new Date(s.start_utc).toLocaleDateString("en-CA", {
        timeZone: "America/Los_Angeles",
      }); // YYYY-MM-DD
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(s);
    }
    for (const list of map.values()) list.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [sessions]);

  if (byDay.length === 0) {
    return <div className="card text-center text-black/50">No sessions.</div>;
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4 pb-2">
      <div className="flex gap-3 min-w-max">
        {byDay.map(([day, rows]) => {
          const d = new Date(day + "T12:00:00-07:00");
          const medals = rows.filter((r) => r.medal).length;
          return (
            <div key={day} className="w-[18rem] sm:w-[20rem] flex-shrink-0 flex flex-col">
              <div className="sticky top-14 z-10 bg-paper/90 backdrop-blur pb-2">
                <div className="text-[11px] tracking-widest uppercase text-black/50">
                  {d.toLocaleDateString([], { weekday: "long" })}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-2xl md:text-3xl font-bold">
                    {d.toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>
                  <span className="text-xs text-black/50">{rows.length} sessions</span>
                  {medals > 0 && <span className="text-xs text-gold font-semibold">🏅 {medals}</span>}
                </div>
              </div>
              <div className="space-y-2">
                {rows.map((s) => {
                  const t = new Date(s.start_utc);
                  const time = t.toLocaleTimeString([], {
                    hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
                  });
                  const star = isStarred(s.id);
                  return (
                    <div
                      key={s.id}
                      className={
                        "group rounded-xl p-2.5 bg-white border border-black/5 hover:shadow-sm hover:-translate-y-0.5 transition relative " +
                        (star ? "ring-2 ring-gold/60" : "") +
                        (s.medal ? " bg-gradient-to-br from-white to-gold/5" : "")
                      }
                    >
                      <button
                        onClick={() => toggle(s.id)}
                        className={
                          "absolute top-1.5 right-1.5 h-7 w-7 rounded-full grid place-items-center text-sm " +
                          (star ? "text-gold" : "text-black/20 hover:text-black/60")
                        }
                        aria-label={star ? "Unstar" : "Star"}
                      >
                        {star ? "★" : "☆"}
                      </button>
                      <div className="flex items-start gap-2 pr-6">
                        <SportIcon sport={s.sport} size={40} rounded="xl" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm truncate">{s.sport}</span>
                            {s.medal && <span className="text-gold text-xs">🏅</span>}
                          </div>
                          <div className="text-xs text-black/60 font-medium">{time} PT</div>
                          {s.event && <div className="text-xs text-black/50 line-clamp-2 mt-0.5">{s.event}</div>}
                          {s.venue && <div className="text-[11px] text-black/40 truncate mt-0.5">📍 {s.venue}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
