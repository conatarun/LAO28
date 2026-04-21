import { useEffect, useState } from "react";
import { api, type DayEntry, type Session, type SportEntry, type Status } from "../api.js";
import { SessionCard } from "../components/SessionCard.js";
import { SportIcon } from "../components/SportIcon.js";
import { Link } from "react-router-dom";

export default function Home({ status }: { status: Status | null }) {
  const [days, setDays] = useState<DayEntry[]>([]);
  const [upcoming, setUpcoming] = useState<Session[]>([]);
  const [sports, setSports] = useState<SportEntry[]>([]);

  useEffect(() => {
    api.days().then(setDays).catch(() => {});
    api.sessions({ medal: "true" }).then((rows) => setUpcoming(rows.slice(0, 6))).catch(() => {});
    api.sports().then((s) => setSports(s.slice(0, 12))).catch(() => {});
  }, []);

  return (
    <div className="space-y-8 md:space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl hero-bg hero-ring text-white">
        <div className="absolute inset-0 pointer-events-none opacity-[0.07]" aria-hidden>
          <svg viewBox="0 0 800 400" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
            <g fill="none" stroke="white" strokeWidth="2">
              <circle cx="180" cy="200" r="80" />
              <circle cx="280" cy="200" r="80" />
              <circle cx="380" cy="200" r="80" />
              <circle cx="230" cy="260" r="80" />
              <circle cx="330" cy="260" r="80" />
            </g>
          </svg>
        </div>
        <div className="relative p-6 md:p-12 lg:p-16">
          <div className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-white/60">
            <span className="h-px w-8 bg-white/30" />
            July 14 – 30, 2028
          </div>
          <h1 className="mt-4 font-display font-bold h-hero tracking-tight">
            Every session,
            <br />
            <span className="bg-gradient-to-r from-accent via-gold to-white bg-clip-text text-transparent">
              at your fingertips.
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-white/70 text-[clamp(0.95rem,0.4vw+.8rem,1.25rem)] leading-relaxed">
            A fluid, always-fresh dashboard for the LA 2028 Olympic Games. Search, filter, map and get
            push-notified when anything changes — no account needed.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/schedule" className="btn bg-accent hover:bg-accent/90 text-base md:text-lg px-5 py-3">
              Browse schedule
              <span aria-hidden>→</span>
            </Link>
            <Link to="/map" className="btn bg-white/10 hover:bg-white/20 text-base md:text-lg px-5 py-3">Venues map</Link>
            <Link to="/my" className="btn bg-white/10 hover:bg-white/20 text-base md:text-lg px-5 py-3">My schedule</Link>
          </div>

          {status && (
            <div className="mt-8 grid grid-cols-3 sm:grid-cols-4 gap-3 max-w-2xl">
              <Stat value={status.sessions_count} label="Sessions" />
              <Stat value={sports.length > 0 ? sports.length : "—"} label="Sports" />
              <Stat value={status.venues_count} label="Venues" />
              <Stat
                value={status.current_version ? "v" + status.current_version : "—"}
                label="Schedule"
                small
              />
            </div>
          )}
        </div>
      </section>

      {/* Days */}
      <section>
        <SectionHead title="Competition days" link={{ to: "/schedule", label: "All sessions →" }} />
        {days.length === 0 ? (
          <EmptyState to="/status">No schedule data yet — check refresh status.</EmptyState>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-2">
            {days.map((d) => {
              const date = new Date(d.date + "T12:00:00-07:00");
              return (
                <Link
                  key={d.date}
                  to={`/schedule?date=${d.date}`}
                  className="group card !p-3 hover:bg-ink hover:text-white hover:-translate-y-0.5 transition-all text-center"
                >
                  <div className="text-[10px] tracking-widest uppercase opacity-60 group-hover:opacity-80">
                    {date.toLocaleDateString([], { weekday: "short" })}
                  </div>
                  <div className="font-display text-2xl font-bold">{date.getDate()}</div>
                  <div className="text-[10px] opacity-60 group-hover:opacity-80">
                    {date.toLocaleDateString([], { month: "short" })}
                  </div>
                  <div className="mt-1 text-xs">
                    {d.count}
                    {d.medals > 0 && <span className="ml-1 text-gold">🏅{d.medals}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Sports strip */}
      {sports.length > 0 && (
        <section>
          <SectionHead title="Popular sports" link={{ to: "/sports", label: "All sports →" }} />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {sports.map((s) => (
              <Link
                key={s.sport}
                to={`/schedule?sport=${encodeURIComponent(s.sport)}`}
                className="card !p-3 flex items-center gap-2.5 hover:-translate-y-0.5 transition"
              >
                <SportIcon sport={s.sport} size={48} className="shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{s.sport}</div>
                  <div className="text-xs text-black/50">{s.count} sessions</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Medal highlights */}
      {upcoming.length > 0 && (
        <section>
          <SectionHead title="Medal sessions" link={{ to: "/schedule?medal=true", label: "All medals →" }} />
          <div className="grid md:grid-cols-2 gap-3">
            {upcoming.map((s) => <SessionCard key={s.id} s={s} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ value, label, small }: { value: any; label: string; small?: boolean }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm px-4 py-3">
      <div className={"font-display font-bold " + (small ? "text-lg" : "text-2xl md:text-3xl")}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-white/50">{label}</div>
    </div>
  );
}

function SectionHead({ title, link }: { title: string; link?: { to: string; label: string } }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight">{title}</h2>
      {link && <Link to={link.to} className="text-sm text-black/60 hover:text-black">{link.label}</Link>}
    </div>
  );
}

function EmptyState({ children, to }: { children: React.ReactNode; to: string }) {
  return (
    <div className="card text-center text-black/60">
      {children}{" "}
      <Link to={to} className="underline">/status</Link>
    </div>
  );
}
