// Origem das visitas e cadastros (marketing). O site guarda a primeira origem do visitante
// (parâmetros utm_*, gclid/fbclid ou o site de onde veio) e envia junto da visita e do cadastro.

export type Channel = 'google' | 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'whatsapp' | 'indicacao' | 'direto' | 'outros';
export type Medium = 'pago' | 'organico' | 'indicacao' | 'direto';

export const CHANNEL_LABELS: Record<Channel, string> = {
  google: 'Google', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', whatsapp: 'WhatsApp',
  indicacao: 'Indicação (fornecedores e clientes)', direto: 'Direto (digitou o endereço)', outros: 'Outros sites',
};
export const MEDIUM_LABELS: Record<Medium, string> = { pago: 'Anúncio / link patrocinado', organico: 'Orgânico', indicacao: 'Indicação', direto: 'Direto' };

export type Attribution = { source: Channel; medium: Medium; campaign?: string; ref?: string };

const PAID = /^(cpc|ppc|paid|ads?|paid[_-]?social|display|sponsored|patrocinado|anuncio)$/i;

/** Classifica a origem a partir dos parâmetros da URL e do site anterior (document.referrer). */
export function classifySource(input: { utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null; gclid?: boolean; fbclid?: boolean; referrer?: string | null; ref?: string | null; ownHost?: string }): Attribution {
  const src = String(input.utmSource ?? '').toLowerCase();
  const med = String(input.utmMedium ?? '').toLowerCase();
  const campaign = input.utmCampaign ? String(input.utmCampaign).slice(0, 120) : undefined;
  const ref = input.ref ? String(input.ref).slice(0, 20) : undefined;
  let host = '';
  try { host = input.referrer ? new URL(input.referrer).hostname.toLowerCase() : ''; } catch { host = ''; }
  if (host && input.ownHost && host.endsWith(input.ownHost.toLowerCase())) host = '';
  const pick = (text: string): Channel | null => {
    if (/google|gclid|youtube\.com\/ads/.test(text)) return 'google';
    if (/instagram|^ig$|l\.instagram/.test(text)) return 'instagram';
    if (/facebook|^fb$|meta|fbclid|l\.facebook|m\.facebook/.test(text)) return 'facebook';
    if (/tiktok/.test(text)) return 'tiktok';
    if (/youtube|youtu\.be/.test(text)) return 'youtube';
    if (/whats|wa\.me/.test(text)) return 'whatsapp';
    if (/indica|fornecedor|cliente|referral|parceiro/.test(text)) return 'indicacao';
    return null;
  };
  let source: Channel | null = pick(src) ?? (input.gclid ? 'google' : input.fbclid ? 'facebook' : null) ?? (host ? pick(host) : null);
  if (!source && ref) source = 'indicacao';
  if (!source) source = src ? 'outros' : host ? 'outros' : 'direto';
  let medium: Medium;
  if (PAID.test(med) || input.gclid || (input.fbclid && PAID.test(med))) medium = 'pago';
  else if (source === 'indicacao' || /indica|referral/.test(med)) medium = 'indicacao';
  else if (source === 'direto') medium = 'direto';
  else medium = 'organico';
  return { source, medium, ...(campaign ? { campaign } : {}), ...(ref ? { ref } : {}) };
}

export const isChannel = (v: unknown): v is Channel => typeof v === 'string' && v in CHANNEL_LABELS;
export const isMedium = (v: unknown): v is Medium => typeof v === 'string' && v in MEDIUM_LABELS;
