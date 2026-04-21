import OpenAI from "openai";
import { createHash } from "node:crypto";
import { db } from "./db.js";

// OpenRouter — OpenAI-compatible API, free models available.
// Free models on OpenRouter (as of 2026):
//   meta-llama/llama-3.3-70b-instruct:free
//   google/gemini-2.0-flash-exp:free
//   mistralai/mistral-7b-instruct:free
// Rotate through free models — availability fluctuates on OpenRouter.
const FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-3-27b-it:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
];
const MAX_TOKENS = 450;

// ---------- Schema ----------

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_usage (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    month       TEXT NOT NULL,
    provider    TEXT NOT NULL DEFAULT 'openrouter',
    model       TEXT,
    input_tok   INTEGER NOT NULL DEFAULT 0,
    output_tok  INTEGER NOT NULL DEFAULT 0,
    cost_cents  REAL NOT NULL DEFAULT 0,
    visitor     TEXT,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chat_usage_month ON chat_usage(month);

  CREATE TABLE IF NOT EXISTS chat_cache (
    key        TEXT PRIMARY KEY,
    response   TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// ---------- Usage tracking ----------

function currentMonth() { return new Date().toISOString().slice(0, 7); }

export function getMonthlySpend(): number {
  return (db.prepare("SELECT COALESCE(SUM(cost_cents),0) AS t FROM chat_usage WHERE month=?")
    .get(currentMonth()) as any).t;
}

function logUsage(model: string, input: number, output: number, visitor: string | null) {
  db.prepare(
    `INSERT INTO chat_usage (month,provider,model,input_tok,output_tok,cost_cents,visitor,created_at)
     VALUES (?,'openrouter',?,?,?,0,?,?)`
  ).run(currentMonth(), model, input, output, visitor, new Date().toISOString());
}

function getHourlyCount(visitor: string): number {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  return (db.prepare("SELECT COUNT(*) c FROM chat_usage WHERE visitor=? AND created_at>?")
    .get(visitor, hourAgo) as any).c;
}

// ---------- Response cache (1hr TTL) ----------

function cacheKey(msgs: any[]) {
  return createHash("sha256").update(JSON.stringify(msgs)).digest("hex").slice(0, 32);
}

function getCached(key: string): string | null {
  const r = db.prepare("SELECT response, created_at FROM chat_cache WHERE key=?").get(key) as any;
  if (!r) return null;
  if (Date.now() - new Date(r.created_at).getTime() > 3600_000) {
    db.prepare("DELETE FROM chat_cache WHERE key=?").run(key);
    return null;
  }
  return r.response;
}

function setCache(key: string, resp: string) {
  db.prepare("INSERT OR REPLACE INTO chat_cache (key,response,created_at) VALUES (?,?,?)")
    .run(key, resp, new Date().toISOString());
}

// ---------- Pre-stuffed schedule summary ----------

let scheduleSummary = "";

export function refreshScheduleSummary() {
  const sports = db.prepare(
    "SELECT sport, COUNT(*) as c, SUM(medal) as m FROM sessions GROUP BY sport ORDER BY sport"
  ).all() as Array<{ sport: string; c: number; m: number }>;
  const venues = db.prepare(
    `SELECT venue, COUNT(*) as c, GROUP_CONCAT(DISTINCT sport) as sports
     FROM sessions WHERE venue IS NOT NULL AND venue<>'' AND venue<>'TBD'
     GROUP BY venue ORDER BY venue`
  ).all() as Array<{ venue: string; c: number; sports: string }>;
  const days = db.prepare(
    `SELECT substr(start_utc,1,10) as d, COUNT(*) as c, SUM(medal) as m
     FROM sessions GROUP BY d ORDER BY d`
  ).all() as Array<{ d: string; c: number; m: number }>;
  const total = (db.prepare("SELECT COUNT(*) c FROM sessions").get() as any).c;

  scheduleSummary = `
SCHEDULE DATA (${total} sessions, ${sports.length} sports, ${venues.length} venues):

SPORTS: ${sports.map(s => `${s.sport}(${s.c}sess,${s.m}medal)`).join(" | ")}

VENUES: ${venues.map(v => `${v.venue}: ${v.sports}`).join(" | ")}

DAYS: ${days.map(d => {
    const date = new Date(d.d + "T12:00:00-07:00");
    return `${date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}:${d.c}sess,${d.m}medal`;
  }).join(" | ")}
`.trim();
}

try { refreshScheduleSummary(); } catch { /* empty DB on first boot */ }

// ---------- Tools (OpenAI function calling format) ----------

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_sessions",
      description:
        "Search the Olympic schedule. Use ONLY when the pre-loaded summary can't answer, e.g. to get session IDs for starring. Call ONCE per message.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text search term" },
          sport: { type: "string", description: "Exact sport name" },
          date: { type: "string", description: "YYYY-MM-DD" },
          medal_only: { type: "boolean", description: "Only medal events" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "star_sessions",
      description:
        "Star/bookmark sessions for the user. Only call when user explicitly agrees. Requires session IDs from a prior search_sessions call.",
      parameters: {
        type: "object",
        properties: {
          session_ids: { type: "array", items: { type: "string" }, description: "Session IDs to star" },
        },
        required: ["session_ids"],
      },
    },
  },
];

function executeTool(name: string, input: any): any {
  if (name === "search_sessions") {
    if (input.query) {
      return db.prepare(
        `SELECT s.id, s.sport, s.event, s.venue, s.start_utc, s.medal
         FROM sessions_fts JOIN sessions s ON s.rowid=sessions_fts.rowid
         WHERE sessions_fts MATCH ? ORDER BY bm25(sessions_fts) LIMIT 10`
      ).all(input.query + "*");
    }
    const w: string[] = [], p: any[] = [];
    if (input.sport) { w.push("sport=?"); p.push(input.sport); }
    if (input.date) { w.push("substr(start_utc,1,10)=?"); p.push(input.date); }
    if (input.medal_only) w.push("medal=1");
    return db.prepare(
      `SELECT id, sport, event, venue, start_utc, medal FROM sessions
       ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY start_utc LIMIT 10`
    ).all(...p);
  }
  if (name === "star_sessions") {
    return { starred_ids: input.session_ids, action: "star" };
  }
  return { error: "unknown tool" };
}

// ---------- System prompt ----------

function buildSystem() {
  return `You are the LA28 Olympics Concierge — a friendly, knowledgeable guide to the 2028 Los Angeles Olympic Games (July 14–30, 2028).

Your job:
1. Help visitors discover events they'd enjoy by asking about interests
2. Recommend specific sessions with sport, date, time (Pacific), venue, medal status
3. Star sessions when user agrees (use star_sessions with session IDs from search results)
4. Answer questions about venues, schedules, travel tips between venues

Style: warm, concise, enthusiastic but not cheesy. Give 2-4 recommendations at a time.
Format recommendations clearly:
- **Sport** — Event
  📅 Day, Month Date · ⏰ Time PT · 📍 Venue · 🏅 Medal/Preliminary

CRITICAL: All times in the data are UTC. Convert to Pacific Time (subtract 7 hours). Display as "3:00 PM PT".

Use the schedule data below to answer DIRECTLY. Only call search_sessions when you need session IDs for starring or the summary can't answer.

${scheduleSummary || "Schedule not loaded yet — tell user to check back after data refresh."}

Start by warmly greeting and asking what excites them about the Olympics.`;
}

// ---------- Call OpenRouter ----------

function createClient(): OpenAI {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_KEY!,
    defaultHeaders: {
      "HTTP-Referer": "https://la28-dashboard.replit.app",
      "X-Title": "LA28 Olympics Dashboard",
    },
  });
}

async function callModel(
  client: OpenAI,
  model: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return client.chat.completions.create({
    model,
    max_tokens: MAX_TOKENS,
    messages,
    tools: TOOLS,
    tool_choice: "auto",
  });
}

// ---------- Main handler ----------

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  starred_ids?: string[];
};

export async function chat(
  messages: ChatMessage[],
  starredIds: string[],
  visitor: string | null
): Promise<{ reply: ChatMessage; budgetRemaining: number; disabled: boolean }> {
  // Rate limit.
  if (visitor && getHourlyCount(visitor) > 25) {
    return {
      reply: { role: "assistant", content: "You've been chatting a lot! Take a breather and try again shortly, or browse the schedule directly." },
      budgetRemaining: 0, disabled: false,
    };
  }

  const apiKey = process.env.OPENROUTER_KEY;
  if (!apiKey) {
    return {
      reply: { role: "assistant", content: "The AI concierge isn't configured yet.\n\n1. Go to openrouter.ai → sign in → Keys → Create Key\n2. Set: export OPENROUTER_KEY=\"sk-or-...\"\n3. Restart the dev server\n\nUse the quick-start buttons or browse the schedule in the meantime!" },
      budgetRemaining: 0, disabled: false,
    };
  }

  // Check cache.
  const ck = cacheKey(messages);
  const cached = getCached(ck);
  if (cached) {
    return { reply: { role: "assistant", content: cached }, budgetRemaining: 0, disabled: false };
  }

  const client = createClient();
  const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystem() },
    ...messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  // Try free models in order until one works.
  let model = FREE_MODELS[0];
  let response: OpenAI.Chat.Completions.ChatCompletion | null = null;
  for (const m of FREE_MODELS) {
    try {
      response = await callModel(client, m, apiMessages);
      model = m;
      break;
    } catch (e: any) {
      console.warn(`[chat] ${m} failed: ${e.message?.slice(0, 80)}`);
    }
  }
  if (!response) {
    return {
      reply: { role: "assistant", content: "All free AI models are busy right now. Try again in a moment, or browse the schedule directly!" },
      budgetRemaining: 0, disabled: false,
    };
  }

  logUsage(model, response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0, visitor);

  // Tool call loop (max 2 rounds).
  let starredByAI: string[] = [];
  let rounds = 0;
  while (response.choices[0]?.finish_reason === "tool_calls" && rounds < 2) {
    rounds++;
    const msg = response.choices[0].message;
    const toolCalls = msg.tool_calls ?? [];

    apiMessages.push(msg as any);

    for (const tc of toolCalls) {
      const fn = (tc as any).function;
      if (!fn) continue;
      let input: any = {};
      try { input = JSON.parse(fn.arguments); } catch { /* ignore */ }
      const result = executeTool(fn.name, input);
      if (fn.name === "star_sessions" && Array.isArray(input.session_ids)) {
        starredByAI.push(...input.session_ids);
      }
      apiMessages.push({
        role: "tool" as const,
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }

    try {
      response = await callModel(client, model, apiMessages);
      logUsage(model, response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0, visitor);
    } catch {
      break; // Don't retry tool loops on failure.
    }
  }

  const text = response.choices[0]?.message?.content || "Hmm, I couldn't generate a response. Try again!";

  if (starredByAI.length === 0) setCache(ck, text);

  return {
    reply: {
      role: "assistant",
      content: text,
      starred_ids: starredByAI.length > 0 ? starredByAI : undefined,
    },
    budgetRemaining: 0,
    disabled: false,
  };
}
