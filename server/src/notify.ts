import { db } from "./db.js";
import { sendPush, maybeDisableOnFailure, type PushPayload } from "./push.js";

type SnapshotRow = {
  id: string;
  sport: string;
  event: string | null;
  venue: string | null;
  start_utc: string;
  medal: number;
};

export type Change = {
  kind: "added" | "removed" | "time_change" | "venue_change" | "new_medal";
  sport: string;
  session_id: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
};

/**
 * Diff current sessions against session_snapshot, return a list of changes
 * worth notifying on. Caller is responsible for updating the snapshot after
 * notifications have been queued.
 */
export function diffAgainstSnapshot(): Change[] {
  const current = db
    .prepare(
      "SELECT id, sport, event, venue, start_utc, medal FROM sessions"
    )
    .all() as SnapshotRow[];
  const prior = db
    .prepare(
      "SELECT id, sport, event, venue, start_utc, medal FROM session_snapshot"
    )
    .all() as SnapshotRow[];

  const priorById = new Map(prior.map((r) => [r.id, r]));
  const currentById = new Map(current.map((r) => [r.id, r]));
  const changes: Change[] = [];

  // If the snapshot is empty, this is the initial import; emit no notifications.
  if (prior.length === 0) return [];

  for (const c of current) {
    const p = priorById.get(c.id);
    if (!p) {
      if (c.medal) {
        changes.push({
          kind: "new_medal",
          sport: c.sport,
          session_id: c.id,
          title: `🏅 New ${c.sport} medal session`,
          body: `${c.event ?? "Medal event"} — ${formatTime(c.start_utc)}${c.venue ? " · " + c.venue : ""}`,
          payload: c,
        });
      } else {
        changes.push({
          kind: "added",
          sport: c.sport,
          session_id: c.id,
          title: `${c.sport}: new session`,
          body: `${c.event ?? ""} — ${formatTime(c.start_utc)}${c.venue ? " · " + c.venue : ""}`.trim(),
          payload: c,
        });
      }
      continue;
    }
    if (p.start_utc !== c.start_utc) {
      changes.push({
        kind: "time_change",
        sport: c.sport,
        session_id: c.id,
        title: `${c.sport}: time changed`,
        body: `${c.event ?? ""} moved to ${formatTime(c.start_utc)} (was ${formatTime(p.start_utc)})`,
        payload: { before: p, after: c },
      });
    }
    if ((p.venue ?? "") !== (c.venue ?? "")) {
      changes.push({
        kind: "venue_change",
        sport: c.sport,
        session_id: c.id,
        title: `${c.sport}: venue changed`,
        body: `${c.event ?? ""} now at ${c.venue ?? "TBD"} (was ${p.venue ?? "TBD"})`,
        payload: { before: p, after: c },
      });
    }
  }
  for (const p of prior) {
    if (!currentById.has(p.id)) {
      changes.push({
        kind: "removed",
        sport: p.sport,
        session_id: p.id,
        title: `${p.sport}: session removed`,
        body: `${p.event ?? ""} at ${formatTime(p.start_utc)} was removed`,
        payload: p,
      });
    }
  }
  return changes;
}

export function writeSnapshotFromCurrent() {
  db.transaction(() => {
    db.prepare("DELETE FROM session_snapshot").run();
    db.prepare(
      `INSERT INTO session_snapshot (id, sport, event, venue, start_utc, medal)
       SELECT id, sport, event, venue, start_utc, medal FROM sessions`
    ).run();
  })();
}

/**
 * For each change, find subscriptions following that sport, insert a
 * notification row, and attempt to deliver via Web Push. Always writes the
 * row first so in-app feed shows it even if push fails.
 */
export async function fanOut(changes: Change[]) {
  if (changes.length === 0) return { delivered: 0, failed: 0, queued: 0 };
  const subsBySport = db.prepare(
    `SELECT s.id, s.endpoint, s.p256dh, s.auth
     FROM push_subscriptions s
     JOIN follows f ON f.subscription_id = s.id
     WHERE f.sport = ? AND s.disabled = 0`
  );
  const insertNotif = db.prepare(
    `INSERT INTO notifications (subscription_id, sport, kind, title, body, session_id, payload, created_at, push_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  );
  const updatePush = db.prepare(
    "UPDATE notifications SET push_status = ?, push_error = ? WHERE id = ?"
  );

  let delivered = 0, failed = 0, queued = 0;
  for (const change of changes) {
    const subs = subsBySport.all(change.sport) as Array<{
      id: string; endpoint: string; p256dh: string; auth: string;
    }>;
    for (const sub of subs) {
      const res = insertNotif.run(
        sub.id,
        change.sport,
        change.kind,
        change.title,
        change.body,
        change.session_id,
        JSON.stringify(change.payload),
        new Date().toISOString()
      );
      queued++;
      const notifId = res.lastInsertRowid as number;
      const payload: PushPayload = {
        title: change.title,
        body: change.body,
        url: `/schedule?sport=${encodeURIComponent(change.sport)}`,
        tag: `${change.sport}-${change.session_id}`,
      };
      const r = await sendPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      if (r.ok) {
        delivered++;
        updatePush.run("sent", null, notifId);
      } else {
        failed++;
        updatePush.run("failed", r.error ?? "unknown", notifId);
        maybeDisableOnFailure(sub.id, r.statusCode);
      }
    }
  }
  return { delivered, failed, queued };
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
