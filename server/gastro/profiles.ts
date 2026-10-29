import { query } from "./db";

export const PROVIDER_SCHEMA_VERSION = 2;

export async function loadDetails(userId: number): Promise<{ details: any; completedAt: string | null }> {
  const rows = await query<any[]>("SELECT details, completedAt FROM gc_profile_details WHERE userId = ? LIMIT 1", [userId]);
  if (!rows[0]) return { details: null, completedAt: null };
  let details: any = null;
  try { details = JSON.parse(rows[0].details); } catch { details = null; }
  return { details, completedAt: rows[0].completedAt ? new Date(rows[0].completedAt).toISOString() : null };
}

/** Cadastro do profissional no formato atual (logo, rosto, fotos, documento, banco/Pix). */
export function providerDetailsComplete(details: any, completedAt: string | null): boolean {
  return Boolean(completedAt && details && details.schemaVersion === PROVIDER_SCHEMA_VERSION);
}

/** Dados do cliente exigidos no contrato (CPF, endereço, telefone e foto do rosto). */
export function clientContractDataComplete(details: any): boolean {
  return Boolean(details && details.kind === "client" && details.cpf && details.phone && details.cep && details.street && details.city && details.faceMediaId);
}

export const waLink = (phoneDigits: string | undefined, message: string) => {
  const digits = String(phoneDigits ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const full = digits.startsWith("55") && digits.length > 11 ? digits : `55${digits}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(message.slice(0, 600))}`;
};
