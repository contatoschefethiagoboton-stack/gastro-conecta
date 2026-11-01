/**
 * Taxonomia única da plataforma. Deve espelhar os ENUMs do SQL (001_init.sql).
 * O front-end consome GET /taxonomy — nenhuma lista fica duplicada no cliente.
 */
import type { FastifyInstance } from 'fastify';

export const CATEGORIES = ['acompanhante', 'massagem'] as const;
export const GENDERS = ['feminino', 'masculino', 'trans'] as const;
export const MASSAGE_TYPES = ['terapeutica', 'sensorial', 'tantrica', 'tailandesa', 'relaxante', 'corpo_a_corpo', 'prostatica'] as const;
export const ORIENTATIONS = ['hetero', 'bissexual', 'gay', 'trans'] as const;
export const AUDIENCES = ['homens', 'mulheres', 'casais', 'pcd'] as const;
export const SERVICES = ['final_feliz', 'masturbacao', 'sexo_oral', 'penetracao', 'depilacao', 'estetica', 'reflexologia_podal'] as const;
export const SERVICE_LOCATIONS = ['domicilio', 'hotel', 'motel', 'local_proprio'] as const;
export const AMENITIES = ['ducha', 'maca', 'tatame', 'futon', 'oleos', 'velas', 'musica', 'descartaveis'] as const;
export const ACCEPTED_PAYMENTS = ['dinheiro', 'pix', 'cartao', 'paypal'] as const;
export const AGE_RANGE = { min: 18, max: 60 } as const;
export const RADIUS_KM = { min: 1, max: 200, default: 10 } as const;

export const LABELS: Record<string, string> = {
  acompanhante: 'Acompanhantes', massagem: 'Massagens',
  feminino: 'Feminino', masculino: 'Masculino', trans: 'Trans',
  terapeutica: 'Terapêutica', sensorial: 'Sensorial', tantrica: 'Tântrica', tailandesa: 'Tailandesa',
  relaxante: 'Relaxante', corpo_a_corpo: 'Corpo a corpo', prostatica: 'Prostática',
  hetero: 'Hétero', bissexual: 'Bissexual', gay: 'Gay',
  homens: 'Homens', mulheres: 'Mulheres', casais: 'Casais', pcd: 'PCD',
  final_feliz: 'Final feliz', masturbacao: 'Masturbação', sexo_oral: 'Sexo oral', penetracao: 'Penetração',
  depilacao: 'Depilação', estetica: 'Estética', reflexologia_podal: 'Reflexologia podal',
  domicilio: 'A domicílio', hotel: 'Hotel', motel: 'Motel', local_proprio: 'Local próprio',
  ducha: 'Ducha', maca: 'Maca', tatame: 'Tatame', futon: 'Futon', oleos: 'Óleos', velas: 'Velas',
  musica: 'Música', descartaveis: 'Materiais descartáveis',
  dinheiro: 'Dinheiro', pix: 'PIX', cartao: 'Cartão', paypal: 'PayPal',
};

export async function taxonomyRoutes(app: FastifyInstance) {
  app.get('/taxonomy', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=3600');
    const group = (values: readonly string[]) => values.map((v) => ({ value: v, label: LABELS[v] ?? v }));
    return {
      categories: group(CATEGORIES),
      genders: group(GENDERS),
      massageTypes: group(MASSAGE_TYPES),
      orientations: group(ORIENTATIONS),
      audiences: group(AUDIENCES),
      services: group(SERVICES),
      serviceLocations: group(SERVICE_LOCATIONS),
      amenities: group(AMENITIES),
      acceptedPayments: group(ACCEPTED_PAYMENTS),
      ageRange: AGE_RANGE,
      radiusKm: RADIUS_KM,
    };
  });
}
