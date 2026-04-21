import { useEffect, useState } from "react";
import { enablePush, getExistingSubscription, pushSupported } from "../push.js";

/**
 * Bottom-right dismissable banner that appears once if the user hasn't
 * enabled push yet. Stores dismissal in localStorage.
 */
export function PushPrompt() {
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!pushSupported()) return;
    if (localStorage.getItem("la28_push_dismissed") === "1") return;
    getExistingSubscription().then((s) => {
      if (!s && Notification.permission === "default") setShow(true);
    });
  }, []);

  if (!show) return null;
  return (
    <div className="fixed bottom-4 right-4 z-30 card max-w-sm shadow-lg fade-in">
      <div className="font-semibold">Get notified of schedule changes</div>
      <div className="text-sm text-black/60 mt-1">
        Follow your favorite sports and we'll push an alert when times, venues, or medal sessions change.
      </div>
      {status && <div className="text-xs text-red-700 mt-2">{status}</div>}
      <div className="flex gap-2 mt-3">
        <button
          className="btn"
          onClick={async () => {
            const r = await enablePush();
            if (!r.ok) setStatus(r.error ?? "Failed");
            else setShow(false);
          }}
        >
          Turn on notifications
        </button>
        <button
          className="btn-ghost"
          onClick={() => {
            localStorage.setItem("la28_push_dismissed", "1");
            setShow(false);
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
