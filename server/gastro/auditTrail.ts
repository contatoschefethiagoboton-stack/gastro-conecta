// Rastreio de tudo o que é feito na plataforma: toda ação que altera dados
// (criar, editar, excluir, aceitar, pagar, entrar, sair…) e as consultas sensíveis
// (dados privados, contratos, listas, relatórios) ficam no histórico com quem fez,
// o quê, quando, de qual IP e o resultado. Senhas e conteúdo enviado nunca são gravados.
import type { Express, Request } from "express";
import { parse as parseCookieHeader } from "cookie";
import { dbConfigured, execute, query } from "./db";
import { GC_COOKIE, tokenHash } from "./auth";
import { clientIp } from "./http";

/** Estatísticas anônimas de visita e busca não entram no histórico. */
const SKIP = /^\/api\/gastro\/track\//;
const SENSITIVE_READ = /^\/api\/gastro\/(admin\/users\/\d+\/details|contracts\/\d+\/pdf|proposals\/\d+\/shopping-list\/pdf|report\/pdf|admin\/payments|admin\/staff|admin\/audit|media\/\d+)$/;

export function shouldTrack(method: string, path: string): boolean {
  if (SKIP.test(path)) return false;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) return path.startsWith("/api/");
  return method === "GET" && SENSITIVE_READ.test(path);
}

/** Nome legível da ação: "POST /api/gastro/proposals/12/accept" → "POST /proposals/12/accept". */
export const trailAction = (method: string, path: string) => `${method} ${path.replace(/^\/api\/gastro/, "") || "/"}`.slice(0, 120);

async function actorFrom(req: Request): Promise<number> {
  const token = parseCookieHeader(req.headers.cookie ?? "")[GC_COOKIE];
  if (!token) return 0;
  const rows = await query<any[]>("SELECT userId FROM gc_sessions WHERE tokenHash = ? LIMIT 1", [tokenHash(token)]);
  return Number(rows[0]?.userId ?? 0);
}

export function registerAuditTrail(app: Express) {
  app.use((req, res, next) => {
    const path = req.path;
    if (!dbConfigured() || !shouldTrack(req.method, path)) return next();
    const started = Date.now();
    // O ator é lido antes da rota (no logout a sessão deixa de existir).
    const actor = actorFrom(req).catch(() => 0);
    res.on("finish", () => {
      // Arquivos públicos (fotos do catálogo) não precisam de registro.
      if (path.startsWith("/api/gastro/media/") && res.getHeader("Cache-Control")?.toString().startsWith("public")) return;
      void actor.then(actorId => execute(
        "INSERT INTO gastro_audit_logs (action, details, actorId, targetId) VALUES (?, ?, ?, NULL)",
        [`http.${trailAction(req.method, path)}`.slice(0, 120), JSON.stringify({ status: res.statusCode, ip: clientIp(req), ms: Date.now() - started, agent: String(req.headers["user-agent"] ?? "").slice(0, 160) }), actorId],
      )).catch(() => { /* o histórico nunca derruba a requisição */ });
    });
    next();
  });
}
