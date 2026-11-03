// Criação automática de serviço: a partir só do nome digitado no painel
// (ex.: "Confeitaria"), monta a categoria com frase do card, ícone, forma de
// calcular o valor e as profissões derivadas da área.
import { slugify, type RequestCategory, type ServiceCategory, type ServiceIcon } from './services';

export type ServiceArea = {
  /** Começos de palavra (sem acento) que identificam a área. */
  keywords: string[];
  icon: ServiceIcon;
  calculator: RequestCategory;
  subtitle: string;
  services: string[];
};

// A ordem desempata: áreas mais específicas primeiro.
export const SERVICE_AREAS: ServiceArea[] = [
  { keywords: ['confeit', 'doce', 'docinho', 'bolo', 'sobremesa', 'brigadeir', 'cake', 'cupcake', 'macaron'], icon: 'cake', calculator: 'event', subtitle: 'Bolos, doces finos e mesas de sobremesa', services: ['Confeiteiro(a)', 'Bolo personalizado', 'Doces finos', 'Mesa de sobremesas'] },
  { keywords: ['churras', 'assad', 'parrill', 'grelh', 'brasa', 'costela', 'fogo de chao'], icon: 'flame', calculator: 'event', subtitle: 'Churrasqueiros e assadores para o seu evento', services: ['Churrasqueiro', 'Assador / parrillero', 'Auxiliar de churrasco'] },
  { keywords: ['pizza', 'pizzaiol'], icon: 'pizza', calculator: 'event', subtitle: 'Pizzaiolo e rodízio de pizza em casa', services: ['Pizzaiolo', 'Rodízio de pizza para festas'] },
  { keywords: ['sushi', 'japones', 'temaki', 'oriental'], icon: 'fish', calculator: 'event', subtitle: 'Sushiman e culinária japonesa para eventos', services: ['Sushiman', 'Temakeria para eventos'] },
  { keywords: ['salgad', 'lanche', 'coxinha', 'sanduich', 'hamburg', 'burger', 'crepe', 'pastel', 'finger', 'canape', 'petisc', 'hot dog', 'cachorro quente', 'tapioca'], icon: 'sandwich', calculator: 'event', subtitle: 'Salgados, lanches e finger food', services: ['Salgadeiro(a)', 'Hamburgueria para eventos', 'Crepe e pastel para festas', 'Finger food'] },
  { keywords: ['sorvet', 'gelato', 'acai', 'picole', 'paleta'], icon: 'ice', calculator: 'event', subtitle: 'Sorvete, açaí e gelato para festas', services: ['Carrinho de sorvete', 'Açaí para festas', 'Gelato artesanal'] },
  { keywords: ['cafe', 'barista', 'coffee', 'cafeter'], icon: 'coffee', calculator: 'event', subtitle: 'Barista e coffee break para eventos', services: ['Barista', 'Coffee break'] },
  { keywords: ['vinho', 'sommel', 'enolog', 'harmoniz'], icon: 'wine', calculator: 'event', subtitle: 'Vinhos, sommelier e harmonização', services: ['Sommelier', 'Degustação de vinhos'] },
  { keywords: ['cerve', 'chopp', 'chope', 'choperia', 'bebida', 'mixolog', 'drink', 'open bar'], icon: 'beer', calculator: 'event', subtitle: 'Chopp, drinks e bebidas para o seu evento', services: ['Chopp e chopeira', 'Bartender / mixologista', 'Open bar'] },
  { keywords: ['garcom', 'garcon', 'barman', 'bartend', 'salao', 'copeir', 'maitre'], icon: 'wine', calculator: 'event', subtitle: 'Garçons, barmans e equipe de salão', services: ['Garçom / garçonete', 'Barman', 'Copeiro(a)', 'Maître'] },
  { keywords: ['marmit', 'personal chef', 'fit', 'dieta', 'low carb', 'congelad', 'nutri'], icon: 'pot', calculator: 'mealPrep', subtitle: 'Marmitas semanais, fit e congelados', services: ['Marmitas fit', 'Congelados personalizados', 'Cozinheiro(a) de marmitas'] },
  { keywords: ['aula', 'curso', 'workshop', 'oficina', 'mentoria'], icon: 'graduation', calculator: 'event', subtitle: 'Aulas e workshops de culinária', services: ['Aula de culinária', 'Workshop gastronômico', 'Consultoria gastronômica'] },
  { keywords: ['chef', 'cozinh', 'gastronom', 'culinar', 'buffet', 'banquet', 'jantar', 'comida'], icon: 'chef', calculator: 'event', subtitle: 'Chefs, cozinheiros e buffet para o seu evento', services: ['Chef de cozinha', 'Cozinheiro(a)', 'Auxiliar de cozinha', 'Buffet'] },
  { keywords: ['foto', 'fotograf', 'filmag', 'video', 'drone', 'audiovisual', 'cinegraf'], icon: 'camera', calculator: 'event', subtitle: 'Fotos e vídeos do seu evento', services: ['Fotógrafo(a)', 'Filmagem / videomaker', 'Fotos e vídeos com drone'] },
  { keywords: ['music', 'dj', 'banda', 'cantor', 'cantora', 'som', 'sonoriz', 'violin', 'sax', 'pianist', 'voz e violao', 'karaoke'], icon: 'music', calculator: 'event', subtitle: 'DJ, banda e música ao vivo', services: ['DJ', 'Banda', 'Músico / voz e violão', 'Som e sonorização'] },
  { keywords: ['ilumin', 'led', 'telao', 'projec', 'painel de led'], icon: 'lightbulb', calculator: 'event', subtitle: 'Iluminação, telão e efeitos', services: ['Iluminação para eventos', 'Telão e projeção'] },
  { keywords: ['decor', 'flor', 'florist', 'arranjo', 'balao', 'baloes', 'cenograf', 'paisagem de festa'], icon: 'flower', calculator: 'event', subtitle: 'Decoração, flores e balões', services: ['Decorador(a)', 'Florista', 'Decoração com balões'] },
  { keywords: ['recrea', 'infantil', 'crianca', 'animador', 'animacao', 'palhac', 'monitor', 'kids', 'brinquedist'], icon: 'party', calculator: 'event', subtitle: 'Recreação e animação para festas infantis', services: ['Recreador(a)', 'Animador(a) de festa', 'Monitor infantil'] },
  { keywords: ['baba', 'cuidador', 'cuidadora', 'nanny'], icon: 'baby', calculator: 'event', subtitle: 'Babás e cuidadores, também para eventos', services: ['Babá', 'Babá para eventos', 'Cuidador(a)'] },
  { keywords: ['cerimon', 'assessor', 'organizac', 'organizador', 'planner', 'wedding', 'produtor', 'producao de evento'], icon: 'clipboard', calculator: 'event', subtitle: 'Cerimonial, assessoria e organização de eventos', services: ['Cerimonialista', 'Assessor(a) de eventos', 'Produtor(a) de eventos'] },
  { keywords: ['recepc', 'hostess', 'promotor', 'promotora', 'credenciam'], icon: 'users', calculator: 'event', subtitle: 'Recepção e atendimento de convidados', services: ['Recepcionista', 'Hostess', 'Promotor(a) de eventos'] },
  { keywords: ['seguran', 'vigil', 'porteir', 'controle de acesso', 'brigadist'], icon: 'shield', calculator: 'event', subtitle: 'Segurança e controle de acesso', services: ['Segurança', 'Controlador(a) de acesso', 'Brigadista'] },
  { keywords: ['manobr', 'valet', 'estacion'], icon: 'car', calculator: 'event', subtitle: 'Manobristas e estacionamento', services: ['Manobrista (valet)'] },
  { keywords: ['motorist', 'van', 'transfer', 'onibus', 'transporte de convid', 'chofer'], icon: 'bus', calculator: 'event', subtitle: 'Transporte de convidados', services: ['Motorista', 'Van para convidados'] },
  { keywords: ['food truck', 'foodtruck', 'truck', 'entrega', 'delivery', 'frete'], icon: 'truck', calculator: 'event', subtitle: 'Food trucks e entregas', services: ['Food truck', 'Entregador(a)'] },
  { keywords: ['locac', 'aluguel', 'alugue', 'tenda', 'mesa', 'cadeira', 'toalha', 'estrutura', 'palco', 'brinquedo', 'pula pula', 'inflav'], icon: 'tent', calculator: 'event', subtitle: 'Mesas, cadeiras, tendas e brinquedos', services: ['Locação de mesas e cadeiras', 'Tendas e coberturas', 'Brinquedos para festa'] },
  { keywords: ['maqui', 'make', 'cabel', 'penteado', 'beleza', 'manicure', 'estetic', 'barbeir', 'noiva'], icon: 'brush', calculator: 'event', subtitle: 'Maquiagem e cabelo para o grande dia', services: ['Maquiador(a)', 'Cabeleireiro(a)', 'Manicure'] },
  { keywords: ['apresentad', 'mestre de cerim', 'locutor', 'mc', 'stand up', 'humorist'], icon: 'mic', calculator: 'event', subtitle: 'Apresentadores e mestres de cerimônia', services: ['Mestre de cerimônias', 'Apresentador(a)', 'Locutor(a)'] },
  { keywords: ['lavand', 'passad', 'roupa', 'engom'], icon: 'shirt', calculator: 'cleaning', subtitle: 'Lavanderia e passadoria', services: ['Passadeira', 'Lavanderia'] },
  { keywords: ['piscin'], icon: 'droplets', calculator: 'cleaning', subtitle: 'Limpeza e manutenção de piscina', services: ['Piscineiro'] },
  { keywords: ['manuten', 'eletric', 'encan', 'pintor', 'pintura', 'reparo', 'marido de aluguel', 'montador', 'marcen'], icon: 'wrench', calculator: 'cleaning', subtitle: 'Pequenos reparos e manutenção', services: ['Eletricista', 'Encanador', 'Pintor', 'Marido de aluguel'] },
  { keywords: ['pet', 'cachorr', 'dog', 'gato', 'adestr', 'passeador', 'banho e tosa'], icon: 'dog', calculator: 'cleaning', subtitle: 'Cuidados com pets', services: ['Pet sitter', 'Passeador(a) de cães', 'Adestrador(a)'] },
  { keywords: ['limp', 'faxin', 'diarist', 'higieniz', 'zelador', 'conservac'], icon: 'sparkles', calculator: 'cleaning', subtitle: 'Limpeza residencial, pesada e pós-evento', services: ['Diarista', 'Limpeza pesada', 'Limpeza pós-evento', 'Higienização de estofados'] },
  { keywords: ['jardin', 'jardim', 'paisag', 'poda', 'grama', 'horta', 'roçad', 'rocad'], icon: 'leaf', calculator: 'gardening', subtitle: 'Jardinagem, poda e paisagismo', services: ['Jardineiro', 'Paisagista', 'Poda de árvores'] },
];

const normalize = (text: string) => slugify(text).replace(/-/g, ' ');

/** Encontra a área que mais combina com o nome digitado (ou null). */
export function findServiceArea(name: string): ServiceArea | null {
  const text = normalize(name);
  if (!text) return null;
  const words = text.split(' ');
  let best: { area: ServiceArea; score: number } | null = null;
  for (const area of SERVICE_AREAS) {
    let score = 0;
    for (const kw of area.keywords) {
      const k = normalize(kw);
      if (!k) continue;
      if (k.includes(' ') ? ` ${text} `.includes(` ${k}`) : words.some(w => w.startsWith(k))) score += k.length;
    }
    if (score > 0 && (!best || score > best.score)) best = { area, score };
  }
  return best?.area ?? null;
}

/** Ícone sugerido para um nome qualquer (profissão ou categoria). */
export const suggestIcon = (name: string): ServiceIcon => findServiceArea(name)?.icon ?? 'party';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type ServiceDraft = Pick<ServiceCategory, 'name' | 'subtitle' | 'icon' | 'calculator'> & { services: string[] };

/**
 * Monta a categoria nova só com o nome. As profissões que já existem em outra
 * categoria (mesmo nome) ficam de fora para não duplicar.
 */
export function draftServiceFromName(rawName: string, existingLabels: string[] = []): { draft: ServiceDraft; matched: boolean } {
  const name = capitalize(rawName.trim().replace(/\s+/g, ' ')).slice(0, 80);
  const taken = new Set(existingLabels.map(l => slugify(l)));
  const area = findServiceArea(name);
  const fromArea = (area?.services ?? []).filter(label => !taken.has(slugify(label)));
  // O próprio nome digitado também vira profissão quando é diferente das sugeridas (ex.: "Doceira").
  const own = !taken.has(slugify(name)) && !fromArea.some(l => slugify(l) === slugify(name)) && !area ? [name] : [];
  const services = [...own, ...fromArea].slice(0, 8);
  return {
    matched: Boolean(area),
    draft: {
      name,
      subtitle: area?.subtitle ?? `${name} para o seu evento`,
      icon: area?.icon ?? 'party',
      calculator: area?.calculator ?? 'event',
      services: services.length ? services : [name],
    },
  };
}

/** Converte o rascunho para o formato do catálogo (ids são criados ao salvar). */
export const draftToCategory = (draft: ServiceDraft): ServiceCategory => ({ id: '', name: draft.name, subtitle: draft.subtitle, icon: draft.icon, calculator: draft.calculator, cover: '', services: draft.services.map(label => ({ id: '', label })) });
