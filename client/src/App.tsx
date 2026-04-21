import { NavLink, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, type Status } from "./api.js";
import Home from "./pages/Home.js";
import Schedule from "./pages/Schedule.js";
import SportsPage from "./pages/Sports.js";
import MapPage from "./pages/Map.js";
import StatusPage from "./pages/Status.js";
import NotificationsPage from "./pages/Notifications.js";
import MySchedule from "./pages/MySchedule.js";
import { PushPrompt } from "./components/PushPrompt.js";
import { Concierge } from "./components/Concierge.js";
import { useStarred } from "./starred.js";

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [unread, setUnread] = useState(0);
  const { count: starCount } = useStarred();

  useEffect(() => {
    let alive = true;
    const load = () => {
      api.status().then((s) => alive && setStatus(s)).catch(() => {});
      api.notifications().then((n) => alive && setUnread(n.unread)).catch(() => {});
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const unhealthy = status && !status.healthy;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur bg-paper/85 border-b border-black/5">
        <div className="max-w-screen-2xl mx-auto px-4 h-16 flex items-center gap-3 md:gap-4">
          <NavLink to="/" className="flex items-center gap-2 shrink-0">
            <span className="inline-block h-7 w-7 rounded-full bg-accent grid place-items-center text-white text-[11px] font-bold">28</span>
            <span className="font-display font-bold tracking-tight text-lg">LA28</span>
            <span className="text-black/40 text-sm hidden md:inline font-medium">· Olympics</span>
          </NavLink>
          <nav className="flex items-center gap-0.5 md:gap-1 ml-1 overflow-x-auto no-scrollbar">
            {[
              ["/schedule", "Schedule"],
              ["/sports", "Sports"],
              ["/map", "Map"],
              ["/my", "My"],
            ].map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  "nav-link whitespace-nowrap relative " + (isActive ? "nav-link-active" : "")
                }
              >
                {label}
                {to === "/my" && starCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-gold text-ink text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
                    {starCount > 99 ? "99+" : starCount}
                  </span>
                )}
              </NavLink>
            ))}
            <NavLink
              to="/notifications"
              aria-label="Notifications"
              className={({ isActive }) =>
                "nav-link relative " + (isActive ? "nav-link-active" : "")
              }
            >
              🔔
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 bg-accent text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </NavLink>
            <NavLink
              to="/status"
              aria-label="Status"
              className={({ isActive }) =>
                "nav-link " + (isActive ? "nav-link-active" : "")
              }
            >
              ⚙
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2 text-xs text-black/60">
            {status?.current_version && (
              <span className="chip">v{status.current_version}</span>
            )}
            {status && (
              <span className="chip">{status.sessions_count} sessions</span>
            )}
          </div>
        </div>
        {unhealthy && (
          <div className="bg-red-600 text-white text-sm">
            <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center gap-3">
              <span className="font-semibold">Data refresh failed.</span>
              <span className="opacity-90 truncate">
                {status?.last_attempt?.error ?? "Unknown error"}
              </span>
              <NavLink to="/status" className="ml-auto underline">
                View status →
              </NavLink>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Home status={status} />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/sports" element={<SportsPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/my" element={<MySchedule />} />
        </Routes>
      </main>
      <PushPrompt />
      <Concierge />

      <footer className="max-w-screen-2xl mx-auto px-4 py-8 text-xs text-black/50">
        Data sourced from{" "}
        <a className="underline" href="https://la28.org/en/games-plan/olympics.html">
          la28.org
        </a>
        . Not affiliated with LA28 or the IOC.
      </footer>
    </div>
  );
}
