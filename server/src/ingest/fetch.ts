import { request } from "undici";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const LA28_ORIGIN = "https://la28.org";
const LA28_PAGE = `${LA28_ORIGIN}/en/games-plan/olympics.html`;

// The la28.org page links three schedule PDFs. As of v3.0 (March 16) the
// actual URLs look like:
//   /content/dam/latwentyeight/competition-schedule-imagery/uploaded-march-16-v-3-0/
//     LA28OlympicGamesCompetitionScheduleByDayV3.0.pdf
// i.e. camel-case filenames and relative paths. We match broadly on any PDF
// whose href contains "CompetitionSchedule" (case-insensitive) and then
// absolutize against the origin.
const PDF_HREF_RE =
  /href=["']((?:https?:\/\/[^"']+|\/[^"']+)competitionschedule[^"']+\.pdf)["']/gi;

export type DiscoveredPdfs = {
  byDay?: string;
  bySession?: string;
  byEvent?: string;
  version: string; // extracted from filenames, e.g. "v3"
  pageHash: string; // hash of HTML, used as fallback change detector
};

export async function discoverPdfs(): Promise<DiscoveredPdfs> {
  const res = await request(LA28_PAGE, {
    maxRedirections: 5,
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; LA28Dashboard/0.1; +https://la28.local)",
    },
  });
  if (res.statusCode !== 200) {
    throw new Error(`la28.org returned HTTP ${res.statusCode}`);
  }
  const html = await res.body.text();
  const matches: string[] = [];
  for (const m of html.matchAll(PDF_HREF_RE)) matches.push(m[1]);
  const urls = Array.from(new Set(matches)).map((u) =>
    u.startsWith("http") ? u : LA28_ORIGIN + u
  );
  if (urls.length === 0) {
    throw new Error("No schedule PDF URLs found on la28.org page");
  }
  const pick = (needle: string) =>
    urls.find((u) => u.toLowerCase().includes(needle));
  const version =
    urls
      .map((u) => u.match(/v[-_.]?(\d+(?:[-_.]\d+)*)/i)?.[1])
      .filter(Boolean)[0] ?? "unknown";
  return {
    byDay: pick("byday") ?? pick("day"),
    bySession: pick("bysession") ?? pick("session"),
    byEvent: pick("byevent") ?? pick("event"),
    version,
    pageHash: createHash("sha256").update(html).digest("hex").slice(0, 16),
  };
}

export async function downloadPdf(url: string, destDir: string): Promise<string> {
  const res = await request(url, { maxRedirections: 5 });
  if (res.statusCode !== 200) {
    throw new Error(`PDF ${url} returned HTTP ${res.statusCode}`);
  }
  const buf = Buffer.from(await res.body.arrayBuffer());
  const filename = url.split("/").pop()!.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dest = join(destDir, filename);
  await writeFile(dest, buf);
  return dest;
}
