export type Session = {
  id: string;
  sport: string;
  discipline: string | null;
  event: string | null;
  venue: string | null;
  start_utc: string;
  end_utc: string | null;
  medal: boolean;
  session_code: string | null;
  source_version: string;
};

export type Venue = {
  slug: string;
  name: string;
  zone: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  sessions: number;
  medals: number;
  sports: string[];
};

export type DayEntry = { date: string; count: number; medals: number };
export type SportEntry = { sport: string; count: number };

export type Status = {
  last_attempt: any;
  last_success: any;
  current_version: string | null;
  raw_preview: string | null;
  sessions_count: number;
  venues_count: number;
  healthy: boolean;
};

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

export type Notification = {
  id: number;
  sport: string;
  kind: string;
  title: string;
  body: string;
  session_id: string | null;
  created_at: string;
  read_at: string | null;
  push_status: string;
};

export const api = {
  status: () => fetch("/api/status").then(j<Status>),
  refreshLog: () => fetch("/api/refresh-log").then(j<any[]>),
  triggerRefresh: () => fetch("/api/refresh", { method: "POST" }).then(j<any>),
  sessions: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return fetch(`/api/sessions${q ? "?" + q : ""}`).then(j<Session[]>);
  },
  search: (q: string) =>
    fetch(`/api/search?q=${encodeURIComponent(q)}`).then(j<Session[]>),
  sports: () => fetch("/api/sports").then(j<SportEntry[]>),
  venues: () => fetch("/api/venues").then(j<Venue[]>),
  days: () => fetch("/api/days").then(j<DayEntry[]>),
  follows: () =>
    fetch("/api/follows", { credentials: "include" }).then(
      j<{ following: string[] }>
    ),
  setFollow: (sport: string, on: boolean) =>
    fetch("/api/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ sport, on }),
    }).then(j<{ ok: boolean }>),
  notifications: () =>
    fetch("/api/notifications", { credentials: "include" }).then(
      j<{ items: Notification[]; unread: number }>
    ),
  markRead: (ids?: number[]) =>
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids }),
    }).then(j<{ ok: boolean }>),
};
