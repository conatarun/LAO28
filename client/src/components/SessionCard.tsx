import type { Session } from "../api.js";
import { SportIcon } from "./SportIcon.js";
import { useStarred } from "../starred.js";

export function SessionCard({ s, compact }: { s: Session; compact?: boolean }) {
  const { isStarred, toggle } = useStarred();
  const d = new Date(s.start_utc);
  const time = d.toLocaleTimeString([], {
    hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
  });
  const date = d.toLocaleDateString([], {
    weekday: "short", month: "short", day: "numeric", timeZone: "America/Los_Angeles",
  });
  const starred = isStarred(s.id);
  return (
    <div className={"card fade-in hover:shadow-md hover:-translate-y-0.5 transition-all relative " + (starred ? "ring-2 ring-gold/60" : "")}>
      <button
        aria-label={starred ? "Unstar" : "Star"}
        onClick={() => toggle(s.id)}
        className={
          "absolute top-2.5 right-2.5 h-9 w-9 rounded-full grid place-items-center transition " +
          (starred ? "bg-gold/20 text-gold hover:bg-gold/30" : "text-black/30 hover:bg-black/5 hover:text-black/70")
        }
      >
        <span className="text-xl leading-none">{starred ? "★" : "☆"}</span>
      </button>
      <div className="flex items-start gap-3 md:gap-4 pr-10">
        <SportIcon sport={s.sport} size={compact ? 48 : 64} rounded="2xl" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-base md:text-lg truncate">{s.sport}</span>
            {s.medal && <span className="chip bg-gold/20 text-gold">🏅 medal</span>}
          </div>
          {s.event && <div className="text-sm text-black/70 line-clamp-2 mt-0.5">{s.event}</div>}
          <div className="text-xs text-black/50 mt-1.5 flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-black/75">{date}</span>
            <span>· {time} PT</span>
            {s.venue && <span className="truncate">· 📍 {s.venue}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
