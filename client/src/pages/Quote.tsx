import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, ArrowRight, Check, CalendarDays, MapPin, Users, Utensils, PartyPopper, BriefcaseBusiness, Heart, Coffee, Loader2, CheckCircle2, ShieldCheck, MessageCircle, ChefHat, Sparkles, Leaf, Flame } from 'lucide-react';
import { api, type CurrentUser, money } from '@/lib/api';
import { toast } from 'sonner';
import { CLEANING_KINDS, GARDEN_KINDS, MEAL_PLANS, type RequestCategory } from '@shared/services';
import { useSite } from '@/lib/site';

const categories: Array<{ id: RequestCategory; name: string; text: string; icon: typeof Utensils }> = [
  { id: 'event', name: 'Evento ou jantar', text: 'Chefs, cozinheiros, garçons e barmans', icon: Utensils },
  { id: 'mealPrep', name: 'Personal chef', text: 'Marmitas semanais, fit, low-carb e congelados', icon: ChefHat },
  { id: 'cleaning', name: 'Limpeza', text: 'Residencial, pesada, restaurante e pós-evento', icon: Sparkles },
  { id: 'gardening', name: 'Jardinagem', text: 'Manutenção e paisagismo', icon: Leaf },
];
const eventTypes = [{ name: 'Jantar em casa', icon: Utensils }, { name: 'Churrasco', icon: Flame }, { name: 'Aniversário', icon: PartyPopper }, { name: 'Casamento', icon: Heart }, { name: 'Evento corporativo', icon: BriefcaseBusiness }, { name: 'Confraternização', icon: Coffee }, { name: 'Outra ocasião', icon: CalendarDays }];
const initial = { category: 'event' as RequestCategory, type: 'Jantar em casa', title: '', date: '', time: '', city: '', location: '', guests: '10', budget: '2000', description: '', stage: 'ready' as 'ready' | 'comparing' | 'research', scope: 'either' as 'labor' | 'full' | 'either', withAlcohol: true, mealPlan: 'Semanal', mealsPerWeek: '10', weeks: '1', restrictions: '', propertyKind: 'Residencial', areaM2: '80' };
const typeOptions = (category: RequestCategory) => category === 'event' ? eventTypes.map(t => t.name) : category === 'mealPrep' ? [...MEAL_PLANS] : category === 'cleaning' ? [...CLEANING_KINDS] : [...GARDEN_KINDS];

export default function Quote() {
  const [, navigate] = useLocation();
  const site = useSite();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => {
    let draft = initial;
    try { draft = { ...initial, ...JSON.parse(sessionStorage.getItem('gc-quote-draft') || '{}') }; } catch { /* rascunho inválido */ }
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('categoria') as RequestCategory | null;
    if (cat && categories.some(c => c.id === cat)) draft = { ...draft, category: cat, type: typeOptions(cat)[0] };
    const preset = params.get('ocasiao');
    if (preset && eventTypes.some(t => t.name === preset)) draft = { ...draft, category: 'event', type: preset };
    return draft;
  });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<number | null>(null);
  useEffect(() => { try { sessionStorage.setItem('gc-quote-draft', JSON.stringify(form)); } catch { /* armazenamento indisponível */ } }, [form]);
  const field = (name: keyof typeof initial, value: string | boolean) => setForm({ ...form, [name]: value });
  const isEvent = form.category === 'event', isMeal = form.category === 'mealPrep', isArea = form.category === 'cleaning' || form.category === 'gardening';
  const people = isArea ? 1 : Number(form.guests);
  function next() {
    if (step === 2) {
      if (!form.city.trim()) return toast.error('Informe a cidade.');
      if (!isArea && (people < 1 || people > 10000)) return toast.error('Informe entre 1 e 10.000 pessoas.');
      if (form.date && new Date(form.date + 'T23:59:59') < new Date()) return toast.error('Escolha uma data futura.');
      if (Number(form.budget) < 0) return toast.error('O orçamento não pode ser negativo.');
    }
    setStep(step + 1);
  }
  async function submit() {
    setBusy(true);
    try {
      const { user } = await api<{ user: CurrentUser | null }>('/me');
      if (!user) { toast.info('Crie sua conta grátis ou entre para enviar. Seu pedido está salvo.'); navigate('/conta?returnTo=orcamento'); return; }
      if (user.accountType !== 'client') { toast.error('Pedidos são feitos por contas de cliente.'); return; }
      const details = isEvent ? { withAlcohol: form.withAlcohol } : isMeal ? { mealPlan: form.mealPlan, mealsPerWeek: Math.max(1, Number(form.mealsPerWeek) || 1), weeks: Math.max(1, Number(form.weeks) || 1), ...(form.restrictions.trim() ? { restrictions: form.restrictions.trim() } : {}) } : { propertyKind: form.type, areaM2: Math.max(1, Number(form.areaM2) || 1) };
      const { event } = await api<{ event: { id: number } }>('/events', { method: 'POST', body: JSON.stringify({ category: form.category, title: form.title.trim() || `${form.type} em ${form.city}`, type: form.type, date: form.date || undefined, time: form.time || undefined, city: form.city, location: form.location, guests: people, budgetCents: Math.round(Number(form.budget) * 100), description: form.description, stage: form.stage, scope: isEvent ? form.scope : undefined, details, professionalId: new URLSearchParams(window.location.search).get('profissional') || undefined }) });
      sessionStorage.removeItem('gc-quote-draft'); setCreated(event.id);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível enviar seu pedido.'); } finally { setBusy(false); }
  }
  const contactLink = site.wa('Olá, equipe GastroConecta! Quero ajuda para montar meu pedido.');
  if (created !== null) return <main className="wrap quote-success"><div className="success-icon"><CheckCircle2 size={42}/></div><span className="eyebrow">SEU PEDIDO JÁ ESTÁ NO RADAR</span><h1>Agora é só aguardar<br/>as propostas.</h1><p>O pedido <strong>#{created}</strong> foi publicado para os profissionais da região. Acompanhe as propostas no seu painel e aceite a que preferir.</p><Link href="/painel?aba=requests" className="btn btn-primary">Acompanhar meu pedido <ArrowRight size={18}/></Link><a className="btn btn-outline quote-whatsapp" href={contactLink} target="_blank" rel="noopener noreferrer"><MessageCircle size={18}/> Fale Conosco</a><span className="fine-print">Para clientes é grátis. O pagamento do serviço é feito direto ao profissional.</span></main>;
  return <main className="quote-page wrap"><div className="breadcrumb"><Link href="/">Início</Link><span>/</span><span>Pedir orçamento</span></div><div className="quote-layout">
    <aside className="quote-intro"><span className="eyebrow">BONS MOMENTOS COMEÇAM AQUI</span><h1>Do que você<br/>precisa<br/><span>hoje?</span></h1><p>Conte sua ideia e receba propostas de profissionais da sua região.</p><div className="quote-benefit"><ShieldCheck size={22}/><span>100% grátis para clientes.<br/>Você decide com quem fechar.</span></div><div className="quote-benefit"><Check size={22}/><span>Seu rascunho fica salvo<br/>enquanto você planeja.</span></div><a className="quote-whatsapp-link" href={contactLink} target="_blank" rel="noopener noreferrer"><MessageCircle size={18}/><span>Ficou com alguma dúvida?<br/><strong>Fale Conosco</strong></span></a></aside>
    <section className="quote-form"><div className="stepper">{['O serviço', 'Os detalhes', 'Sua ideia'].map((label, i) => <div key={label} className={step >= i + 1 ? 'step-current' : ''}><span>{step > i + 1 ? <Check size={15}/> : i + 1}</span><strong>{label}</strong></div>)}</div>
      <form onSubmit={e => { e.preventDefault(); step < 3 ? next() : void submit(); }}>
        {step === 1 && <><span className="form-kicker">PASSO 01 DE 03</span><h2>Qual serviço você procura?</h2><p className="form-description">Escolha a categoria e o tipo.</p>
          <div className="occasion-options quote-categories">{categories.map(({ id, name, text, icon: Icon }) => <button type="button" key={id} className={form.category === id ? 'chosen' : ''} onClick={() => setForm({ ...form, category: id, type: typeOptions(id)[0], ...(id === 'cleaning' ? { propertyKind: 'Residencial' } : id === 'gardening' ? { propertyKind: 'Manutenção' } : {}) })}><Icon size={24}/><span>{name}<small>{text}</small></span>{form.category === id && <Check size={14}/>}</button>)}</div>
          {isEvent ? <div className="occasion-options">{eventTypes.map(({ name, icon: Icon }) => <button type="button" key={name} className={form.type === name ? 'chosen' : ''} onClick={() => field('type', name)}><Icon size={24}/><span>{name}</span>{form.type === name && <Check size={14}/>}</button>)}</div>
            : <label className="form-label">{isMeal ? 'Tipo de plano' : 'Tipo de serviço'}<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value, ...(isMeal ? { mealPlan: e.target.value } : { propertyKind: e.target.value }) })}>{typeOptions(form.category).map(o => <option key={o}>{o}</option>)}</select></label>}
          <label className="form-label">Dê um nome ao pedido <span>(opcional)</span><input value={form.title} onChange={e => field('title', e.target.value)} placeholder={isMeal ? 'Ex.: Marmitas fit da semana' : isArea ? 'Ex.: Limpeza do apartamento' : 'Ex.: Um jantar especial entre amigos'} maxLength={120}/></label></>}
        {step === 2 && <><span className="form-kicker">PASSO 02 DE 03</span><h2>Vamos aos detalhes.</h2><p className="form-description">Quanto mais você contar, melhores as propostas.</p>
          <div className="form-two"><label className="form-label">{isMeal ? 'Início' : 'Data'} <span>(opcional)</span><input type="date" value={form.date} min={new Date().toISOString().slice(0, 10)} onChange={e => field('date', e.target.value)}/></label><label className="form-label">Horário <span>(opcional)</span><input type="time" value={form.time} onChange={e => field('time', e.target.value)}/></label></div>
          {!isArea && <label className="form-label">{isMeal ? 'Pessoas que vão comer' : 'Número de convidados'}<input type="number" min="1" max="10000" required value={form.guests} onChange={e => field('guests', e.target.value)}/></label>}
          {isMeal && <div className="form-two"><label className="form-label">Refeições por semana<input type="number" min="1" max="200" value={form.mealsPerWeek} onChange={e => field('mealsPerWeek', e.target.value)}/></label><label className="form-label">Quantas semanas<input type="number" min="1" max="52" value={form.weeks} onChange={e => field('weeks', e.target.value)}/></label></div>}
          {isMeal && <label className="form-label">Restrições alimentares <span>(opcional)</span><input value={form.restrictions} onChange={e => field('restrictions', e.target.value)} placeholder="Ex.: sem lactose, vegetariano" maxLength={300}/></label>}
          {isArea && <label className="form-label">Tamanho aproximado (m²)<input type="number" min="1" max="1000000" value={form.areaM2} onChange={e => field('areaM2', e.target.value)}/></label>}
          {isEvent && <><label className="form-label">O que você precisa?<select value={form.scope} onChange={e => field('scope', e.target.value)}><option value="either">Tanto faz, quero ver as propostas</option><option value="labor">Só a mão de obra (eu forneço ingredientes, louças e utensílios)</option><option value="full">Serviço completo (com ingredientes, louças, talheres, copos e utensílios)</option></select></label><label className="form-label form-check"><input type="checkbox" checked={form.withAlcohol} onChange={e => field('withAlcohol', e.target.checked)}/> Vai ter bebida alcoólica / bar</label></>}
          <label className="form-label">Cidade<input required value={form.city} onChange={e => field('city', e.target.value)} placeholder="Ex.: Campinas, SP" maxLength={100}/></label>
          <label className="form-label">Endereço ou bairro <span>(opcional; só o profissional contratado vê)</span><input value={form.location} onChange={e => field('location', e.target.value)} placeholder="Ex.: Cambuí" maxLength={200}/></label>
          <label className="form-label">Orçamento total estimado (R$)<input type="number" min="0" max="1000000" step="1" value={form.budget} onChange={e => field('budget', e.target.value)}/></label>
          <p className="fine-print">Ainda pesquisando? Deixe a data em branco e informe 0 no orçamento se não tiver um valor definido.</p></>}
        {step === 3 && <><span className="form-kicker">PASSO 03 DE 03</span><h2>Um toque pessoal.</h2><p className="form-description">O que faria esse serviço ser perfeito?</p>
          <label className="form-label">Conte sua ideia<textarea rows={4} value={form.description} onChange={e => field('description', e.target.value)} placeholder={isEvent ? 'Cardápio, restrições alimentares, estilo do serviço…' : isMeal ? 'Pratos preferidos, objetivos (emagrecer, ganhar massa)…' : 'Cômodos, materiais, frequência, observações…'} maxLength={2000}/></label>
          <label className="form-label">Em qual etapa você está?<select value={form.stage} onChange={e => field('stage', e.target.value)}><option value="ready">Pronto para contratar</option><option value="comparing">Comparando propostas</option><option value="research">Pesquisando possibilidades</option></select></label>
          <div className="quote-summary"><strong>{form.title || form.type}</strong><span><MapPin size={15}/>{form.city}{form.location ? ` · ${form.location}` : ''}</span><span><Users size={15}/>{isArea ? `${form.areaM2} m²` : `${form.guests} pessoa(s)`} · {form.date ? new Date(form.date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data a definir'}{form.time ? ` às ${form.time}` : ''}</span><span>Orçamento estimado: {money(Number(form.budget))}</span></div>
          <p className="fine-print">Ao enviar, seu pedido aparece no radar dos profissionais compatíveis. Nenhum pagamento é cobrado de clientes. <Link href="/termos">Consulte os termos.</Link></p></>}
        <div className="form-footer">{step > 1 ? <button type="button" className="text-link" onClick={() => setStep(step - 1)}><ArrowLeft size={17}/> Voltar</button> : <span className="fine-print">Leva só alguns minutos.</span>}<button className="btn btn-primary" type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={18}/> : step === 3 ? 'Enviar meu pedido' : 'Continuar'}{!busy && <ArrowRight size={18}/>}</button></div>
      </form></section></div></main>;
}
