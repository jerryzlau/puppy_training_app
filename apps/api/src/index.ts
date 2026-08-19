import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { householdRoutes } from "./routes/households.js";
import { inviteRoutes } from "./routes/invites.js";
import { entryRoutes } from "./routes/entries.js";
import { progressRoutes } from "./routes/progress.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: (origin, cb) => {
    // allow same-origin/no-origin (curl, health checks) and configured app origins
    if (!origin || env.appOrigins.includes(origin) || /\.vercel\.app$/.test(new URL(origin).hostname)) {
      cb(null, true);
    } else {
      cb(new Error("origin not allowed"), false);
    }
  },
  credentials: true,
});

app.get("/healthz", async () => ({ ok: true, service: "biru-api" }));

householdRoutes(app);
inviteRoutes(app);
entryRoutes(app);
progressRoutes(app);

app
  .listen({ port: env.port, host: "0.0.0.0" })
  .then(() => app.log.info(`biru-api listening on :${env.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
