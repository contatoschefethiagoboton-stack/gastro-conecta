import { query } from "./db";
import { professionals as catalogProfessionals } from "../../shared/catalog";

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
};

export async function loadProfessionals(): Promise<Professional[]> {
  const rows = await query<any[]>(`
    SELECT u.id, u.name, p.accountType, p.city, p.bio, p.specialty, p.featured
    FROM users u
    INNER JOIN account_profiles p ON p.userId = u.id
    WHERE p.status = 'active' AND p.accountType IN ('provider', 'freelancer')
    ORDER BY p.featured DESC, u.name ASC, u.id ASC
  `);
  const realProfessionals = rows.map(row => {
    const accountType = String(row.accountType);
    const specialty = typeof row.specialty === "string" ? row.specialty.trim() : "";
    const isFreelancer = accountType === "freelancer";
    const isBuffet = !isFreelancer && /buffet/i.test(specialty);
    const category = specialty || (isFreelancer ? "Freelancer" : "Gastronomia");
    return {
      id: `user-${Number(row.id)}`,
      name: String(row.name ?? "Profissional GastroConecta"),
      type: isFreelancer ? "Freelancer" : isBuffet ? "Buffet" : "Chef particular",
      category,
      city: String(row.city ?? ""),
      description: String(row.bio ?? ""),
      image: "",
      price: 0,
      tags: specialty ? [specialty] : [],
      featured: Boolean(row.featured),
      demo: false,
    } satisfies Professional;
  });
  return [...(catalogProfessionals as Professional[]), ...realProfessionals];
}
