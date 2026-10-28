import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "@shared/_core/errors";

export function wrap(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => handler(req, res).catch(next);
}

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, result.error.issues.map(issue => `${issue.path.join(".") || "dados"}: ${issue.message}`).join("; "));
  return result.data;
}

export function body<T>(req: Request, schema: z.ZodType<T>): T {
  return parse(schema, req.body);
}

/** Mutações do navegador precisam vir do mesmo host (proteção CSRF). */
export function assertOrigin(req: Request) {
  const origin = req.headers.origin;
  if (!origin) {
    if (req.headers["x-gastro-cli"] === "1") return;
    throw new HttpError(403, "Origem não permitida");
  }
  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") throw new HttpError(403, "Origem não permitida");
    const requestHost = req.get("host")?.trim().toLowerCase();
    const forwarded = req.headers["x-forwarded-host"];
    const trustedForwardedHost = typeof forwarded === "string" && !forwarded.includes(",") ? forwarded.trim().toLowerCase() : "";
    const allowedHosts = [requestHost, trustedForwardedHost].filter((host): host is string => Boolean(host));
    if (!allowedHosts.includes(originUrl.host.toLowerCase())) throw new HttpError(403, "Origem não permitida");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(403, "Origem não permitida");
  }
}

const buckets = new Map<string, { count: number; resetAt: number }>();
/** Limite simples em memória: `max` tentativas por janela. */
export function limit(key: string, max: number, windowMs: number, message = "Muitas tentativas; tente novamente mais tarde") {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return;
  }
  if (current.count >= max) throw new HttpError(429, message);
  current.count += 1;
}

export const clientIp = (req: Request) => req.ip || req.socket.remoteAddress || "unknown";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  const isPayloadTooLarge = typeof error === "object" && error !== null && (error as { type?: string }).type === "entity.too.large";
  const status = error instanceof HttpError ? error.statusCode : isPayloadTooLarge ? 413 : 500;
  const message = error instanceof HttpError ? error.message : isPayloadTooLarge ? "Arquivo grande demais" : "Erro interno";
  if (status === 500) console.error("[Gastro] request failed", error instanceof Error ? error.message : "unknown error");
  res.status(status).json({ error: message });
}
