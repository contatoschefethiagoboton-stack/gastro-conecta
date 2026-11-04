// Copilot em tempo integral: em toda conversa ele tem UM objetivo de negócio.
//  - Visitante: descobrir se quer contratar ou trabalhar e levar para o orçamento ou o cadastro.
//  - Cliente: publicar o pedido, comparar propostas e fechar (aceitar + contrato).
//  - Profissional: completar o perfil, ativar a assinatura e responder os pedidos do radar.
// Tudo aqui funciona sem IA (regras); a IA só deixa a conversa mais natural.
import { detectIntent } from './socialIntent';
import { JOBS_BASE, jobCityPath, type SeoCatalog, type SeoCity } from './seo';
import type { SubscriptionPhase } from './subscription';

export type CopilotAudience = 'visitor' | 'client' | 'provider';

export type CopilotState = {
  audience: CopilotAudience;
  name?: string;
  provider?: {
    profileComplete: boolean;
    phase: SubscriptionPhase;
    /** Pedidos abertos compatíveis no radar ainda sem proposta dele. */
    radarOpen: number;
    /** Propostas dele aguardando resposta do cliente. */
    pendingProposals: number;
  };
  client?: {
    /** Pedidos abertos (ainda sem profissional). */
    openEvents: number;
    /** Propostas recebidas aguardando a decisão dele. */
    pendingProposals: number;
    contractDataComplete: boolean;
  };
};

export type CopilotAction = { label: string; href: string };
export type CopilotNudge = {
  /** Identifica a situação: o balão proativo só aparece uma vez por situação/sessão. */
  id: string;
  goal: string;
  message: string;
  action: CopilotAction;
  suggestions: string[];
};

const first = (name?: string) => {
  const n = String(name ?? '').trim().split(/\s+/)[0];
  return n ? `, ${n}` : '';
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Próximo passo de fechamento para a pessoa, pelas regras. */
export function copilotNudge(state: CopilotState): CopilotNudge {
  const hi = `Oi${first(state.name)}! 👋`;
  if (state.audience === 'provider' && state.provider) {
    const p = state.provider;
    const suggestions = ['Como escrever uma proposta que fecha?', 'Me ajuda a calcular o preço de um evento', 'Como aparecer mais no catálogo?'];
    if (!p.profileComplete) return { id: 'provider-profile', goal: 'completar o perfil', message: `${hi} Falta pouco para você começar a receber pedidos: complete seu perfil (documento, fotos dos trabalhos e Pix). Quer que eu te guie?`, action: { label: 'Completar meu perfil', href: '/painel?aba=profile' }, suggestions: ['O que falta no meu perfil?', 'Que fotos devo colocar?', ...suggestions.slice(0, 1)] };
    if (p.phase === 'inactive' || p.phase === 'blocked' || p.phase === 'manual') {
      const why = p.phase === 'inactive' ? 'Ative sua assinatura para aparecer no catálogo' : 'Sua assinatura está pendente e seu perfil pode ficar oculto';
      const radar = p.radarOpen > 0 ? ` Já tem ${plural(p.radarOpen, 'pedido compatível esperando', 'pedidos compatíveis esperando')} no radar.` : '';
      return { id: `provider-sub-${p.phase}`, goal: 'ativar a assinatura', message: `${hi} ${why} e enviar propostas — você fica com 100% do valor, sem comissão.${radar}`, action: { label: 'Ativar assinatura', href: '/painel?aba=subscription' }, suggestions: ['Quanto custa a assinatura?', 'Vale a pena assinar?', 'Como recebo os pedidos?'] };
    }
    if (p.radarOpen > 0) return { id: `provider-radar-${p.radarOpen}`, goal: 'enviar propostas', message: `${hi} Você tem ${plural(p.radarOpen, 'pedido no radar', 'pedidos no radar')} sem proposta. Quem responde primeiro costuma fechar — quer ajuda para montar a proposta?`, action: { label: 'Abrir radar de pedidos', href: '/painel?aba=radar' }, suggestions };
    if (p.pendingProposals > 0) return { id: `provider-wait-${p.pendingProposals}`, goal: 'fechar as propostas enviadas', message: `${hi} ${plural(p.pendingProposals, 'proposta sua está', 'propostas suas estão')} esperando o cliente. Posso sugerir como reforçar a proposta ou ajustar o valor?`, action: { label: 'Ver minhas propostas', href: '/painel?aba=proposals' }, suggestions };
    return { id: 'provider-grow', goal: 'conseguir mais pedidos', message: `${hi} Nenhum pedido novo agora. Quer dicas para aparecer mais no catálogo e ser escolhido?`, action: { label: 'Ver nível e promoções', href: '/painel?aba=growth' }, suggestions };
  }
  if (state.audience === 'client' && state.client) {
    const c = state.client;
    if (c.pendingProposals > 0) return { id: `client-proposals-${c.pendingProposals}`, goal: 'escolher e aceitar uma proposta', message: `${hi} Você recebeu ${plural(c.pendingProposals, 'proposta', 'propostas')}. Quer ajuda para comparar e escolher? Ao aceitar, o contrato em PDF sai na hora.`, action: { label: 'Ver propostas', href: '/painel?aba=requests' }, suggestions: ['Como escolher a melhor proposta?', 'O que conferir antes de aceitar?', 'Como funciona o contrato?'] };
    if (c.openEvents > 0) return { id: `client-waiting-${c.openEvents}`, goal: 'receber propostas', message: `${hi} Seu pedido já está no radar dos profissionais da região. Enquanto isso, quer ver perfis e chamar alguém direto?`, action: { label: 'Ver profissionais', href: '/profissionais' }, suggestions: ['Quanto tempo demora para chegar proposta?', 'Posso convidar um profissional específico?', 'Quero pedir outro serviço'] };
    return { id: 'client-new', goal: 'publicar um pedido', message: `${hi} Vai fazer algum evento? Me conta o que precisa (serviço, cidade, data e nº de pessoas) que eu já deixo o pedido pronto — é grátis.`, action: { label: 'Pedir orçamento grátis', href: '/orcamento' }, suggestions: ['Preciso de garçom para sábado', 'Quero um chef para um jantar', 'Quanto custa um buffet para 50 pessoas?'] };
  }
  return { id: 'visitor', goal: 'descobrir se a pessoa quer contratar ou trabalhar', message: 'Oi! 👋 Sou o assistente do Eventos Conecta. Você quer contratar um profissional para um evento ou trabalhar com eventos?', action: { label: 'Pedir orçamento grátis', href: '/orcamento' }, suggestions: ['Quero contratar para um evento', 'Sou profissional e quero trabalhar', 'Como funciona?'] };
}

/** Instruções do objetivo para o prompt da IA (contexto vivo da pessoa). */
export function goalPrompt(state: CopilotState, nudge = copilotNudge(state)): string {
  const facts: string[] = [];
  if (state.provider) facts.push(`perfil completo: ${state.provider.profileComplete ? 'sim' : 'não'}`, `assinatura: ${state.provider.phase}`, `pedidos no radar sem proposta: ${state.provider.radarOpen}`, `propostas aguardando cliente: ${state.provider.pendingProposals}`);
  if (state.client) facts.push(`pedidos abertos: ${state.client.openEvents}`, `propostas recebidas aguardando decisão: ${state.client.pendingProposals}`, `dados do contrato completos: ${state.client.contractDataComplete ? 'sim' : 'não'}`);
  const who = state.audience === 'provider' ? 'profissional cadastrado' : state.audience === 'client' ? 'cliente cadastrado' : 'visitante sem conta';
  return [
    `Você é o assistente comercial do Eventos Conecta e trabalha em tempo integral para FECHAR NEGÓCIOS: trazer profissionais para a plataforma (cadastro + assinatura) e levar clientes a fechar com esses profissionais.`,
    `Pessoa atual: ${who}.${facts.length ? ` Situação: ${facts.join('; ')}.` : ''}`,
    `Objetivo agora: ${nudge.goal}. Próximo passo ideal: "${nudge.action.label}" (${nudge.action.href}).`,
    `Regras: responda em português do Brasil, curto (até 6 linhas), simpático e direto. Resolva a dúvida e SEMPRE termine com UM próximo passo concreto com link em markdown, usando só caminhos do site: /orcamento (aceita ?servico=&cidade=&data=), /conta?cadastro=profissional, /conta?cadastro=cliente, /profissionais, /como-funciona, /para-profissionais, /painel?aba=radar, /painel?aba=proposals, /painel?aba=subscription, /painel?aba=profile, /painel?aba=requests, ${JOBS_BASE}.`,
    `Se for visitante, descubra primeiro se quer contratar ou trabalhar. Cliente usa grátis; profissional paga só a assinatura mensal e fica com 100% do valor, sem comissão. Contrato em PDF com todos os valores.`,
    `Quebre objeções com fatos da plataforma, sem pressão nem promessas falsas. Não invente preços de profissionais, avaliações, disponibilidade ou garantias. Não peça nem exponha dados pessoais (CPF, e-mail, telefone) no chat.`,
  ].join('\n');
}

const HOW_IT_WORKS = 'Funciona assim: o cliente descreve o evento (grátis), os profissionais da região mandam propostas, o cliente escolhe e o contrato em PDF sai com todos os valores. O profissional paga só uma assinatura mensal e fica com 100% do valor, sem comissão.';

/** Resposta por regras (sem IA ou se a IA falhar): entende a mensagem e leva ao próximo passo. */
export function ruleReply(text: string, state: CopilotState, seo: SeoCatalog, cities: SeoCity[], now = new Date()): string {
  const nudge = copilotNudge(state);
  const t = String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const intent = detectIntent(text, cities, seo.services, now);
  const wantsHire = intent.kind === 'client' || /\b(contratar|orcamento|evento|festa|casamento|aniversario)\b/.test(t);
  const wantsWork = intent.kind === 'provider' || /\b(sou profissional|trabalhar|cadastr|freela|assinatura|assinar)\b/.test(t);
  if (/\b(como funciona|o que e|como e)\b/.test(t)) return `${HOW_IT_WORKS}\n\n👉 [${nudge.action.label}](${nudge.action.href})`;
  if (state.audience === 'provider' && /(calcul|quanto cobrar|precific|margem|ingrediente|porc(ao|oes))/.test(t)) return `Use as calculadoras do painel: você informa o tipo de evento e o nº de pessoas e elas sugerem ingredientes, equipe, custos e um preço com margem — tudo editável antes de mandar a proposta.\n\n👉 [Abrir calculadoras](/painel?aba=calculators)`;
  if (/\b(quanto custa|preco|valor|mensalidade)\b/.test(t) && (state.audience === 'provider' || /assinatura|assinar|mensalidade/.test(t))) return `A assinatura é um valor fixo por mês, sem comissão: tudo o que você negociar com o cliente é 100% seu. O valor atual e o período de teste aparecem na aba Assinatura.\n\n👉 [Ver assinatura](${state.audience === 'provider' ? '/painel?aba=subscription' : '/para-profissionais'})`;
  if (/proposta/.test(t) && state.audience !== 'provider' && /(escolh|compar|aceit|melhor|conferir)/.test(t)) return `Para escolher bem: 1) compare o que está incluso (equipe, horas, insumos ou só mão de obra), não só o preço; 2) veja avaliações e fotos de trabalhos no perfil; 3) tire dúvidas antes de aceitar. Ao aceitar, o contrato em PDF sai na hora com todos os valores.\n\n👉 [${nudge.action.label}](${nudge.action.href})`;
  if (/proposta/.test(t) && state.audience === 'provider') return `Proposta que fecha: responda rápido, cite o evento do cliente (data, nº de pessoas), diga exatamente o que está incluso, mostre fotos de trabalhos parecidos e dê um valor claro (a lista de compras pode entrar no orçamento ou como cortesia).\n\n👉 [Abrir radar de pedidos](/painel?aba=radar)`;
  if (/\b(perfil|fotos?|catalogo|aparecer)\b/.test(t) && state.audience === 'provider') return `Perfil que vende: foto de rosto nítida, pelo menos 3 fotos boas de trabalhos, descrição curta do que você faz e da sua região, e assinatura ativa para aparecer no catálogo. Avaliações dos clientes sobem seu nível.\n\n👉 [${state.provider?.profileComplete ? 'Ver meu perfil' : 'Completar meu perfil'}](/painel?aba=profile)`;
  if (wantsWork && !(state.audience === 'client')) {
    if (state.audience === 'provider') return `${nudge.message}\n\n👉 [${nudge.action.label}](${nudge.action.href})`;
    const profession = intent.serviceSlug ? seo.professions.find(p => p.serviceIds.some(id => seo.services.find(s => s.slug === intent.serviceSlug)?.serviceIds.includes(id))) : undefined;
    const info = profession && intent.city ? jobCityPath(profession, intent.city, seo) : '/para-profissionais';
    return `Que bom ter você! No Eventos Conecta você recebe pedidos de clientes da sua região direto no painel e fica com 100% do valor, sem comissão. O cadastro leva poucos minutos.\n\n👉 [Criar meu cadastro de profissional](/conta?cadastro=profissional) · [Saiba mais](${info})`;
  }
  if (wantsHire || intent.serviceSlug) {
    if (state.audience === 'client' && state.client?.pendingProposals) return `${nudge.message}\n\n👉 [${nudge.action.label}](${nudge.action.href})`;
    const url = new URLSearchParams();
    if (intent.serviceSlug) url.set('servico', intent.serviceSlug);
    if (intent.city) url.set('cidade', `${intent.city.name}, ${intent.city.uf}`);
    if (intent.date) url.set('data', intent.date);
    const service = intent.serviceSlug ? seo.services.find(s => s.slug === intent.serviceSlug) : undefined;
    const bits = [service ? service.short : '', intent.city ? `em ${intent.city.name}` : '', intent.date ? `no dia ${intent.date.split('-').reverse().join('/')}` : '', intent.guests ? `para ${intent.guests} pessoas` : ''].filter(Boolean).join(' ');
    const qs = url.toString();
    return `Perfeito${bits ? ` — ${bits}` : ''}! Deixei o pedido de orçamento adiantado: é grátis, os profissionais da região te mandam propostas e você escolhe a melhor, com contrato em PDF.\n\n👉 [Pedir orçamento agora](/orcamento${qs ? `?${qs}` : ''})`;
  }
  return `${nudge.message}\n\n👉 [${nudge.action.label}](${nudge.action.href})`;
}
