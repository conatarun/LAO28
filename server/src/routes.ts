import type { FastifyInstance } from "fastify";
import { db, getMeta } from "./db.js";
import { runRefresh } from "./ingest/refresh.js";
import { vapid, newSubscriptionId, sendPush } from "./push.js";
import { chat, getMonthlySpend, type ChatMessage } from "./chat.js";
import venueCoordsJson from "../data/venue-coords.json" with { type: "json" };

const venueCoords = venueCoordsJson as Record<
  string,
  { lat: number; lng: number; city: string }
>;

const SUB_COOKIE = "la28_sub";
const ONE_YEAR = 60 * 60 * 24 * 365;

function getSubIdFromReq(req: any): string | null {
  const cookie = req.headers.cookie as string | undefined;
  if (!cookie) return null;
  const m = cookie.split(/;\s*/).find((c) => c.startsWith(SUB_COOKIE + "="));
  return m ? decodeURIComponent(m.split("=")[1]) : null;
}

function setSubCookie(reply: any, subId: string) {
  reply.header(
    "Set-Cookie",
    `${SUB_COOKIE}=${encodeURIComponent(subId)}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax; HttpOnly`
  );
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/status", async () => {
    const lastAttempt = db
      .prepare("SELECT * FROM refresh_log ORDER BY id DESC LIMIT 1")
      .get() as any;
    const lastSuccess = db
      .prepare("SELECT * FROM refresh_log WHERE ok = 1 ORDER BY id DESC LIMIT 1")
      .get() as any;
    const sessionsCount = (db.prepare("SELECT COUNT(*) c FROM sessions").get() as any).c;
    const venuesCount = (db
      .prepare(
        "SELECT COUNT(DISTINCT venue) c FROM sessions WHERE venue IS NOT NULL AND venue <> '' AND venue <> 'TBD' AND venue <> 'N/A'"
      )
      .get() as any).c;
    return {
      last_attempt: lastAttempt
        ? { ...lastAttempt, ok: !!lastAttempt.ok, medal: undefined }
        : null,
      last_success: lastSuccess ? { ...lastSuccess, ok: !!lastSuccess.ok } : null,
      current_version: getMeta("last_source_version"),
      raw_preview: getMeta("last_raw_text_preview"),
      sessions_count: sessionsCount,
      venues_count: venuesCount,
      healthy: !!lastAttempt && !!lastAttempt.ok,
    };
  });

  app.get("/api/refresh-log", async () => {
    return db.prepare("SELECT * FROM refresh_log ORDER BY id DESC LIMIT 50").all();
  });

  app.post("/api/refresh", async () => {
    const r = await runRefresh({ force: true });
    return r;
  });

  app.get("/api/sessions", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const where: string[] = [];
    const params: any[] = [];
    if (q.sport) {
      where.push("sport = ?");
      params.push(q.sport);
    }
    if (q.venue) {
      where.push("venue = ?");
      params.push(q.venue);
    }
    if (q.date) {
      where.push("substr(start_utc, 1, 10) = ?");
      params.push(q.date);
    }
    if (q.medal === "true") where.push("medal = 1");
    const sql = `SELECT * FROM sessions ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY start_utc LIMIT 5000`;
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map((r) => ({ ...r, medal: !!r.medal }));
  });

  app.get("/api/search", async (req) => {
    const { q } = req.query as { q?: string };
    if (!q || q.length < 2) return [];
    const rows = db
      .prepare(
        `SELECT s.*, bm25(sessions_fts) AS rank
         FROM sessions_fts
         JOIN sessions s ON s.rowid = sessions_fts.rowid
         WHERE sessions_fts MATCH ?
         ORDER BY rank LIMIT 200`
      )
      .all(q + "*") as any[];
    return rows.map((r) => ({ ...r, medal: !!r.medal }));
  });

  app.get("/api/sports", async () => {
    return db
      .prepare("SELECT sport, COUNT(*) as count FROM sessions GROUP BY sport ORDER BY sport")
      .all();
  });

  app.get("/api/venues", async () => {
    // Derive venues from the currently-parsed sessions, joined with static
    // coordinates. Any venue we haven't geolocated yet still appears in the
    // list with lat/lng = null so the schedule still filters by it.
    const rows = db
      .prepare(
        `SELECT venue AS name, COUNT(*) AS sessions,
                SUM(medal) AS medals,
                GROUP_CONCAT(DISTINCT sport) AS sports_csv,
                MAX(discipline) AS zone
         FROM sessions
         WHERE venue IS NOT NULL AND venue <> '' AND venue <> 'TBD' AND venue <> 'N/A'
         GROUP BY venue
         ORDER BY venue`
      )
      .all() as Array<{
        name: string; sessions: number; medals: number | null; sports_csv: string; zone: string | null;
      }>;
    return rows.map((v) => {
      const coord = venueCoords[v.name];
      return {
        slug: v.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: v.name,
        zone: v.zone,
        city: coord?.city ?? null,
        lat: coord?.lat ?? null,
        lng: coord?.lng ?? null,
        sessions: v.sessions,
        medals: v.medals ?? 0,
        sports: v.sports_csv ? v.sports_csv.split(",").sort() : [],
      };
    });
  });

  // ---------- Push / notifications ----------

  app.get("/api/push/vapid-public-key", async () => ({ key: vapid.publicKey }));

  app.post("/api/push/subscribe", async (req, reply) => {
    const body = req.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      reply.code(400);
      return { error: "invalid subscription" };
    }
    const existing = db
      .prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?")
      .get(body.endpoint) as { id: string } | undefined;
    const now = new Date().toISOString();
    let id: string;
    if (existing) {
      id = existing.id;
      db.prepare(
        "UPDATE push_subscriptions SET p256dh = ?, auth = ?, last_seen_at = ?, disabled = 0 WHERE id = ?"
      ).run(body.keys.p256dh, body.keys.auth, now, id);
    } else {
      id = newSubscriptionId();
      db.prepare(
        `INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_agent, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, body.endpoint, body.keys.p256dh, body.keys.auth, req.headers["user-agent"] ?? null, now, now);
    }
    setSubCookie(reply, id);
    return { id };
  });

  app.post("/api/push/unsubscribe", async (req) => {
    const id = getSubIdFromReq(req);
    if (!id) return { ok: true };
    db.prepare("UPDATE push_subscriptions SET disabled = 1 WHERE id = ?").run(id);
    return { ok: true };
  });

  app.post("/api/push/test", async (req) => {
    const id = getSubIdFromReq(req);
    if (!id) return { ok: false, error: "no subscription" };
    const sub = db
      .prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE id = ? AND disabled = 0")
      .get(id) as any;
    if (!sub) return { ok: false, error: "subscription not found" };
    const r = await sendPush(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      { title: "LA28 notifications are on", body: "You'll be alerted on changes for sports you follow.", url: "/notifications" }
    );
    return r;
  });

  app.get("/api/follows", async (req) => {
    const id = getSubIdFromReq(req);
    if (!id) return { following: [] };
    const rows = db.prepare("SELECT sport FROM follows WHERE subscription_id = ?").all(id) as Array<{ sport: string }>;
    return { following: rows.map((r) => r.sport) };
  });

  app.post("/api/follows", async (req, reply) => {
    const id = getSubIdFromReq(req);
    if (!id) {
      reply.code(401);
      return { error: "subscribe first" };
    }
    const { sport, on } = req.body as { sport: string; on: boolean };
    if (!sport) {
      reply.code(400);
      return { error: "sport required" };
    }
    if (on) {
      db.prepare(
        "INSERT OR IGNORE INTO follows (subscription_id, sport, created_at) VALUES (?, ?, ?)"
      ).run(id, sport, new Date().toISOString());
    } else {
      db.prepare("DELETE FROM follows WHERE subscription_id = ? AND sport = ?").run(id, sport);
    }
    return { ok: true };
  });

  app.get("/api/notifications", async (req) => {
    const id = getSubIdFromReq(req);
    if (!id) return { items: [], unread: 0 };
    const items = db
      .prepare(
        `SELECT id, sport, kind, title, body, session_id, created_at, read_at, push_status
         FROM notifications WHERE subscription_id = ? ORDER BY id DESC LIMIT 200`
      )
      .all(id);
    const unread = (db
      .prepare("SELECT COUNT(*) c FROM notifications WHERE subscription_id = ? AND read_at IS NULL")
      .get(id) as any).c;
    return { items, unread };
  });

  app.post("/api/notifications/read", async (req) => {
    const id = getSubIdFromReq(req);
    if (!id) return { ok: true };
    const { ids } = (req.body ?? {}) as { ids?: number[] };
    const now = new Date().toISOString();
    if (ids && ids.length) {
      const q = "UPDATE notifications SET read_at = ? WHERE subscription_id = ? AND id IN (" +
        ids.map(() => "?").join(",") + ")";
      db.prepare(q).run(now, id, ...ids);
    } else {
      db.prepare("UPDATE notifications SET read_at = ? WHERE subscription_id = ? AND read_at IS NULL").run(now, id);
    }
    return { ok: true };
  });

  // ---------- Chat concierge ----------

  app.post("/api/chat", async (req, reply) => {
    const { messages, starred_ids } = req.body as {
      messages: ChatMessage[];
      starred_ids: string[];
    };
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      reply.code(400);
      return { error: "messages required" };
    }
    // Rate limit: 25 messages per visitor per hour (by IP).
    const ip = req.ip;
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const recent = (db
      .prepare("SELECT COUNT(*) c FROM chat_usage WHERE visitor = ? AND created_at > ?")
      .get(ip, hourAgo) as any).c;
    if (recent > 25) {
      return {
        reply: { role: "assistant", content: "You've been chatting a lot! Take a breather and try again in a bit, or browse the schedule directly." },
        budgetRemaining: 1000 - getMonthlySpend(),
        disabled: false,
      };
    }
    const result = await chat(messages, starred_ids ?? [], ip);
    return result;
  });

  app.get("/api/chat/budget", async () => {
    const spent = getMonthlySpend();
    return { spent_cents: spent, budget_cents: 1000, remaining_cents: 1000 - spent, disabled: spent >= 1000 };
  });

  app.get("/api/days", async () => {
    return db
      .prepare(
        `SELECT substr(start_utc, 1, 10) AS date, COUNT(*) AS count,
                SUM(medal) AS medals
         FROM sessions GROUP BY date ORDER BY date`
      )
      .all();
  });
}

export async function seedVenues() {
  // Venues are now derived from parsed sessions in /api/venues; nothing to seed.
  // (Kept for startup compatibility.)
}
