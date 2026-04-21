import { db, setMeta, getMeta } from "../db.js";
import { discoverPdfs, downloadPdf } from "./fetch.js";
import { parseSchedulePdf, type ParsedSession } from "./parse.js";
import { diffAgainstSnapshot, fanOut, writeSnapshotFromCurrent } from "../notify.js";
import { refreshScheduleSummary } from "../chat.js";
import { join } from "node:path";

const DATA_DIR = process.env.DATA_DIR ?? "./data";
const PDF_DIR = join(DATA_DIR, "pdfs");

export type RefreshResult = {
  ok: boolean;
  version: string | null;
  pdfs_downloaded: number;
  sessions_parsed: number;
  error: string | null;
  duration_ms: number;
  skipped: boolean;
};

/**
 * Run a full ingest: discover PDFs, compare version, download if new, parse,
 * replace session rows. Always logs to refresh_log. Never throws — returns
 * the error in the result so callers can surface it.
 */
export async function runRefresh(opts: { force?: boolean } = {}): Promise<RefreshResult> {
  const t0 = Date.now();
  let version: string | null = null;
  let downloaded = 0;
  let parsed = 0;
  let skipped = false;
  let error: string | null = null;

  try {
    const discovered = await discoverPdfs();
    version = discovered.version;
    const last = getMeta("last_source_version");
    const lastHash = getMeta("last_page_hash");
    if (
      !opts.force &&
      last === discovered.version &&
      lastHash === discovered.pageHash
    ) {
      skipped = true;
    } else {
      const urls = [discovered.byDay, discovered.bySession, discovered.byEvent].filter(
        (u): u is string => !!u
      );
      const paths: string[] = [];
      for (const url of urls) {
        paths.push(await downloadPdf(url, PDF_DIR));
        downloaded++;
      }

      // Parse the richest PDF. "By Event" has one row per session with full
      // columns (sport, venue, zone, code, date, type, description, times).
      // "By Session" is more compact and "By Day" is layout-only.
      const primary =
        paths.find((p) => /event/i.test(p)) ??
        paths.find((p) => /session/i.test(p)) ??
        paths.find((p) => /day/i.test(p)) ??
        paths[0];

      let allSessions: ParsedSession[] = [];
      let rawPrimary = "";
      if (primary) {
        const result = await parseSchedulePdf(primary, discovered.version);
        allSessions = result.sessions;
        rawPrimary = result.rawText;
      }
      parsed = allSessions.length;

      // Replace in a transaction.
      const replace = db.transaction((rows: ParsedSession[]) => {
        db.prepare("DELETE FROM sessions").run();
        db.prepare("DELETE FROM sessions_fts").run();
        const ins = db.prepare(`
          INSERT INTO sessions (id, sport, discipline, event, venue, start_utc, end_utc, medal, session_code, source_version, raw)
          VALUES (@id, @sport, @discipline, @event, @venue, @start_utc, @end_utc, @medal, @session_code, @source_version, @raw)
        `);
        const fts = db.prepare(
          "INSERT INTO sessions_fts(rowid, sport, discipline, event, venue) VALUES ((SELECT rowid FROM sessions WHERE id = ?), ?, ?, ?, ?)"
        );
        for (const s of rows) {
          ins.run({ ...s, medal: s.medal ? 1 : 0 });
          fts.run(s.id, s.sport, s.discipline ?? "", s.event ?? "", s.venue ?? "");
        }
      });
      if (allSessions.length > 0) {
        replace(allSessions);
        // Diff against previous snapshot and fan out notifications, then
        // update the snapshot so the next refresh diffs against this state.
        try {
          const changes = diffAgainstSnapshot();
          if (changes.length > 0) {
            const r = await fanOut(changes);
            console.log("[notify] fanOut", { changes: changes.length, ...r });
          }
          writeSnapshotFromCurrent();
        } catch (e) {
          console.error("[notify] fan-out failed", e);
        }
      }

      // Refresh the chat concierge's pre-stuffed schedule summary.
      try { refreshScheduleSummary(); } catch { /* ignore */ }

      setMeta("last_source_version", discovered.version);
      setMeta("last_page_hash", discovered.pageHash);
      setMeta("last_raw_text_preview", rawPrimary.slice(0, 4000));
      if (allSessions.length === 0 && rawPrimary.length > 0) {
        error = "PDF downloaded but 0 sessions parsed — parser needs tuning (see raw preview on /status)";
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const duration = Date.now() - t0;
  db.prepare(
    `INSERT INTO refresh_log (ran_at, ok, source_version, pdfs_downloaded, sessions_parsed, error, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    new Date().toISOString(),
    error ? 0 : 1,
    version,
    downloaded,
    parsed,
    error,
    duration
  );

  return {
    ok: !error,
    version,
    pdfs_downloaded: downloaded,
    sessions_parsed: parsed,
    error,
    duration_ms: duration,
    skipped,
  };
}
