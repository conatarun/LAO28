import "dotenv/config";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { registerRoutes, seedVenues } from "./routes.js";
import { scheduleDailyRefresh } from "./ingest/cron.js";
import { runRefresh } from "./ingest/refresh.js";
import { db } from "./db.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const isProd = process.env.NODE_ENV === "production";

async function main() {
  const app = Fastify({ logger: { level: isProd ? "info" : "debug" } });

  await registerRoutes(app);
  await seedVenues();

  if (isProd) {
    const distDir = join(process.cwd(), "dist");
    if (existsSync(distDir)) {
      await app.register(fastifyStatic, { root: distDir, wildcard: false });
      app.setNotFoundHandler((req, reply) => {
        if (req.url.startsWith("/api/")) {
          reply.code(404).send({ error: "not found" });
          return;
        }
        reply.sendFile("index.html");
      });
    }
  }

  scheduleDailyRefresh();

  // Kick off a refresh at startup if DB is empty, so a fresh Replit container
  // has data quickly. Don't await — keep boot fast.
  const sessionsCount = (db.prepare("SELECT COUNT(*) c FROM sessions").get() as any).c;
  if (sessionsCount === 0) {
    runRefresh().then((r) => app.log.info({ r }, "startup refresh done"));
  }

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Listening on http://${HOST}:${PORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
