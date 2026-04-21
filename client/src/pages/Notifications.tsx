import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Notification } from "../api.js";
import { disablePush, enablePush, getExistingSubscription, pushSupported, sendTestPush } from "../push.js";

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [following, setFollowing] = useState<string[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const [n, f] = await Promise.all([api.notifications(), api.follows()]);
    setItems(n.items);
    setUnread(n.unread);
    setFollowing(f.following);
    const sub = await getExistingSubscription();
    setSubscribed(!!sub);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (unread > 0) api.markRead().then(() => setUnread(0));
  }, [items.length, unread]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Notifications</h2>
          <p className="text-sm text-black/60">
            Every alert we would have sent based on what you follow. Anything here while push is off was still recorded.
          </p>
        </div>
        <div className="flex gap-2">
          {pushSupported() ? (
            subscribed ? (
              <>
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    const r = await sendTestPush();
                    setMsg(r.ok ? "Test sent" : `Test failed: ${r.error ?? "unknown"}`);
                  }}
                >
                  Send test push
                </button>
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    await disablePush();
                    setSubscribed(false);
                    setMsg("Push disabled");
                  }}
                >
                  Disable push
                </button>
              </>
            ) : (
              <button
                className="btn"
                onClick={async () => {
                  const r = await enablePush();
                  if (r.ok) {
                    setSubscribed(true);
                    setMsg("Push enabled");
                  } else setMsg(r.error ?? "Failed");
                }}
              >
                Enable push notifications
              </button>
            )
          ) : (
            <span className="text-xs text-black/50">Push unsupported here</span>
          )}
        </div>
      </div>
      {msg && <div className="card text-sm">{msg}</div>}

      <div>
        <h3 className="font-semibold mb-2">Following</h3>
        {following.length === 0 ? (
          <div className="text-sm text-black/50">
            You're not following any sports yet.{" "}
            <Link className="underline" to="/sports">Pick some →</Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {following.map((s) => (
              <Link key={s} to={`/schedule?sport=${encodeURIComponent(s)}`} className="chip bg-ink text-white">
                {s}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-semibold mb-2">History</h3>
        {items.length === 0 ? (
          <div className="text-sm text-black/50">No notifications yet.</div>
        ) : (
          <div className="space-y-2">
            {items.map((n) => (
              <div key={n.id} className="card fade-in">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{iconFor(n.kind)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{n.title}</div>
                    <div className="text-sm text-black/70">{n.body}</div>
                    <div className="text-xs text-black/40 mt-1 flex gap-2 flex-wrap">
                      <span>{new Date(n.created_at).toLocaleString()}</span>
                      <span className="chip">{n.sport}</span>
                      <span className="chip">{n.kind}</span>
                      <span className={"chip " + (n.push_status === "sent" ? "bg-green-100 text-green-800" : n.push_status === "failed" ? "bg-red-100 text-red-800" : "")}>
                        push: {n.push_status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function iconFor(kind: string) {
  switch (kind) {
    case "new_medal": return "🏅";
    case "time_change": return "⏱";
    case "venue_change": return "📍";
    case "removed": return "🗑";
    case "added": return "➕";
    default: return "🔔";
  }
}
