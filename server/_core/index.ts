import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerGastroRoutes } from "../gastro/routes";
import { registerExtraRoutes } from "../gastro/extra";
import { bootstrapDatabase, dbState } from "../gastro/bootstrap";
import { registerSubscriptionRoutes, startBillingScheduler } from "../gastro/subscriptions";
import { registerGrowthRoutes } from "../gastro/growth";
import { registerEngageRoutes } from "../gastro/engage";
import { registerPasswordRoutes } from "../gastro/password";
import { registerStaffRoutes } from "../gastro/staff";
import { registerAuditTrail } from "../gastro/auditTrail";
import { registerIndexingRoutes } from "../gastro/indexing";
import { registerSocialRoutes } from "../gastro/social";
import { registerSocialPostRoutes, startSocialScheduler } from "../gastro/socialPosts";
import { registerOwnerCopilotRoutes, startOwnerBriefScheduler } from "../gastro/ownerCopilot";
import { robotsTxt, sitemapXml } from "../publicSeo";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Render/proxies: usa o IP real do visitante e o protocolo https original.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  await bootstrapDatabase();
  // SEO: um único endereço oficial. Com GASTRO_PUBLIC_ORIGIN definido (ex.: https://eventosconecta.com.br),
  // visitas pelo endereço do Render ou pelo "www" são redirecionadas (301) para o domínio oficial.
  app.use((req, res, next) => {
    const origin = process.env.GASTRO_PUBLIC_ORIGIN?.trim();
    if (!origin || !/^https:\/\//.test(origin) || (req.method !== "GET" && req.method !== "HEAD") || req.path.startsWith("/api/")) return next();
    const official = new URL(origin).host;
    const host = String(req.headers.host ?? "").toLowerCase();
    if (host && host !== official && (host.endsWith(".onrender.com") || host === `www.${official}`)) return res.redirect(301, new URL(req.originalUrl, origin).href);
    next();
  });
  // Configure body parser with larger size limit for file uploads
  // O webhook da Meta precisa do corpo original para conferir a assinatura (X-Hub-Signature-256).
  app.use(express.json({ limit: "50mb", verify: (req, _res, buf) => { if (req.url?.startsWith("/api/gastro/webhooks/meta")) (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buf); } }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Histórico de tudo o que é feito na plataforma (antes de qualquer rota da API).
  registerAuditTrail(app);
  app.get("/api/health", (_req, res) => res.json({ status: "ok", database: process.env.DATABASE_URL ? (dbState.ready ? "ok" : "error") : "missing" }));
  app.get("/robots.txt", (_req, res) => { res.set("Cache-Control", "public, max-age=3600").type("text/plain").send(robotsTxt()); });
  app.get("/sitemap.xml", async (_req, res) => {
    try { res.set("Cache-Control", "public, max-age=3600").type("application/xml").send(await sitemapXml()); }
    catch { res.status(500).type("text/plain").send("sitemap indisponível"); }
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  if (process.env.MANUS_OAUTH_API_URL) registerOAuthRoutes(app);
  // REST contract must be mounted before Vite's catch-all/static handling.
  // Webhook do Mercado Pago (sem cabeçalho Origin) precisa vir antes das rotas com proteção CSRF.
  // Webhooks sem cabeçalho Origin (Meta) vêm antes das rotas com proteção CSRF.
  registerSocialRoutes(app);
  registerSubscriptionRoutes(app);
  registerPasswordRoutes(app);
  registerStaffRoutes(app);
  registerIndexingRoutes(app);
  registerSocialPostRoutes(app);
  registerOwnerCopilotRoutes(app);
  registerExtraRoutes(app);
  registerGrowthRoutes(app);
  registerEngageRoutes(app);
  registerGastroRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
  startBillingScheduler();
  startSocialScheduler();
  startOwnerBriefScheduler();
}

startServer().catch(error => { console.error(error); process.exit(1); });
