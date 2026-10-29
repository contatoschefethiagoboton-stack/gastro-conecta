import { dbConfigured, query } from "./db";
import { professionals as catalogProfessionals, type Professional } from "../../shared/catalog";
import { serviceById } from "../../shared/services";
import { getSiteContent } from "./content";
import { PROVIDER_SCHEMA_VERSION } from "./profiles";
import { VISIBLE_SUBSCRIPTION_SQL } from "./subscriptions";
import { isTopRated } from "./rules";

export type { Professional };

const mediaUrl = (id: unknown) => (Number(id) > 0 ? `/api/gastro/media/${Number(id)}` : "");
const NETWORK_LABELS: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn" };

/**
 * Catálogo público: só profissionais aprovados, com cadastro completo e assinatura em dia.
 * Nunca expõe CPF, CNPJ, endereço completo, foto do rosto, banco ou Pix.
 */
export async function loadProfessionals(): Promise<Professional[]> {
  const content = await getSiteContent();
  const demos = content["catalog.showDemo"] === "false" ? [] : catalogProfessionals;
  if (!dbConfigured()) return demos;
  let rows: any[] = [];
  try {
    rows = await query<any[]>(`
      SELECT u.id, u.name, p.city, p.bio, p.specialty, p.featured, d.details,
        (SELECT AVG(r.rating) FROM gastro_reviews r WHERE r.targetId = u.id) ratingAverage,
        (SELECT COUNT(*) FROM gastro_reviews r WHERE r.targetId = u.id) ratingCount
      FROM users u
      INNER JOIN account_profiles p ON p.userId = u.id
      INNER JOIN gc_profile_details d ON d.userId = u.id AND d.completedAt IS NOT NULL
      WHERE p.status = 'active' AND p.accountType = 'provider' AND ${VISIBLE_SUBSCRIPTION_SQL}
      ORDER BY p.featured DESC, u.name ASC, u.id ASC
    `);
  } catch {
    return demos;
  }
  const real = rows.flatMap(row => {
    let d: any = {};
    try { d = JSON.parse(row.details ?? "{}"); } catch { d = {}; }
    if (d.schemaVersion !== PROVIDER_SCHEMA_VERSION) return [];
    const services = (Array.isArray(d.services) ? d.services : []).map((id: string) => serviceById(id)).filter(Boolean);
    const specialty = typeof row.specialty === "string" ? row.specialty.trim() : "";
    const socials = d.socials && typeof d.socials === "object"
      ? Object.entries(d.socials as Record<string, string>).filter(([, url]) => typeof url === "string" && /^https?:\/\//.test(url)).map(([network, url]) => ({ network: NETWORK_LABELS[network] ?? network, url }))
      : [];
    const average = Math.round(Number(row.ratingAverage ?? 0) * 10) / 10;
    const count = Number(row.ratingCount ?? 0);
    const professional: Professional = {
      id: `user-${Number(row.id)}`,
      name: String(d.tradeName || (d.documentType === "cnpj" ? d.companyName : "") || row.name || "Profissional GastroConecta"),
      type: services[0]?.group ?? "Gastronomia",
      category: specialty || services[0]?.label || "Profissional",
      city: d.city && d.state ? `${d.city}, ${d.state}` : String(row.city ?? ""),
      description: String(row.bio ?? ""),
      image: mediaUrl(d.avatarMediaId),
      price: Number(d.priceFrom ?? 0) || 0,
      tags: services.slice(0, 4).map((s: any) => s.label),
      services: services.map((s: any) => s.label),
      featured: Boolean(row.featured),
      demo: false,
      rating: { average, count },
      topRated: isTopRated(average, count),
      ...(Array.isArray(d.serviceMediaIds) ? { gallery: d.serviceMediaIds.map(mediaUrl).filter(Boolean) } : {}),
      ...(socials.length ? { socials } : {}),
      ...(typeof d.website === "string" && /^https?:\/\//.test(d.website) ? { website: d.website } : {}),
    };
    return [professional];
  });
  // Destaque e "Top Rated" primeiro.
  real.sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.topRated) - Number(a.topRated) || (b.rating?.average ?? 0) - (a.rating?.average ?? 0));
  return [...real, ...demos];
}
