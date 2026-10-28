import { dbConfigured, query } from "./db";
import { professionals as catalogProfessionals } from "../../shared/catalog";
import { getSiteContent } from "./content";

export type Professional = {
  id: string;
  name: string;
  type: "Chef particular" | "Buffet" | "Freelancer";
  category: string;
  city: string;
  description: string;
  image: string;
  price: number;
  tags: string[];
  featured: boolean;
  demo: boolean;
  gallery?: string[];
  socials?: Array<{ network: string; url: string }>;
  website?: string;
};

const mediaUrl = (id: unknown) => (Number(id) > 0 ? `/api/gastro/media/${Number(id)}` : "");
const NETWORK_LABELS: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn" };

/** Catálogo público: só dados públicos (nunca CPF, CNPJ, endereço completo, banco ou Pix). */
export async function loadProfessionals(): Promise<Professional[]> {
  const content = await getSiteContent();
  const demos = content["catalog.showDemo"] === "false" ? [] : (catalogProfessionals as Professional[]);
  if (!dbConfigured()) return demos;
  let rows: any[] = [];
  try {
    rows = await query<any[]>(`
      SELECT u.id, u.name, p.accountType, p.city, p.bio, p.specialty, p.featured, d.details
      FROM users u
      INNER JOIN account_profiles p ON p.userId = u.id
      INNER JOIN gc_profile_details d ON d.userId = u.id AND d.completedAt IS NOT NULL
      WHERE p.status = 'active' AND p.accountType IN ('provider', 'freelancer')
      ORDER BY p.featured DESC, u.name ASC, u.id ASC
    `);
  } catch {
    return demos;
  }
  const realProfessionals = rows.map(row => {
    let d: any = {};
    try { d = JSON.parse(row.details ?? "{}"); } catch { d = {}; }
    const isFreelancer = String(row.accountType) === "freelancer";
    const specialty = typeof row.specialty === "string" ? row.specialty.trim() : "";
    const type: Professional["type"] = isFreelancer ? "Freelancer" : d.category === "Buffet" ? "Buffet" : "Chef particular";
    const socials = d.socials && typeof d.socials === "object"
      ? Object.entries(d.socials as Record<string, string>).filter(([, url]) => typeof url === "string" && /^https?:\/\//.test(url)).map(([network, url]) => ({ network: NETWORK_LABELS[network] ?? network, url }))
      : [];
    const displayName = isFreelancer ? String(row.name ?? "") : String(d.tradeName || row.name || d.companyName || "");
    return {
      id: `user-${Number(row.id)}`,
      name: displayName || "Profissional GastroConecta",
      type,
      category: specialty || (isFreelancer ? "Freelancer" : "Gastronomia"),
      city: d.city && d.state ? `${d.city}, ${d.state}` : String(row.city ?? ""),
      description: String(row.bio ?? ""),
      image: mediaUrl(d.avatarMediaId),
      price: Number(d.priceFrom ?? 0) || 0,
      tags: isFreelancer ? (Array.isArray(d.roles) ? d.roles.slice(0, 4) : []) : specialty ? [specialty] : [],
      featured: Boolean(row.featured),
      demo: false,
      ...(Array.isArray(d.serviceMediaIds) ? { gallery: d.serviceMediaIds.map(mediaUrl).filter(Boolean) } : {}),
      ...(socials.length ? { socials } : {}),
      ...(typeof d.website === "string" && /^https?:\/\//.test(d.website) ? { website: d.website } : {}),
    } satisfies Professional;
  });
  return [...realProfessionals, ...demos];
}
