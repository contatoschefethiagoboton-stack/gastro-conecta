import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { ENV } from "../_core/env";

let pool: Pool | null = null;

/** Banco configurado? (DATABASE_URL presente) */
export function dbConfigured(): boolean {
  return Boolean(ENV.databaseUrl);
}

type SslOption = { rejectUnauthorized: boolean; minVersion: "TLSv1.2"; ca?: string } | undefined;

/**
 * Lê DATABASE_URL (mysql://usuario:senha@host:porta/banco?ssl=true) e monta a
 * configuração do mysql2. SSL é ligado automaticamente para provedores na nuvem
 * (TiDB Cloud, Aiven, PlanetScale, Railway…) ou quando a URL/variável pede.
 *   DATABASE_SSL=off        desliga SSL
 *   DATABASE_SSL=require    SSL sem validar certificado (Aiven sem CA)
 *   DATABASE_SSL=verify     SSL validando certificado
 *   DATABASE_SSL_CA=...     certificado CA em texto (opcional)
 */
export function buildMysqlConfig(rawUrl: string, env: NodeJS.ProcessEnv = process.env) {
  const url = new URL(rawUrl.trim());
  if (url.protocol !== "mysql:" && url.protocol !== "mysql2:") throw new Error("DATABASE_URL deve começar com mysql://");
  const params = url.searchParams;
  const flag = (env.DATABASE_SSL || params.get("ssl") || params.get("sslmode") || params.get("ssl-mode") || "").toString().toLowerCase();
  const host = url.hostname;
  const cloudVerify = /tidbcloud\.com$|psdb\.cloud$|planetscale/i.test(host);
  const cloudRequire = /aivencloud\.com$|rlwy\.net$|railway|azure|amazonaws\.com$|digitalocean/i.test(host);
  const ca = env.DATABASE_SSL_CA?.replace(/\\n/g, "\n") || undefined;
  let ssl: SslOption;
  if (["off", "false", "0", "disable", "disabled"].includes(flag)) ssl = undefined;
  else if (["verify", "verify_identity", "verify-full", "verify_ca", "verify-ca"].includes(flag) || (cloudVerify && !flag) || (ca && !flag)) ssl = { rejectUnauthorized: true, minVersion: "TLSv1.2", ...(ca ? { ca } : {}) };
  else if (["require", "required", "true", "1", "on", "{\"rejectunauthorized\":true}"].includes(flag) || (cloudRequire && !flag)) ssl = { rejectUnauthorized: Boolean(ca), minVersion: "TLSv1.2", ...(ca ? { ca } : {}) };
  return {
    host,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")) || undefined,
    ...(ssl ? { ssl } : {}),
  };
}

export function getGastroPool(): Pool {
  if (!pool) {
    if (!ENV.databaseUrl) throw new Error("DATABASE_URL is not configured");
    pool = mysql.createPool({
      ...buildMysqlConfig(ENV.databaseUrl),
      waitForConnections: true,
      connectionLimit: Number(process.env.DATABASE_POOL_SIZE || 8),
      enableKeepAlive: true,
      decimalNumbers: true,
      timezone: "Z",
      charset: "utf8mb4",
    });
  }
  return pool;
}

export async function query<T extends RowDataPacket[] = RowDataPacket[]>(sql: string, params: unknown[] = []): Promise<T> {
  const [rows] = await getGastroPool().execute<T>(sql, params);
  return rows;
}

export async function execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await getGastroPool().execute<ResultSetHeader>(sql, params);
  return result;
}

export async function withTransaction<T>(fn: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getGastroPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export type DbConnection = PoolConnection;
