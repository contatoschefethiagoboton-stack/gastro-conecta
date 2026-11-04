// Páginas de SEO (Google): uma para cada serviço que o cliente procura
// ("garçom para evento", "chef para evento"…) e uma para cada profissão que o
// profissional procura ("freela de garçom"…), cada uma também por cidade.
// O mesmo conteúdo é usado no HTML do servidor (o que o Google lê) e na página React.
import { DEFAULT_SERVICE_CATALOG, slugify, type RequestCategory, type ServiceCategory } from './services';
import type { Professional } from './catalog';

export const SITE_NAME = 'Eventos Conecta';
export const SITE_DOMAIN = 'eventosconecta.com.br';
export const DEFAULT_ORIGIN = `https://${SITE_DOMAIN}`;
export const SERVICES_BASE = '/servicos';
export const JOBS_BASE = '/trabalhe-como';

export type SeoCity = { slug: string; name: string; uf: string };
export type Faq = [question: string, answer: string];

export type SeoService = {
  slug: string;
  /** Nome como as pessoas buscam (ex.: "Garçom para evento"). */
  name: string;
  /** Nome curto no meio da frase (ex.: "garçom"). */
  short: string;
  /** Plural no meio da frase (ex.: "garçons"). */
  plural: string;
  /** Categoria do catálogo (filtro de profissionais). */
  categoryId: string;
  /** Profissões do catálogo que atendem este serviço. */
  serviceIds: string[];
  intro: string;
  occasions: string[];
  includes: string[];
  tips: string[];
  faqs: Faq[];
};

export type SeoProfession = {
  slug: string;
  /** Ex.: "Garçom freelancer". */
  name: string;
  /** Ex.: "garçom". */
  role: string;
  plural: string;
  serviceIds: string[];
  intro: string;
  clients: string[];
  faqs: Faq[];
  /** Criada a partir de uma profissão nova do painel: textos neutros ("Bolo personalizado em Campinas"). */
  neutral?: boolean;
};

/** Cidades padrão (Campinas e região). O administrador troca em Textos do site → SEO. */
export const DEFAULT_SEO_CITIES_TEXT = [
  'Campinas/SP', 'Valinhos/SP', 'Vinhedo/SP', 'Indaiatuba/SP', 'Sumaré/SP', 'Hortolândia/SP', 'Paulínia/SP',
  'Americana/SP', 'Jundiaí/SP', 'Itatiba/SP', 'Jaguariúna/SP', 'Santa Bárbara d\'Oeste/SP', 'Nova Odessa/SP',
  'Louveira/SP', 'Monte Mor/SP', 'Holambra/SP', 'Piracicaba/SP', 'Atibaia/SP',
].join('\n');

export const SEO_CITIES_KEY = 'seo.cities';

/** Lê "Cidade/UF" (uma por linha ou separadas por vírgula). Nunca falha. */
export function parseSeoCities(text: string | undefined): SeoCity[] {
  const seen = new Set<string>();
  const out: SeoCity[] = [];
  for (const raw of String(text ?? '').split(/[\n,;]+/)) {
    const [namePart, ufPart] = raw.split('/').map(s => s.trim());
    const name = (namePart ?? '').slice(0, 60);
    if (name.length < 2) continue;
    const uf = (ufPart ?? 'SP').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'SP';
    const slug = `${slugify(name)}-${uf.toLowerCase()}`;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, name, uf });
    if (out.length >= 60) break;
  }
  return out;
}

export function seoCitiesFrom(content: Record<string, string | undefined> | undefined): SeoCity[] {
  const parsed = parseSeoCities(content?.[SEO_CITIES_KEY]);
  return parsed.length ? parsed : parseSeoCities(DEFAULT_SEO_CITIES_TEXT);
}

const clientFaqs = (short: string): Faq[] => [
  ['Quanto custa usar o Eventos Conecta?', 'Para quem contrata é 100% grátis. Você publica o pedido, recebe propostas e só fecha se quiser. O pagamento do serviço é combinado direto com o profissional, sem comissão da plataforma.'],
  [`Como recebo orçamentos de ${short}?`, 'Conte a data, a cidade, o número de convidados e o que você precisa. Profissionais da sua região enviam propostas e você compara com calma antes de aceitar.'],
  ['O que acontece quando eu aceito uma proposta?', 'Você recebe o WhatsApp do profissional para alinhar os detalhes e um contrato em PDF com os dados das duas partes, escopo, data, local e valor.'],
  ['Como sei se o profissional é bom?', 'Cada perfil mostra fotos de trabalhos anteriores e as avaliações de clientes. Depois de cada serviço, cliente e profissional se avaliam, e quem mantém média alta ganha o selo Top Rated.'],
];

export const SEO_SERVICES: SeoService[] = [
  {
    slug: 'chef-para-evento', name: 'Chef para evento', short: 'chef', plural: 'chefs', categoryId: 'Gastronomia', serviceIds: ['chef-executivo', 'cozinheiro'],
    intro: 'Um chef muda o nível de qualquer encontro: o cardápio é pensado para a ocasião, a comida sai no ponto certo e você fica livre para receber seus convidados. Encontre chefs para jantares, aniversários, casamentos e eventos corporativos e receba propostas personalizadas.',
    occasions: ['Jantar em casa', 'Aniversário', 'Casamento e noivado', 'Evento corporativo', 'Confraternização de fim de ano', 'Festa de família'],
    includes: ['Criação do cardápio de acordo com o seu gosto e orçamento', 'Lista de compras ou compra dos ingredientes (combine na proposta)', 'Preparo e finalização no local do evento', 'Montagem dos pratos ou do buffet', 'Organização e limpeza da cozinha ao final, se combinado'],
    tips: ['Informe o número de convidados e restrições alimentares já no pedido.', 'Pergunte se o valor é só de mão de obra ou inclui ingredientes.', 'Confira fotos de trabalhos e avaliações de outros clientes.', 'Combine horário de chegada e o que a cozinha do local precisa ter.'],
    faqs: [['O chef leva os ingredientes?', 'Depende da proposta. Alguns chefs cobram só a mão de obra e passam a lista de compras; outros entregam o serviço completo com ingredientes. O contrato deixa isso claro.'], ['Com quanto tempo de antecedência devo contratar?', 'Quanto antes, melhor, principalmente em dezembro e em fins de semana. Para eventos grandes, o ideal é pedir propostas com algumas semanas de antecedência.'], ...clientFaqs('chef')],
  },
  {
    slug: 'personal-chef', name: 'Personal chef', short: 'personal chef', plural: 'personal chefs', categoryId: 'personal', serviceIds: ['personal-chef'],
    intro: 'Coma bem a semana inteira sem perder tempo na cozinha. Um personal chef planeja o cardápio, prepara marmitas fit, low-carb ou do dia a dia e deixa tudo porcionado na sua geladeira. Também atende jantares especiais na sua casa.',
    occasions: ['Marmitas semanais', 'Alimentação fit e low-carb', 'Dietas com restrição (sem glúten, sem lactose)', 'Jantar romântico em casa', 'Refeições para a família'],
    includes: ['Cardápio semanal combinado com você (ou com seu nutricionista)', 'Compra dos ingredientes, se combinado', 'Preparo, porcionamento e etiquetas com data', 'Orientação de armazenamento e congelamento'],
    tips: ['Diga quantas refeições por semana e para quantas pessoas.', 'Compartilhe o plano alimentar do nutricionista, se tiver.', 'Combine se o preparo é na sua cozinha ou na do profissional.'],
    faqs: [['Personal chef faz marmita fit?', 'Sim. É um dos serviços mais pedidos: refeições equilibradas, porcionadas e prontas para a semana, seguindo seu objetivo ou o plano do nutricionista.'], ['Quantas marmitas dá para fazer de uma vez?', 'Varia conforme o cardápio e o espaço de geladeira e freezer. O profissional calcula as porções e informa na proposta.'], ...clientFaqs('personal chef')],
  },
  {
    slug: 'buffet-para-festa', name: 'Buffet para festa', short: 'buffet', plural: 'buffets', categoryId: 'Gastronomia', serviceIds: ['buffet'],
    intro: 'Do churrasco entre amigos à festa de casamento, um buffet resolve comida, serviço e organização em um só lugar. Descreva sua festa e receba propostas de buffets que atendem a sua cidade, com cardápio e valor por pessoa.',
    occasions: ['Festa de aniversário', 'Casamento', 'Batizado e chá de bebê', 'Formatura', 'Evento corporativo', 'Coffee break'],
    includes: ['Cardápio completo (entradas, pratos principais, sobremesas)', 'Quantidade calculada para o número de convidados', 'Equipe de cozinha e, se combinado, garçons', 'Louças, réchauds e montagem, conforme a proposta'],
    tips: ['Compare propostas pelo valor por pessoa e pelo que está incluído.', 'Pergunte se bebidas, louças e garçons estão no preço.', 'Confirme quanto tempo dura o serviço.'],
    faqs: [['Buffet inclui garçom?', 'Alguns sim, outros não. Na plataforma você também encontra garçons e barmans separados para completar a equipe.'], ...clientFaqs('buffet')],
  },
  {
    slug: 'garcom-para-evento', name: 'Garçom para evento', short: 'garçom', plural: 'garçons', categoryId: 'Bar & salão', serviceIds: ['garcom'],
    intro: 'Um bom garçom faz o convidado se sentir bem recebido: serve na hora certa, repõe bebidas e mantém o salão em ordem. Contrate garçons e garçonetes por diária para festas, casamentos, churrascos e eventos corporativos.',
    occasions: ['Churrasco e festa em casa', 'Casamento', 'Aniversário de 15 anos', 'Evento corporativo', 'Coquetel e inauguração', 'Festa de fim de ano'],
    includes: ['Recepção dos convidados', 'Serviço de bebidas e de pratos à mesa ou volante', 'Reposição do buffet e das mesas', 'Recolhimento de louças e organização do salão'],
    tips: ['Uma referência comum é 1 garçom para cada 15 a 20 convidados; o profissional ajuda a calcular.', 'Informe o tipo de serviço (volante, à francesa, buffet).', 'Combine o traje e o horário de chegada.'],
    faqs: [['Quantos garçons preciso para o meu evento?', 'Depende do número de convidados e do tipo de serviço. Uma referência comum é 1 garçom para cada 15 a 20 pessoas. Informe os detalhes no pedido e os profissionais sugerem a equipe certa.'], ['Garçom por diária é contratado como?', 'Você combina o valor da diária direto com o profissional e recebe um contrato em PDF com escopo, data, horário e valor.'], ...clientFaqs('garçom')],
  },
  {
    slug: 'barman-para-evento', name: 'Barman para evento', short: 'barman', plural: 'barmans', categoryId: 'Bar & salão', serviceIds: ['barman'],
    intro: 'Drinks bem feitos são assunto da festa inteira. Contrate barman e bartender para casamentos, aniversários e eventos corporativos, com carta de drinks clássicos, autorais ou sem álcool.',
    occasions: ['Casamento', 'Aniversário', 'Open bar de festa', 'Evento corporativo', 'Happy hour e coquetel'],
    includes: ['Montagem e operação do bar', 'Carta de drinks combinada com você', 'Lista de compras de bebidas, frutas e gelo', 'Utensílios de bar, conforme a proposta'],
    tips: ['Diga quantos convidados e por quantas horas o bar fica aberto.', 'Combine se as bebidas são suas ou do profissional.', 'Inclua opções sem álcool para todos os convidados.'],
    faqs: [['O barman leva as bebidas?', 'Pode levar ou não. Muitos clientes compram as bebidas e o barman passa a lista de compras; outros preferem o pacote completo. A proposta deixa claro.'], ...clientFaqs('barman')],
  },
  {
    slug: 'cozinheiro-para-evento', name: 'Cozinheiro para evento', short: 'cozinheiro', plural: 'cozinheiros', categoryId: 'Gastronomia', serviceIds: ['cozinheiro', 'auxiliar-cozinha'],
    intro: 'Precisa de reforço na cozinha? Contrate cozinheiros e auxiliares de cozinha por diária para festas, eventos, restaurantes e buffets, com propostas de profissionais da sua região.',
    occasions: ['Festa em casa', 'Evento com muitos convidados', 'Reforço em restaurante ou buffet', 'Feijoada, churrasco e almoço de família'],
    includes: ['Preparo de pratos quentes e frios', 'Pré-preparo (mise en place)', 'Apoio ao chef ou ao buffet', 'Organização e limpeza da cozinha, se combinado'],
    tips: ['Descreva o cardápio e a quantidade de pessoas.', 'Informe se é diária única ou trabalho recorrente.', 'Combine horário e o que a cozinha do local oferece.'],
    faqs: [['Posso contratar cozinheiro por diária?', 'Sim. A maioria dos pedidos é por diária: você informa data, horário e o que precisa, e os profissionais enviam propostas.'], ...clientFaqs('cozinheiro')],
  },
  {
    slug: 'limpeza-pos-evento', name: 'Limpeza pós-evento', short: 'limpeza pós-evento', plural: 'equipes de limpeza', categoryId: 'Limpeza', serviceIds: ['limpeza-pos-evento', 'limpeza-pesada'],
    intro: 'A festa acabou e a casa ficou de pernas para o ar? Contrate uma equipe de limpeza pós-evento e acorde com tudo em ordem. Também atendemos salões, chácaras e espaços de eventos.',
    occasions: ['Depois de festa em casa', 'Salão de festas e chácara', 'Escritório após confraternização', 'Pós-obra e limpeza pesada'],
    includes: ['Recolhimento de lixo e descartáveis', 'Limpeza de cozinha, banheiros e área de festa', 'Lavagem de louça, se combinado', 'Limpeza de pisos e áreas externas'],
    tips: ['Informe o tamanho do espaço e o número de convidados.', 'Combine se os produtos de limpeza são do profissional.', 'Agende já na contratação do evento.'],
    faqs: [['A limpeza pode ser no mesmo dia do evento?', 'Pode, se o profissional tiver disponibilidade. Informe o horário de término da festa no pedido.'], ...clientFaqs('limpeza pós-evento')],
  },
  {
    slug: 'diarista', name: 'Diarista e limpeza residencial', short: 'diarista', plural: 'diaristas', categoryId: 'Limpeza', serviceIds: ['limpeza-residencial', 'limpeza-pesada'],
    intro: 'Casa limpa sem dor de cabeça. Encontre diaristas e equipes de limpeza residencial e pesada, para faxina avulsa ou recorrente, com avaliações de outros clientes.',
    occasions: ['Faxina semanal ou quinzenal', 'Limpeza pesada', 'Mudança de casa', 'Antes de receber visitas'],
    includes: ['Limpeza de cômodos, cozinha e banheiros', 'Limpeza de vidros e áreas externas, se combinado', 'Organização de ambientes'],
    tips: ['Informe o número de cômodos e banheiros.', 'Combine a frequência e os produtos.', 'Leia as avaliações de outros clientes.'],
    faqs: clientFaqs('diarista'),
  },
  {
    slug: 'jardineiro', name: 'Jardineiro e paisagismo', short: 'jardineiro', plural: 'jardineiros', categoryId: 'Jardinagem', serviceIds: ['jardinagem'],
    intro: 'Jardim bonito o ano inteiro, ou pronto para receber o seu evento. Contrate jardineiros para manutenção, poda, corte de grama e projetos de paisagismo.',
    occasions: ['Manutenção mensal', 'Preparar o jardim para uma festa', 'Corte de grama e poda', 'Projeto de paisagismo'],
    includes: ['Corte de grama e poda', 'Adubação e controle de pragas', 'Plantio e replantio', 'Limpeza e retirada de resíduos, se combinado'],
    tips: ['Informe o tamanho aproximado do jardim.', 'Envie fotos do espaço quando conversar com o profissional.', 'Combine se mudas e insumos estão no valor.'],
    faqs: clientFaqs('jardineiro'),
  },
];

const proFaqs = (role: string): Faq[] => [
  ['A plataforma cobra comissão?', 'Não. Você recebe 100% do valor combinado com o cliente, direto no seu Pix, e paga só uma assinatura mensal fixa para aparecer no catálogo e enviar propostas.'],
  ['O que preciso para me cadastrar?', 'CPF ou CNPJ (MEI ou empresa), foto de perfil ou logo, foto do rosto, pelo menos 3 fotos de trabalhos anteriores e dados bancários ou chave Pix.'],
  [`Como recebo pedidos de ${role}?`, 'No radar de pedidos você vê os pedidos da sua região com data, cidade, número de convidados e um score de intenção do cliente. Você envia a proposta e, se o cliente aceitar, recebe o WhatsApp dele e o contrato em PDF.'],
  ['Preciso ter experiência?', 'Você precisa mostrar fotos de trabalhos anteriores. As avaliações dos clientes depois de cada serviço ajudam você a ganhar destaque e o selo Top Rated.'],
];

export const SEO_PROFESSIONS: SeoProfession[] = [
  { slug: 'garcom-freelancer', name: 'Garçom freelancer', role: 'garçom', plural: 'garçons', serviceIds: ['garcom'],
    intro: 'Faça freelas de garçom e garçonete em festas, casamentos e eventos corporativos. Receba pedidos de clientes da sua cidade, envie propostas com o valor da sua diária e feche direto com o cliente.',
    clients: ['Festas em casa e churrascos', 'Casamentos e aniversários', 'Buffets que precisam de reforço', 'Eventos corporativos'], faqs: proFaqs('garçom') },
  { slug: 'barman-freelancer', name: 'Barman freelancer', role: 'barman', plural: 'barmans', serviceIds: ['barman'],
    intro: 'Trabalhe como barman ou bartender freelancer em casamentos, aniversários e eventos. Mostre seus drinks, receba pedidos da sua região e negocie direto com o cliente.',
    clients: ['Casamentos e festas', 'Open bar de aniversário', 'Eventos corporativos e coquetéis'], faqs: proFaqs('barman') },
  { slug: 'chef-de-cozinha', name: 'Chef de cozinha freelancer', role: 'chef', plural: 'chefs', serviceIds: ['chef-executivo'],
    intro: 'Chef, leve o seu trabalho a mais clientes. Receba pedidos de jantares, eventos e festas, use as calculadoras de ingredientes, porções e equipe e envie propostas profissionais.',
    clients: ['Jantares particulares', 'Casamentos e eventos', 'Eventos corporativos', 'Consultoria para restaurantes'], faqs: proFaqs('chef') },
  { slug: 'personal-chef', name: 'Personal chef', role: 'personal chef', plural: 'personal chefs', serviceIds: ['personal-chef'],
    intro: 'Conquiste clientes fixos de marmitas semanais, fit e low-carb. Calcule porções, custos e lucro no Copilot e receba pedidos de clientes da sua região.',
    clients: ['Famílias que querem marmitas semanais', 'Clientes com dieta fit ou restrição alimentar', 'Jantares em casa'], faqs: proFaqs('personal chef') },
  { slug: 'cozinheiro-freelancer', name: 'Cozinheiro freelancer', role: 'cozinheiro', plural: 'cozinheiros', serviceIds: ['cozinheiro'],
    intro: 'Faça freelas de cozinheiro em eventos, buffets e festas. Escolha os pedidos que combinam com a sua agenda e receba 100% da sua diária.',
    clients: ['Festas e eventos', 'Buffets e restaurantes', 'Almoços e jantares de família'], faqs: proFaqs('cozinheiro') },
  { slug: 'auxiliar-de-cozinha', name: 'Auxiliar de cozinha freelancer', role: 'auxiliar de cozinha', plural: 'auxiliares de cozinha', serviceIds: ['auxiliar-cozinha'],
    intro: 'Trabalhe como auxiliar de cozinha em eventos e buffets. Receba pedidos de diária perto de você e monte a sua reputação com avaliações.',
    clients: ['Chefs e buffets que precisam de equipe', 'Eventos com muitos convidados', 'Restaurantes em dias de pico'], faqs: proFaqs('auxiliar de cozinha') },
  { slug: 'buffet', name: 'Buffet', role: 'buffet', plural: 'buffets', serviceIds: ['buffet'],
    intro: 'Seu buffet com mais pedidos e sem comissão. Receba solicitações de festas e eventos da sua região já com data, número de convidados e orçamento estimado.',
    clients: ['Aniversários e casamentos', 'Eventos corporativos', 'Batizados, formaturas e confraternizações'], faqs: proFaqs('buffet') },
  { slug: 'diarista', name: 'Diarista e limpeza', role: 'diarista', plural: 'diaristas', serviceIds: ['limpeza-residencial', 'limpeza-pesada', 'limpeza-pos-evento', 'limpeza-restaurante'],
    intro: 'Encontre clientes de faxina residencial, limpeza pesada e limpeza pós-evento na sua cidade. Você define o seu preço e recebe direto do cliente.',
    clients: ['Casas e apartamentos', 'Limpeza pós-festa', 'Restaurantes e salões'], faqs: proFaqs('diarista') },
  { slug: 'jardineiro', name: 'Jardineiro', role: 'jardineiro', plural: 'jardineiros', serviceIds: ['jardinagem'],
    intro: 'Consiga clientes de manutenção de jardim, poda e paisagismo perto de você. Mostre fotos dos seus trabalhos e receba pedidos da sua região.',
    clients: ['Casas e condomínios', 'Jardins preparados para eventos', 'Projetos de paisagismo'], faqs: proFaqs('jardineiro') },
];

// ---------- Páginas criadas automaticamente para serviços novos do painel ----------

const OCCASIONS: Record<RequestCategory, string[]> = {
  event: ['Aniversário', 'Casamento e noivado', 'Evento corporativo', 'Festa em casa', 'Confraternização de fim de ano'],
  mealPrep: ['Refeições da semana', 'Alimentação fit e com restrições', 'Família com rotina corrida'],
  cleaning: ['Casa ou apartamento', 'Depois de festas e eventos', 'Escritórios e comércios'],
  gardening: ['Manutenção mensal', 'Preparar o espaço para um evento', 'Projeto novo'],
};
const CLIENTS: Record<RequestCategory, string[]> = {
  event: ['Festas em casa e aniversários', 'Casamentos e eventos sociais', 'Eventos corporativos', 'Buffets e produtoras que precisam de reforço'],
  mealPrep: ['Famílias que querem refeições prontas', 'Clientes com dieta ou restrição alimentar'],
  cleaning: ['Casas e apartamentos', 'Salões e espaços de eventos', 'Escritórios e comércios'],
  gardening: ['Casas e condomínios', 'Chácaras e espaços de eventos'],
};

function generatedService(cat: ServiceCategory, slug: string): SeoService {
  const isEvent = cat.calculator === 'event';
  const short = cat.name.toLowerCase();
  const labels = cat.services.map(s => s.label);
  return {
    slug,
    name: isEvent ? `${cat.name} para evento` : cat.name,
    short,
    plural: `profissionais de ${short}`,
    categoryId: cat.id,
    serviceIds: cat.services.map(s => s.id),
    intro: `${cat.subtitle ? `${cat.subtitle}. ` : ''}Encontre profissionais de ${short} da sua região${isEvent ? ' para o seu evento' : ''}, compare fotos e avaliações e receba propostas personalizadas: ${labels.join(', ')}.`,
    occasions: OCCASIONS[cat.calculator] ?? OCCASIONS.event,
    includes: ['Proposta personalizada para a sua data e necessidade', `Profissionais de ${labels.join(', ')}`, 'Contrato em PDF com escopo, data, local e valor', 'Conversa direta pelo WhatsApp depois do aceite'],
    tips: ['Informe a data, a cidade e o que você precisa já no pedido.', 'Pergunte o que está incluído no valor.', 'Confira fotos de trabalhos e avaliações de outros clientes.'],
    faqs: clientFaqs(short),
  };
}

function generatedProfession(label: string, serviceId: string, cat: ServiceCategory, slug: string): SeoProfession {
  const lower = label.toLowerCase();
  return {
    slug, name: label, role: lower, plural: `profissionais de ${lower}`, serviceIds: [serviceId], neutral: true,
    intro: `Trabalha com ${lower}? Receba pedidos de clientes da sua região na categoria ${cat.name}, envie propostas com o seu preço e fique com 100% do valor, sem comissão.`,
    clients: CLIENTS[cat.calculator] ?? CLIENTS.event,
    faqs: proFaqs(lower),
  };
}

export type SeoCatalog = { services: SeoService[]; professions: SeoProfession[] };

/**
 * Páginas de SEO a partir do catálogo do painel: as páginas escritas à mão para os
 * serviços padrão e, para cada categoria ou profissão nova, uma página gerada automaticamente.
 * Serviços excluídos no painel deixam de ter página.
 */
export function seoCatalogFrom(catalog: ServiceCategory[] = DEFAULT_SERVICE_CATALOG): SeoCatalog {
  const categoryIds = new Set(catalog.map(c => c.id));
  const serviceIds = new Set(catalog.flatMap(c => c.services.map(s => s.id)));
  const services = SEO_SERVICES.filter(s => categoryIds.has(s.categoryId));
  const professions = SEO_PROFESSIONS.filter(p => p.serviceIds.some(id => serviceIds.has(id)));
  const usedS = new Set(services.map(s => s.slug));
  const usedP = new Set(professions.map(p => p.slug));
  const unique = (used: Set<string>, base: string) => { let slug = base || 'servico'; let n = 2; while (used.has(slug)) slug = `${base}-${n++}`; used.add(slug); return slug; };
  const coveredCategories = new Set(SEO_SERVICES.map(s => s.categoryId));
  const coveredServices = new Set(SEO_PROFESSIONS.flatMap(p => p.serviceIds));
  for (const cat of catalog) {
    if (!cat.id) continue;
    if (!coveredCategories.has(cat.id)) services.push(generatedService(cat, unique(usedS, slugify(cat.calculator === 'event' ? `${cat.name} para evento` : cat.name))));
    for (const s of cat.services) if (s.id && !coveredServices.has(s.id)) professions.push(generatedProfession(s.label, s.id, cat, unique(usedP, slugify(s.label))));
  }
  return { services, professions };
}

const DEFAULT_SEO_CATALOG = seoCatalogFrom(DEFAULT_SERVICE_CATALOG);
export const findSeoService = (slug: string, seo: SeoCatalog = DEFAULT_SEO_CATALOG) => seo.services.find(s => s.slug === slug);
export const findSeoProfession = (slug: string, seo: SeoCatalog = DEFAULT_SEO_CATALOG) => seo.professions.find(p => p.slug === slug);

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const cityLabel = (c: SeoCity) => `${c.name}/${c.uf}`;
/** Título com até 70 caracteres: tira o trecho do meio antes de cortar. */
const titleOf = (main: string, middle: string) => {
  const full = `${main} | ${middle} | ${SITE_NAME}`;
  if (full.length <= 70) return full;
  const short = `${main} | ${SITE_NAME}`;
  return short.length <= 70 ? short : clip(main, 70);
};
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`);

/** Retira acentos e caixa para comparar cidades ("Sumaré, SP" ≈ "sumare"). */
export const normalizeCityName = (s: string) => slugify(String(s ?? '').split(/[,/]/)[0] ?? '');

/** Cidades vizinhas para links internos (as próximas da lista, sem a atual). */
export function nearbyCities(cities: SeoCity[], current: SeoCity, count = 8): SeoCity[] {
  const index = cities.findIndex(c => c.slug === current.slug);
  const rest = [...cities.slice(index + 1), ...cities.slice(0, Math.max(0, index))];
  return rest.slice(0, count);
}

// ---------- Endereços locais: /{uf}/{cidade}/{serviço} (ex.: /sp/campinas/personal-chef) ----------

/** Trecho da cidade no endereço ("Santa Bárbara d'Oeste" → "santa-barbara-d-oeste"). */
export const citySegment = (city: SeoCity) => slugify(city.name);
/** Página da cidade: /sp/campinas. */
export const cityPath = (city: SeoCity) => `/${city.uf.toLowerCase()}/${citySegment(city)}`;
/** Página de um serviço na cidade: /sp/campinas/personal-chef. */
export const serviceCityPath = (service: Pick<SeoService, 'slug'>, city: SeoCity) => `${cityPath(city)}/${service.slug}`;

/** Endereço local da página do profissional; se o nome coincidir com um serviço, ganha o prefixo "trabalhe-como-". */
export function jobLocalSlug(profession: Pick<SeoProfession, 'slug'>, seo: SeoCatalog = DEFAULT_SEO_CATALOG): string {
  return seo.services.some(s => s.slug === profession.slug) ? `trabalhe-como-${profession.slug}` : profession.slug;
}
export const jobCityPath = (profession: Pick<SeoProfession, 'slug'>, city: SeoCity, seo: SeoCatalog = DEFAULT_SEO_CATALOG) => `${cityPath(city)}/${jobLocalSlug(profession, seo)}`;

/** Apelidos que as pessoas digitam ou que circulam em links antigos → serviço oficial (redirecionamento 301). */
export const SERVICE_ALIASES: Record<string, string> = {
  'buffet-eventos': 'buffet-para-festa', 'buffet-para-eventos': 'buffet-para-festa', 'buffet-festa': 'buffet-para-festa',
  'garcom': 'garcom-para-evento', 'garcons': 'garcom-para-evento', 'garcom-para-festa': 'garcom-para-evento',
  'barman': 'barman-para-evento', 'bartender': 'barman-para-evento', 'barman-para-festa': 'barman-para-evento',
  'chef': 'chef-para-evento', 'chef-de-cozinha-para-evento': 'chef-para-evento', 'chef-em-casa': 'chef-para-evento',
  'cozinheiro': 'cozinheiro-para-evento', 'cozinheira': 'cozinheiro-para-evento',
  'limpeza': 'limpeza-pos-evento', 'faxina': 'diarista', 'jardinagem': 'jardineiro', 'paisagismo': 'jardineiro',
};

export const findCityByPath = (cities: SeoCity[], uf: string, segment: string) =>
  cities.find(c => c.uf.toLowerCase() === uf.toLowerCase() && citySegment(c) === segment);

export type Crumb = { name: string; path: string };
export type SeoPage = {
  path: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  faqs: Faq[];
  crumbs: Crumb[];
};

export function servicePage(service: SeoService, city?: SeoCity): SeoPage {
  const where = city ? ` em ${city.name}` : '';
  const path = city ? serviceCityPath(service, city) : `${SERVICES_BASE}/${service.slug}`;
  const crumbs: Crumb[] = city
    ? [{ name: 'Início', path: '/' }, { name: cityLabel(city), path: cityPath(city) }, { name: service.name, path }]
    : [{ name: 'Início', path: '/' }, { name: 'Serviços', path: SERVICES_BASE }, { name: service.name, path }];
  const lead = city
    ? `Precisa de ${service.short}${where}? Peça orçamento grátis e receba propostas de ${service.plural} que atendem ${city.name} e região. Compare perfis, fotos e avaliações e feche com contrato em PDF.`
    : service.intro;
  const faqs = city
    ? [[`Como contratar ${service.short}${where}?`, `Publique o seu pedido no Eventos Conecta com a data, o local em ${city.name} e o número de convidados. Os profissionais que atendem a região enviam propostas e você escolhe a melhor.`] as Faq, ...service.faqs]
    : service.faqs;
  return {
    path,
    title: titleOf(`${service.name}${where}${city ? `/${city.uf}` : ''}`, 'Orçamento grátis'),
    description: clip(city
      ? `${service.name} em ${city.name}/${city.uf}: receba propostas de ${service.plural} da região, compare avaliações e contrate com contrato em PDF. Grátis para quem contrata.`
      : `${service.name}: receba propostas de ${service.plural} da sua região, compare fotos e avaliações e contrate com contrato em PDF. Grátis para quem contrata.`, 160),
    h1: `${service.name}${where}`,
    lead,
    faqs,
    crumbs,
  };
}

export function professionPage(profession: SeoProfession, city?: SeoCity, seo: SeoCatalog = DEFAULT_SEO_CATALOG): SeoPage {
  const where = city ? ` em ${city.name}` : '';
  const path = city ? jobCityPath(profession, city, seo) : `${JOBS_BASE}/${profession.slug}`;
  const crumbs: Crumb[] = city
    ? [{ name: 'Início', path: '/' }, { name: cityLabel(city), path: cityPath(city) }, { name: profession.name, path }]
    : [{ name: 'Início', path: '/' }, { name: 'Para profissionais', path: JOBS_BASE }, { name: profession.name, path }];
  const n = profession.neutral;
  const lead = city
    ? n ? `Trabalha com ${profession.role}${where}? Receba pedidos de clientes de ${city.name} e região, envie propostas com o seu preço e receba 100% do valor, sem comissão.`
      : `Quer trabalhar como ${profession.role}${where}? Receba pedidos de clientes de ${city.name} e região, envie propostas com o seu preço e receba 100% do valor, sem comissão.`
    : profession.intro;
  return {
    path,
    title: n ? titleOf(`${profession.name}${where}${city ? `/${city.uf}` : ''}`, 'Receba pedidos de clientes')
      : titleOf(`Freela de ${profession.role}${where}${city ? `/${city.uf}` : ''}`, city ? 'Freelas e clientes' : 'Trabalhe com eventos'),
    description: clip(`${capitalize(profession.role)}${where}: receba pedidos de clientes da região, envie propostas e fique com 100% do valor. Sem comissão, só uma assinatura mensal fixa.`, 160),
    h1: n ? `${profession.name}${where}: receba pedidos de clientes` : city ? `Trabalhe como ${profession.role}${where}` : `${profession.name}: receba pedidos de clientes`,
    lead,
    faqs: profession.faqs,
    crumbs,
  };
}

export const servicesHubPage = (): SeoPage => ({
  path: SERVICES_BASE,
  title: `Profissionais para eventos: chef, garçom, barman e buffet | ${SITE_NAME}`,
  description: 'Contrate chef, personal chef, buffet, garçom, barman, cozinheiro, limpeza e jardinagem para o seu evento. Receba propostas grátis de profissionais da sua região.',
  h1: 'Profissionais para o seu evento',
  lead: 'Escolha o serviço e a cidade. Você publica o pedido de graça, recebe propostas de profissionais da região e fecha com contrato em PDF.',
  faqs: clientFaqs('profissionais'),
  crumbs: [{ name: 'Início', path: '/' }, { name: 'Serviços', path: SERVICES_BASE }],
});

export const jobsHubPage = (): SeoPage => ({
  path: JOBS_BASE,
  title: `Freelas em eventos: garçom, chef, barman e mais | ${SITE_NAME}`,
  description: 'Trabalhe com eventos como garçom, chef, barman, cozinheiro, personal chef, buffet, diarista ou jardineiro. Receba pedidos da sua região sem pagar comissão.',
  h1: 'Freelas e clientes para profissionais de eventos',
  lead: 'Receba pedidos de clientes da sua cidade, envie propostas com o seu preço e fique com 100% do valor. Você paga só uma assinatura mensal fixa.',
  faqs: proFaqs('trabalho'),
  crumbs: [{ name: 'Início', path: '/' }, { name: 'Para profissionais', path: JOBS_BASE }],
});

/** Página da cidade (/sp/campinas): todos os serviços e oportunidades daquela cidade. */
export const cityHubPage = (city: SeoCity): SeoPage => ({
  path: cityPath(city),
  title: titleOf(`Profissionais para eventos em ${city.name}/${city.uf}`, 'Chef, garçom, buffet'),
  description: clip(`Chef, personal chef, buffet, garçom, barman, limpeza e jardinagem em ${city.name}/${city.uf}. Peça orçamento grátis e receba propostas de profissionais da região.`, 160),
  h1: `Profissionais para eventos em ${city.name}`,
  lead: `Encontre quem atende ${city.name} e região: escolha o serviço, publique o pedido de graça e receba propostas com contrato em PDF.`,
  faqs: clientFaqs('profissionais'),
  crumbs: [{ name: 'Início', path: '/' }, { name: 'Serviços', path: SERVICES_BASE }, { name: `${city.name}/${city.uf}`, path: cityPath(city) }],
});

/** Todas as páginas públicas de SEO (para o sitemap). */
export function seoPaths(cities: SeoCity[], seo: SeoCatalog = DEFAULT_SEO_CATALOG): string[] {
  return [
    SERVICES_BASE,
    ...cities.map(cityPath),
    ...seo.services.flatMap(s => [`${SERVICES_BASE}/${s.slug}`, ...cities.map(c => serviceCityPath(s, c))]),
    JOBS_BASE,
    ...seo.professions.flatMap(p => [`${JOBS_BASE}/${p.slug}`, ...cities.map(c => jobCityPath(p, c, seo))]),
  ];
}

export type ResolvedSeoRoute =
  | { kind: 'redirect'; to: string }
  | { kind: 'cityHub'; page: SeoPage; city: SeoCity }
  | { kind: 'servicesHub'; page: SeoPage }
  | { kind: 'jobsHub'; page: SeoPage }
  | { kind: 'service'; page: SeoPage; service: SeoService; city?: SeoCity }
  | { kind: 'job'; page: SeoPage; profession: SeoProfession; city?: SeoCity };

/** Interpreta um caminho de SEO. Devolve null para caminhos desconhecidos (404). */
export function resolveSeoRoute(path: string, cities: SeoCity[], seo: SeoCatalog = DEFAULT_SEO_CATALOG): ResolvedSeoRoute | null {
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean).map(p => p.toLowerCase());
  // Endereços locais: /sp/campinas e /sp/campinas/personal-chef
  if (LOCAL_RE.test(`/${parts.join('/')}`)) {
    const city = findCityByPath(cities, parts[0]!, parts[1]!);
    if (!city) return null;
    if (parts.length === 2) return { kind: 'cityHub', city, page: cityHubPage(city) };
    const slug = parts[2]!;
    const service = findSeoService(slug, seo);
    if (service) return { kind: 'service', service, city, page: servicePage(service, city) };
    const profession = seo.professions.find(p => jobLocalSlug(p, seo) === slug);
    if (profession) return { kind: 'job', profession, city, page: professionPage(profession, city, seo) };
    const alias = SERVICE_ALIASES[slug] ? findSeoService(SERVICE_ALIASES[slug]!, seo) : undefined;
    if (alias) return { kind: 'redirect', to: serviceCityPath(alias, city) };
    const legacyJob = findSeoProfession(slug, seo);
    return legacyJob ? { kind: 'redirect', to: jobCityPath(legacyJob, city, seo) } : null;
  }
  const base = `/${parts[0] ?? ''}`;
  if (base !== SERVICES_BASE && base !== JOBS_BASE) return null;
  if (parts.length === 1) return base === SERVICES_BASE ? { kind: 'servicesHub', page: servicesHubPage() } : { kind: 'jobsHub', page: jobsHubPage() };
  if (parts.length > 3) return null;
  const city = parts[2] ? cities.find(c => c.slug === parts[2]) : undefined;
  if (parts[2] && !city) return null;
  if (base === SERVICES_BASE) {
    const service = findSeoService(parts[1]!, seo) ?? (SERVICE_ALIASES[parts[1]!] ? findSeoService(SERVICE_ALIASES[parts[1]!]!, seo) : undefined);
    if (!service) return null;
    // Endereço antigo com cidade (/servicos/x/campinas-sp) ou apelido: redireciona para o oficial.
    if (city) return { kind: 'redirect', to: serviceCityPath(service, city) };
    if (service.slug !== parts[1]) return { kind: 'redirect', to: `${SERVICES_BASE}/${service.slug}` };
    return { kind: 'service', service, page: servicePage(service) };
  }
  const profession = findSeoProfession(parts[1]!, seo);
  if (!profession) return null;
  if (city) return { kind: 'redirect', to: jobCityPath(profession, city, seo) };
  return { kind: 'job', profession, page: professionPage(profession, undefined, seo) };
}

/** Profissionais reais (não demonstrativos) que atendem a categoria/profissão e, se houver, a cidade. */
export function matchProfessionals(all: Professional[], categoryIds: string[], serviceLabels: string[], city?: SeoCity): Professional[] {
  return all.filter(p => !p.demo
    && ((p.categoryIds ?? []).some(id => categoryIds.includes(id)) || (p.services ?? []).some(l => serviceLabels.includes(l)))
    && (!city || normalizeCityName(p.city) === normalizeCityName(city.name))).slice(0, 12);
}

/** /sp/campinas ou /sp/campinas/personal-chef (a UF tem sempre 2 letras). */
const LOCAL_RE = /^\/[a-z]{2}\/[a-z0-9-]+(\/[a-z0-9-]+)?$/;

export const isSeoPath = (path: string) => path === SERVICES_BASE || path === JOBS_BASE || path.startsWith(`${SERVICES_BASE}/`) || path.startsWith(`${JOBS_BASE}/`) || LOCAL_RE.test(path.replace(/\/+$/, '').toLowerCase());
