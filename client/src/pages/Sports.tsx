import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type SportEntry } from "../api.js";
import { enablePush, getExistingSubscription, pushSupported } from "../push.js";
import { SportIcon } from "../components/SportIcon.js";

export default function SportsPage() {
  const [sports, setSports] = useState<SportEntry[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [pushReady, setPushReady] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.sports().then(setSports).catch(() => {});
    api.follows().then((f) => setFollowing(new Set(f.following))).catch(() => {});
    getExistingSubscription().then((s) => setPushReady(!!s));
  }, []);

  const toggle = async (sport: string) => {
    if (!pushReady) {
      const r = await enablePush();
      if (!r.ok) {
        setMsg(r.error ?? "Enable notifications to follow sports");
        return;
      }
      setPushReady(true);
    }
    const isOn = following.has(sport);
    const next = new Set(following);
    if (isOn) next.delete(sport);
    else next.add(sport);
    setFollowing(next);
    await api.setFollow(sport, !isOn);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-semibold">Sports</h2>
        {pushSupported() ? (
          <div className="text-sm text-black/60">
            {pushReady ? "🔔 Push on — tap ★ to follow a sport" : "Follow a sport to enable push"}
          </div>
        ) : (
          <div className="text-xs text-black/50">Push unsupported in this browser</div>
        )}
      </div>
      {msg && <div className="card text-sm text-red-700">{msg}</div>}

      {sports.length === 0 ? (
        <div className="text-black/50 text-sm">No sports indexed yet.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {sports.map((s) => {
            const on = following.has(s.sport);
            return (
              <div key={s.sport} className="card flex items-center gap-3">
                <SportIcon sport={s.sport} size={48} className="shrink-0" />
                <Link
                  to={`/schedule?sport=${encodeURIComponent(s.sport)}`}
                  className="flex-1 min-w-0"
                >
                  <div className="font-medium truncate">{s.sport}</div>
                  <div className="text-xs text-black/50">{s.count} sessions</div>
                </Link>
                <button
                  aria-label={on ? "Unfollow" : "Follow"}
                  onClick={() => toggle(s.sport)}
                  className={
                    "shrink-0 h-9 w-9 rounded-full text-lg transition " +
                    (on
                      ? "bg-gold/20 text-gold hover:bg-gold/30"
                      : "bg-black/5 hover:bg-black/10 text-black/50")
                  }
                >
                  {on ? "★" : "☆"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
