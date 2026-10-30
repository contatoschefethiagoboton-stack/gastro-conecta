import { contentDefaults, mergeContent, type SiteContent } from "@shared/content";
import { serviceCatalogFrom, type ServiceCategory } from "@shared/services";
import { dbConfigured, query } from "./db";

let cache: { at: number; value: SiteContent } | null = null;
const TTL_MS = 15_000;

/** Conteúdo do site: padrões + o que o administrador salvou. Nunca falha. */
export async function getSiteContent(): Promise<SiteContent> {
  if (!dbConfigured()) return { ...contentDefaults };
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const rows = await query<any[]>("SELECT `key`, `value` FROM gc_site_content");
    const saved: Record<string, string> = {};
    for (const row of rows) saved[String(row.key)] = String(row.value ?? "");
    cache = { at: Date.now(), value: mergeContent(saved) };
    return cache.value;
  } catch {
    return { ...contentDefaults };
  }
}

/** Catálogo de serviços atual (editável no painel). */
export async function getServiceCatalog(): Promise<ServiceCategory[]> {
  return serviceCatalogFrom(await getSiteContent());
}

export function invalidateSiteContent() {
  cache = null;
}

export async function getInternalFlag(key: string): Promise<string | null> {
  const rows = await query<any[]>("SELECT `value` FROM gc_site_content WHERE `key` = ? LIMIT 1", [`internal.${key}`]);
  return rows[0] ? String(rows[0].value) : null;
}

export async function setInternalFlag(key: string, value: string) {
  await query("INSERT INTO gc_site_content (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)", [`internal.${key}`, value]);
}
