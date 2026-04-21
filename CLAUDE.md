# LA28 Olympics Dashboard

## Overview
A fluid, responsive web dashboard for the 2028 Los Angeles Olympic Games schedule. Parses official la28.org PDFs daily, makes 793+ sessions searchable/filterable/visualizable with an interactive venue map and AI concierge.

## Stack
- **Client:** Vite + React 18 + TypeScript + Tailwind CSS + MapLibre GL
- **Server:** Fastify 4 + better-sqlite3 (WAL mode) + node-cron
- **AI Chat:** OpenRouter (free tier: Llama 3.3 70B, Nvidia Nemotron, Gemma) with fallback chain
- **Voice:** Browser Web Speech API (free, client-side)
- **Push:** Web Push with VAPID keys (auto-generated, stored in meta table)
- **Deploy target:** Replit Reserved VM

## Running
```bash
npm install
npm run dev          # server :3000 + client :5173 (proxy /api → server)
npm run build        # vite build → dist/
npm start            # production (serves dist/ via Fastify)
npm run ingest:now   # manual PDF ingest
npm run typecheck    # type check all code
```

## Environment Variables (.env, auto-loaded via dotenv)
```
OPENROUTER_KEY=sk-or-...     # Required for AI chat (free from openrouter.ai)
VAPID_PUBLIC_KEY=             # Optional (auto-generated on first boot)
VAPID_PRIVATE_KEY=            # Optional (auto-generated on first boot)
VAPID_SUBJECT=mailto:tarun@conalabs.com
```

## Architecture

### Data Pipeline
1. Daily cron (07:00 UTC) or startup → `server/src/ingest/refresh.ts`
2. Fetches la28.org HTML → regex-extracts PDF URLs → downloads PDFs
3. Parses "By Event" PDF (richest structure) → 793 sessions across 58 sports, 47 venues
4. Inserts to SQLite with FTS5 index → diffs against snapshot → fans out push notifications
5. The PDF parser is heuristic (`server/src/ingest/parse.ts`): keyed on session codes (`[A-Z]{2,4}\d{2,5}`) + date patterns, handles both Pacific and Central time zones

### Identity
Anonymous per-browser. No sign-in. Push subscription = identity for follows/notifications. Stars use localStorage (client-only).

### AI Concierge
- Pre-stuffed schedule summary in system prompt (~2K tokens) handles 80%+ of queries without tool calls
- Tools: `search_sessions` (read-only, 10 results max), `star_sessions` (client-side star)
- Max 2 tool rounds per message
- Response cache: 1hr TTL in SQLite `chat_cache`
- Rate limit: 25 messages/IP/hour
- Free models rotate: tries each in order until one responds

### Key Files
```
server/src/index.ts          → App bootstrap, dotenv, static serving
server/src/routes.ts         → All API endpoints (~400 LOC)
server/src/db.ts             → SQLite schema (9 tables + FTS5)
server/src/chat.ts           → LLM routing, tools, budget tracking
server/src/ingest/parse.ts   → PDF parser (heuristic, zone-aware)
server/src/ingest/refresh.ts → Orchestrator: fetch→parse→diff→notify
server/src/notify.ts         → Change detection + push fan-out
server/src/push.ts           → VAPID Web Push
client/src/App.tsx            → Router, nav, status polling
client/src/components/Concierge.tsx → Chat UI + voice input
client/src/starred.ts         → localStorage star management
client/src/push.ts            → Browser push subscription
server/data/venue-coords.json → 46 venue lat/lng/city
```

## Conventions
- TypeScript strict mode, ESM throughout
- No accounts/auth — anonymous per-browser model
- Tools given to LLMs are read-only; writes happen client-side
- Tailwind utility classes; `font-display` = Space Grotesk for headings
- Fluid typography via CSS `clamp()`
- Icons: emoji-in-gradient-tile (`SportIcon.tsx`), not SVG paths
- Large UI: 48-64px icons, full-width layouts (max-w-screen-2xl)

## Decisions (do not revisit without explicit user request)
- No social media integration (scrapped)
- No self-hosted LLM (Replit RAM insufficient; use free APIs)
- No email notifications yet (Web Push first, email deferred)
- No user accounts (anonymous identity via push subscription + localStorage)
- PDF is the single source of truth for schedule data
