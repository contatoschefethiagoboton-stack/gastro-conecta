// Copilot do dono: olha a plataforma inteira e diz o que precisa de atenção, com a ação pronta.
// Tudo aqui é regra (funciona sem IA). Ações que mexem em contas ou dinheiro continuam manuais:
// o Copilot só aponta e leva até a tela certa. As ações de um clique são só lembretes.

export type Person = { id: number; name: string };
export type OwnerMetrics = {
  newClients24h: number;
  newProviders24h: number;
  activeProviders: number;
  totalClients: number;
  openEvents: number;
  bookedThisMonth: number;
  revenueMonthCents: number;
  revenueLastMonthCents: number;
  /** Profissionais com cadastro completo esperando sua aprovação. */
  pendingApproval: Person[];
  /** Profissionais com cadastro incompleto há 2 dias ou mais. */
  incompleteProfiles: Person[];
  /** Testes grátis que acabam nos próximos 3 dias. */
  trialsEnding: Array<Person & { until: string }>;
  /** Assinaturas vencidas nos últimos 30 dias. */
  overdue: Person[];
  /** Pedidos abertos há mais de 24 h sem nenhuma proposta. */
  eventsNoProposal: Array<{ id: number; title: string; city: string; hours: number }>;
  /** Pedidos com propostas esperando o cliente há mais de 48 h. */
  proposalsWaiting: Array<{ id: number; title: string; clientId: number; proposals: number }>;
  socialErrors24h: number;
  googleErrorsToday: number;
};

export type BriefActionId = 'renotify-events' | 'nudge-profiles' | 'nudge-clients' | 'nudge-trials';
export type BriefItem = {
  id: string;
  level: 'urgent' | 'attention' | 'info';
  title: string;
  detail: string;
  /** Lembrete de um clique (o Copilot executa). */
  action?: { id: BriefActionId; label: string; ids: number[] };
  /** Tela do painel onde você resolve. */
  section?: { id: string; label: string };
};

export const BRIEF_ACTIONS: BriefActionId[] = ['renotify-events', 'nudge-profiles', 'nudge-clients', 'nudge-trials'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const names = (list: Array<{ name?: string; title?: string }>, max = 3) => {
  const shown = list.slice(0, max).map(p => p.name || p.title || '').filter(Boolean).join(', ');
  return list.length > max ? `${shown} e mais ${list.length - max}` : shown;
};
export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** O que precisa de atenção hoje, do mais urgente para o menos. */
export function buildBrief(m: OwnerMetrics): BriefItem[] {
  const items: BriefItem[] = [];
  if (m.eventsNoProposal.length) items.push({ id: 'events-no-proposal', level: 'urgent', title: `${plural(m.eventsNoProposal.length, 'pedido sem proposta', 'pedidos sem proposta')} há mais de 24 h`, detail: `Risco de perder o cliente: ${names(m.eventsNoProposal)}. Avise de novo os profissionais da região.`, action: { id: 'renotify-events', label: 'Avisar os profissionais de novo', ids: m.eventsNoProposal.map(e => e.id) } });
  if (m.pendingApproval.length) items.push({ id: 'pending-approval', level: 'urgent', title: `${plural(m.pendingApproval.length, 'profissional esperando', 'profissionais esperando')} sua aprovação`, detail: `Cadastro completo: ${names(m.pendingApproval)}. Enquanto não aprova, eles não recebem pedidos.`, section: { id: 'providers', label: 'Revisar cadastros' } });
  if (m.proposalsWaiting.length) items.push({ id: 'proposals-waiting', level: 'attention', title: `${plural(m.proposalsWaiting.length, 'cliente ainda não escolheu', 'clientes ainda não escolheram')} a proposta`, detail: `Propostas paradas há mais de 48 h em ${names(m.proposalsWaiting)}. Um lembrete ajuda a fechar.`, action: { id: 'nudge-clients', label: 'Lembrar os clientes', ids: m.proposalsWaiting.map(e => e.id) } });
  if (m.trialsEnding.length) items.push({ id: 'trials-ending', level: 'attention', title: `${plural(m.trialsEnding.length, 'teste grátis acaba', 'testes grátis acabam')} em até 3 dias`, detail: `${names(m.trialsEnding)}. Bom momento para convidar a assinar.`, action: { id: 'nudge-trials', label: 'Convidar para assinar', ids: m.trialsEnding.map(p => p.id) } });
  if (m.incompleteProfiles.length) items.push({ id: 'incomplete-profiles', level: 'attention', title: `${plural(m.incompleteProfiles.length, 'profissional com cadastro incompleto', 'profissionais com cadastro incompleto')}`, detail: `${names(m.incompleteProfiles)} ${m.incompleteProfiles.length === 1 ? 'começou e parou' : 'começaram e pararam'} há 2 dias ou mais. Falta documento, fotos ou Pix.`, action: { id: 'nudge-profiles', label: 'Mandar lembrete', ids: m.incompleteProfiles.map(p => p.id) } });
  if (m.overdue.length) items.push({ id: 'overdue', level: 'attention', title: `${plural(m.overdue.length, 'assinatura vencida', 'assinaturas vencidas')}`, detail: `${names(m.overdue)}. O site já cobra sozinho; veja se vale um contato pessoal.`, section: { id: 'subscriptions', label: 'Ver assinaturas' } });
  if (m.socialErrors24h || m.googleErrorsToday) items.push({ id: 'automation-errors', level: 'info', title: 'Falhas na automação', detail: [m.socialErrors24h ? `${plural(m.socialErrors24h, 'resposta do robô das redes falhou', 'respostas do robô das redes falharam')} nas últimas 24 h` : '', m.googleErrorsToday ? `${plural(m.googleErrorsToday, 'aviso recusado', 'avisos recusados')} pelo Google hoje` : ''].filter(Boolean).join('; ') + '.', section: { id: 'automation', label: 'Ver automação' } });
  if (m.newClients24h || m.newProviders24h) items.push({ id: 'new-signups', level: 'info', title: 'Novos cadastros nas últimas 24 h', detail: `${plural(m.newClients24h, 'cliente', 'clientes')} e ${plural(m.newProviders24h, 'profissional', 'profissionais')}.` });
  return items;
}

/** Texto do resumo diário (painel, e-mail e WhatsApp do dono). */
export function dailySummary(m: OwnerMetrics, items = buildBrief(m)): string {
  const head = `Hoje: ${plural(m.activeProviders, 'profissional ativo', 'profissionais ativos')}, ${plural(m.openEvents, 'pedido aberto', 'pedidos abertos')}, ${brl(m.revenueMonthCents)} em assinaturas no mês.`;
  const todo = items.filter(i => i.level !== 'info');
  if (!todo.length) return `${head} Nada urgente: tudo em dia. ✅`;
  return `${head}\n${todo.map(i => `• ${i.title}`).join('\n')}`;
}

const plain = (t: string) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Resposta por regras para perguntas sobre a plataforma (sem IA). */
export function answerOwner(question: string, m: OwnerMetrics): string {
  const q = plain(question);
  const parts: string[] = [];
  if (/fatur|receita|dinheiro|entrou|ganh|assinatura|mensalidade|pagamento/.test(q)) parts.push(`Assinaturas pagas no mês: ${brl(m.revenueMonthCents)} (mês passado: ${brl(m.revenueLastMonthCents)}).${m.overdue.length ? ` ${plural(m.overdue.length, 'assinatura vencida', 'assinaturas vencidas')}: ${names(m.overdue)}.` : ''}`);
  if (/profission|fornecedor|garcom|chef|prestador|aprova/.test(q)) parts.push(`${plural(m.activeProviders, 'profissional ativo', 'profissionais ativos')}; ${m.pendingApproval.length} esperando aprovação; ${m.incompleteProfiles.length} com cadastro incompleto; ${m.newProviders24h} novos nas últimas 24 h.`);
  if (/client/.test(q)) parts.push(`${plural(m.totalClients, 'cliente cadastrado', 'clientes cadastrados')}; ${m.newClients24h} novos nas últimas 24 h; ${m.proposalsWaiting.length} com propostas esperando decisão.`);
  if (/pedido|evento|orcamento|proposta|fech/.test(q)) parts.push(`${plural(m.openEvents, 'pedido aberto', 'pedidos abertos')}; ${m.eventsNoProposal.length} sem proposta há mais de 24 h; ${plural(m.bookedThisMonth, 'serviço fechado', 'serviços fechados')} este mês.`);
  if (/teste|trial|venc/.test(q)) parts.push(m.trialsEnding.length ? `Testes acabando em até 3 dias: ${names(m.trialsEnding, 10)}.` : 'Nenhum teste grátis acaba nos próximos 3 dias.');
  if (/google|instagram|facebook|robo|automa|index/.test(q)) parts.push(`Google: ${m.googleErrorsToday} avisos recusados hoje. Robô das redes: ${m.socialErrors24h} falhas nas últimas 24 h.`);
  return parts.length ? parts.join('\n\n') : dailySummary(m);
}
