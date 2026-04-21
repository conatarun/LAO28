// Types shared between client and server.

export type SessionRow = {
  id: string;
  sport: string;
  discipline: string | null;
  event: string | null;
  venue: string | null;
  start_utc: string; // ISO 8601
  end_utc: string | null;
  medal: boolean;
  session_code: string | null;
  source_version: string;
};

export type Venue = {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  city: string;
  sports: string[];
};

export type RefreshLogEntry = {
  id: number;
  ran_at: string; // ISO
  ok: boolean;
  source_version: string | null;
  pdfs_downloaded: number;
  sessions_parsed: number;
  error: string | null;
  duration_ms: number;
};

export type StatusResponse = {
  last_success: RefreshLogEntry | null;
  last_attempt: RefreshLogEntry | null;
  current_version: string | null;
  sessions_count: number;
  venues_count: number;
  healthy: boolean;
};
