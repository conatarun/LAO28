import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> =
  require("pdf-parse/lib/pdf-parse.js");

export type ParsedSession = {
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
  raw: string;
};

// Grammar observed in LA28OlympicGamesCompetitionScheduleByEventV3.0.pdf:
//
//   Sport
//   {Venue}{Zone}{SessionCode}{Date}{GamesDay}{SessionType}
//   <description lines>
//   {StartHH:MM}{EndHH:MM}    -- OR --    {StartHH:MM}\n<noise>\n{EndHH:MM}
//
// Fields are concatenated on the meta line because pdf-parse loses column
// whitespace. We anchor on (session code) + (date) to find meta lines, and
// treat any line PRECEDING a meta line as the sport for that row.
//
// Oklahoma City softball/canoe sessions use Central Time and interleave
// "OKC Local / Time (CT)" headers between the start and end times, so we
// accept either concatenated or split time formats.

// Intentionally no \b anchors: PDF text has "Complex 3ValleyBK301Sunday"
// where BK is adjacent to non-word chars that still flank word chars.
const SESSION_CODE_RE = /([A-Z]{2,4})(\d{2,5})(?=[A-Z]|$)/;
const DATE_RE =
  /((?:Mon|Tues?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?|Sun)[a-z]*),\s*(July|August)\s+(\d{1,2})/;
const TIME_CONCAT_RE = /^(\d{1,2}):(\d{2})(\d{1,2}):(\d{2})$/;
const TIME_SINGLE_RE = /^(\d{1,2}):(\d{2})$/;

// Known LA28 zones / location tags, as emitted in the By Event PDF. Order
// matters: longer names first so "Long Beach" is matched before "Long".
const ZONES = [
  "Port of Los Angeles",
  "Whittier Narrows",
  "Oklahoma City",
  "Exposition Park",
  "City of Industry",
  "Universal City",
  "Trestles Beach",
  "Orange County",
  "South Bay",
  "Long Beach",
  "San Diego",
  "Inglewood",
  "Downtown",
  "Pasadena",
  "Anaheim",
  "Arcadia",
  "Riviera",
  "Pomona",
  "Venice",
  "Carson",
  "Valley",
  "Coastal",
  "DTLA",
  "DTL",
  "OKC",
  "OK",
  "TB",
];

const LA_OFFSET = "-07:00";
const CT_OFFSET = "-05:00"; // OKC during summer (CDT)

function toUtc(month: string, day: number, hh: string, mm: string, offset: string): string {
  const mi = month.toLowerCase().startsWith("jul") ? 7 : 8;
  const iso = `2028-${String(mi).padStart(2, "0")}-${String(day).padStart(2, "0")}T${hh.padStart(2, "0")}:${mm}:00${offset}`;
  return new Date(iso).toISOString();
}

function splitVenueZone(concat: string): { venue: string; zone: string | null } {
  for (const z of ZONES) {
    if (concat.endsWith(z)) {
      const venue = concat.slice(0, concat.length - z.length).trim();
      if (venue.length > 0) return { venue, zone: z };
    }
  }
  return { venue: concat.trim(), zone: null };
}

type PendingSession = {
  sport: string;
  metaLine: string;
  code: string;
  month: string;
  day: number;
  venue: string;
  zone: string | null;
  sessionType: string;
  descriptions: string[];
  times: string[]; // raw HH:MM strings collected, up to 2
  isOkc: boolean;
};

function finalize(
  p: PendingSession | null,
  sourceVersion: string,
  out: ParsedSession[]
) {
  if (!p) return;
  // Need at least one time. Prefer two; if only one, set end = start.
  if (p.times.length === 0) return;
  const offset = p.isOkc ? CT_OFFSET : LA_OFFSET;
  const [sHH, sMM] = p.times[0].split(":");
  const startUtc = toUtc(p.month, p.day, sHH, sMM, offset);
  let endUtc: string | null = null;
  if (p.times.length >= 2) {
    const [eHH, eMM] = p.times[1].split(":");
    endUtc = toUtc(p.month, p.day, eHH, eMM, offset);
    // If end < start, assume rolled past midnight.
    if (new Date(endUtc) < new Date(startUtc)) {
      endUtc = toUtc(p.month, p.day + 1, eHH, eMM, offset);
    }
  }
  const description = p.descriptions.join(" · ").replace(/\s+/g, " ").trim();
  const haystack = `${p.sessionType} ${description}`.toLowerCase();
  const medal =
    /gold medal|bronze medal|\bmedal\b/.test(haystack) ||
    (/\bfinal\b/.test(haystack) && !/semi|quarter|qualif/.test(haystack));
  const id = createHash("sha1")
    .update(`${p.code}-${p.day}-${p.times[0]}`)
    .digest("hex")
    .slice(0, 16);
  out.push({
    id,
    sport: p.sport,
    discipline: p.zone,
    event: description || p.sessionType || null,
    venue: p.venue || null,
    start_utc: startUtc,
    end_utc: endUtc,
    medal,
    session_code: p.code,
    source_version: sourceVersion,
    raw: [p.sport, p.metaLine, ...p.descriptions, ...p.times].join("\n"),
  });
}

export async function parseSchedulePdf(
  path: string,
  sourceVersion: string
): Promise<{ sessions: ParsedSession[]; rawText: string }> {
  const buf = await readFile(path);
  const { text } = await pdfParse(buf);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const sessions: ParsedSession[] = [];
  let pending: PendingSession | null = null;
  let prevLine = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Ignore pagination / column header noise.
    if (/^(page|sport|venue|zone|session|date|games? day|session type|start time|end time|okc local|time \(ct\)|time \(pt\)|in partnership|©|competition schedule|LA28)/i.test(line)) {
      continue;
    }

    const hasCode = SESSION_CODE_RE.test(line);
    const hasDate = DATE_RE.test(line);

    if (hasCode && hasDate) {
      // New session starts. Finalize previous.
      finalize(pending, sourceVersion, sessions);
      const codeMatch = line.match(SESSION_CODE_RE)!;
      const dateMatch = line.match(DATE_RE)!;
      const code = codeMatch[0];
      const month = dateMatch[2];
      const day = parseInt(dateMatch[3], 10);
      const codePos = line.indexOf(code);
      const datePos = line.indexOf(dateMatch[0]);
      const beforeCode = line.slice(0, codePos);
      const afterDate = line.slice(datePos + dateMatch[0].length);
      const { venue, zone } = splitVenueZone(beforeCode);
      const gdMatch = afterDate.match(/^(\d{1,3})(.*)$/);
      const sessionType = (gdMatch ? gdMatch[2] : afterDate).trim();
      const isOkc = /okc|oklahoma/i.test(venue) || zone === "OKC";
      pending = {
        sport: prevLine || "Unknown",
        metaLine: line,
        code,
        month,
        day,
        venue,
        zone,
        sessionType,
        descriptions: [],
        times: [],
        isOkc,
      };
      prevLine = line;
      continue;
    }

    // Time lines close out when we've got both start & end for this session.
    const mc = line.match(TIME_CONCAT_RE);
    if (mc && pending) {
      pending.times = [`${mc[1]}:${mc[2]}`, `${mc[3]}:${mc[4]}`];
      finalize(pending, sourceVersion, sessions);
      pending = null;
      prevLine = line;
      continue;
    }
    const ms = line.match(TIME_SINGLE_RE);
    if (ms && pending) {
      pending.times.push(`${ms[1]}:${ms[2]}`);
      if (pending.times.length >= 2) {
        finalize(pending, sourceVersion, sessions);
        pending = null;
      }
      prevLine = line;
      continue;
    }

    // Otherwise, description (if inside a session) or possible sport label.
    if (pending) {
      pending.descriptions.push(line);
    }
    prevLine = line;
  }
  finalize(pending, sourceVersion, sessions);

  return { sessions, rawText: text };
}
