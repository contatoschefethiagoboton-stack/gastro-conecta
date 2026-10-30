import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, BadgePercent, Calculator, ChefHat, Leaf, Loader2, Minus, Plus, RotateCcw, Send, Sparkles, Trash2, TrendingUp, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import {
  calculateMealPrep, CLEANING_RATES, estimateAreaService, estimateBrigade, estimateIngredients, EVENT_STYLES, GARDEN_RATES, itemsTotalCents, MEAL_PREP_DEFAULTS, mealPrepInputFor,
  profitability, staffTotalCents, styleForEventType, type EstimateItem, type EventStyle, type MealPrepInput, type StaffItem,
} from "@shared/copilot";
import { SCOPE_LABELS, type ContractScope, type RequestCategory } from "@shared/services";
import { categoryLabel, centsInput, formatDate, formatMoney, parseCents, post, useAction, type EventItem } from "./common";

/** Campo numérico curto usado nas tabelas editáveis. */
function Num({ value, onChange, step = "1", label }: { value: number; onChange: (v: number) => void; step?: string; label: string }) {
  return <input className="cp-num" type="number" min="0" step={step} value={Number.isFinite(value) ? value : 0} aria-label={label} onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}/>;
}
function MoneyInput({ cents, onChange, label }: { cents: number; onChange: (c: number) => void; label: string }) {
  const [text, setText] = useState(centsInput(cents));
  useEffect(() => { setText(current => (parseCents(current) === cents ? current : centsInput(cents))); }, [cents]);
  return <input className="cp-num cp-money" inputMode="decimal" value={text} aria-label={label} onChange={e => { setText(e.target.value); const c = parseCents(e.target.value); if (c !== null) onChange(c); }}/>;
}

// ------------------------------------------------------------------ evento: ingredientes + brigada

export type EventCalc = { style: EventStyle; withAlcohol: boolean; items: EstimateItem[]; staff: StaffItem[] };
export function initialEventCalc(guests: number, type: string, withAlcohol = true): EventCalc {
  const style = styleForEventType(type);
  return { style, withAlcohol, items: estimateIngredients(guests, style, withAlcohol), staff: estimateBrigade(guests, style, withAlcohol) };
}

export function EventEstimator({ guests, value, onChange }: { guests: number; value: EventCalc; onChange: (v: EventCalc) => void }) {
  const regenerate = (style: EventStyle, withAlcohol: boolean) => onChange({ style, withAlcohol, items: estimateIngredients(guests, style, withAlcohol), staff: estimateBrigade(guests, style, withAlcohol) });
  const setItem = (i: number, patch: Partial<EstimateItem>) => onChange({ ...value, items: value.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  const setStaff = (i: number, patch: Partial<StaffItem>) => onChange({ ...value, staff: value.staff.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  return <div className="cp-block">
    <div className="cp-row">
      <label className="dash-field"><span>Estilo do serviço</span><select value={value.style} onChange={e => regenerate(e.target.value as EventStyle, value.withAlcohol)}>{EVENT_STYLES.map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="cp-check"><input type="checkbox" checked={value.withAlcohol} onChange={e => regenerate(value.style, e.target.checked)}/> Bebida alcoólica / bar</label>
      <button type="button" className="dash-small-button" onClick={() => regenerate(value.style, value.withAlcohol)}><Sparkles size={14}/> Recalcular sugestão</button>
    </div>
    <h4 className="cp-title"><UtensilsCrossed size={16}/> Ingredientes e porções para {guests} convidado(s)</h4>
    <div className="cp-table" role="table">
      <div className="cp-tr cp-th" role="row"><span>Item</span><span>Qtd.</span><span>Un.</span><span>Custo/un. (R$)</span><span>Subtotal</span><span/></div>
      {value.items.map((item, i) => <div className="cp-tr" role="row" key={`${item.key}-${i}`}>
        <input className="cp-name" value={item.name} aria-label="Item" onChange={e => setItem(i, { name: e.target.value })}/>
        <Num value={item.quantity} step="0.1" label={`Quantidade de ${item.name}`} onChange={v => setItem(i, { quantity: v })}/>
        <select value={item.unit} aria-label="Unidade" onChange={e => setItem(i, { unit: e.target.value })}><option value="kg">kg</option><option value="L">L</option><option value="un">un</option></select>
        <MoneyInput cents={item.unitCostCents} label={`Custo de ${item.name}`} onChange={c => setItem(i, { unitCostCents: c })}/>
        <strong>{formatMoney(Math.round(item.quantity * item.unitCostCents))}</strong>
        <button type="button" className="cp-icon" aria-label="Remover item" onClick={() => onChange({ ...value, items: value.items.filter((_, idx) => idx !== i) })}><Trash2 size={14}/></button>
      </div>)}
      <button type="button" className="dash-text-link" onClick={() => onChange({ ...value, items: [...value.items, { key: `extra-${Date.now()}`, name: "Novo item", quantity: 1, unit: "un", unitCostCents: 0 }] })}><Plus size={14}/> Adicionar item</button>
    </div>
    <p className="cp-total">Total de ingredientes: <strong>{formatMoney(itemsTotalCents(value.items))}</strong></p>
    <h4 className="cp-title"><ChefHat size={16}/> Brigada recomendada</h4>
    <div className="cp-table" role="table">
      <div className="cp-tr cp-th cp-staff" role="row"><span>Função</span><span>Pessoas</span><span>Diária (R$)</span><span>Subtotal</span><span/></div>
      {value.staff.map((s, i) => <div className="cp-tr cp-staff" role="row" key={`${s.role}-${i}`}>
        <input className="cp-name" value={s.role} aria-label="Função" onChange={e => setStaff(i, { role: e.target.value })}/>
        <Num value={s.count} label={`Pessoas em ${s.role}`} onChange={v => setStaff(i, { count: Math.round(v) })}/>
        <MoneyInput cents={s.dailyCents} label={`Diária de ${s.role}`} onChange={c => setStaff(i, { dailyCents: c })}/>
        <strong>{formatMoney(s.count * s.dailyCents)}</strong>
        <button type="button" className="cp-icon" aria-label="Remover função" onClick={() => onChange({ ...value, staff: value.staff.filter((_, idx) => idx !== i) })}><Trash2 size={14}/></button>
      </div>)}
      <button type="button" className="dash-text-link" onClick={() => onChange({ ...value, staff: [...value.staff, { role: "Nova função", count: 1, dailyCents: 15000 }] })}><Plus size={14}/> Adicionar função</button>
    </div>
    <p className="cp-total">Total da equipe: <strong>{formatMoney(staffTotalCents(value.staff))}</strong> · {value.staff.reduce((s, i) => s + i.count, 0)} pessoa(s)</p>
  </div>;
}

// ------------------------------------------------------------------ personal chef / marmitas

export function MealPrepCalculator({ value, onChange }: { value: MealPrepInput; onChange: (v: MealPrepInput) => void }) {
  const r = calculateMealPrep(value);
  const set = (patch: Partial<MealPrepInput>) => onChange({ ...value, ...patch });
  return <div className="cp-block">
    <div className="cp-grid">
      <label className="dash-field"><span>Total de refeições</span><Num value={value.meals} label="Refeições" onChange={v => set({ meals: Math.round(v) })}/></label>
      <label className="dash-field"><span>Refeições por kit</span><Num value={value.mealsPerKit} label="Refeições por kit" onChange={v => set({ mealsPerKit: Math.max(1, Math.round(v)) })}/></label>
      <label className="dash-field"><span>Ingredientes por refeição (R$)</span><MoneyInput cents={value.ingredientCostPerMealCents} label="Ingredientes por refeição" onChange={c => set({ ingredientCostPerMealCents: c })}/></label>
      <label className="dash-field"><span>Embalagem por refeição (R$)</span><MoneyInput cents={value.packagingPerMealCents} label="Embalagem" onChange={c => set({ packagingPerMealCents: c })}/></label>
      <label className="dash-field"><span>Distância por viagem (km ida+volta)</span><Num value={value.distanceKm} label="Distância" onChange={v => set({ distanceKm: v })}/></label>
      <label className="dash-field"><span>Viagens</span><Num value={value.trips} label="Viagens" onChange={v => set({ trips: Math.round(v) })}/></label>
      <label className="dash-field"><span>Custo por km (R$)</span><MoneyInput cents={value.costPerKmCents} label="Custo por km" onChange={c => set({ costPerKmCents: c })}/></label>
      <label className="dash-field"><span>Horas de trabalho</span><Num value={value.laborHours} step="0.5" label="Horas" onChange={v => set({ laborHours: v })}/></label>
      <label className="dash-field"><span>Valor da sua hora (R$)</span><MoneyInput cents={value.hourlyCents} label="Valor da hora" onChange={c => set({ hourlyCents: c })}/></label>
      <label className="dash-field"><span>Margem (%)</span><Num value={value.marginPercent} label="Margem" onChange={v => set({ marginPercent: v })}/></label>
    </div>
    <div className="cp-summary">
      <span>Ingredientes <b>{formatMoney(r.ingredientsCents)}</b></span><span>Embalagens <b>{formatMoney(r.packagingCents)}</b></span><span>Deslocamento <b>{formatMoney(r.transportCents)}</b></span><span>Mão de obra <b>{formatMoney(r.laborCents)}</b></span>
      <span>Custo total <b>{formatMoney(r.costCents)}</b></span><span className="cp-highlight">Preço sugerido <b>{formatMoney(r.priceCents)}</b></span><span>Por refeição <b>{formatMoney(r.perMealCents)}</b></span><span>Por kit ({value.mealsPerKit}) <b>{formatMoney(r.perKitCents)}</b> · {r.kits} kit(s)</span>
    </div>
  </div>;
}

// ------------------------------------------------------------------ limpeza e jardinagem

export type AreaCalc = { kind: string; areaM2: number; hours: number; people: number; hourlyCents: number; billing: "hora" | "diária"; dailyCents: number };
const ratesFor = (category: "cleaning" | "gardening") => (category === "cleaning" ? CLEANING_RATES : GARDEN_RATES) as Record<string, { m2PerHour: number; hourlyCents: number }>;
export function initialAreaCalc(category: "cleaning" | "gardening", kind: string | undefined, areaM2: number): AreaCalc {
  const rates = ratesFor(category);
  const k = kind && rates[kind] ? kind : Object.keys(rates)[0];
  const e = estimateAreaService(areaM2, rates[k]);
  return { kind: k, areaM2, hours: e.hours, people: e.people, hourlyCents: e.hourlyCents, billing: e.billing, dailyCents: e.dailyCents };
}
export const areaTotalCents = (a: AreaCalc) => (a.billing === "diária" ? a.dailyCents * a.people * Math.max(1, Math.ceil(a.hours / 8)) : Math.round(a.hourlyCents * a.hours * a.people));

export function AreaCalculator({ category, value, onChange }: { category: "cleaning" | "gardening"; value: AreaCalc; onChange: (v: AreaCalc) => void }) {
  const rates = ratesFor(category);
  return <div className="cp-block">
    <div className="cp-grid">
      <label className="dash-field"><span>Tipo</span><select value={value.kind} onChange={e => onChange(initialAreaCalc(category, e.target.value, value.areaM2))}>{Object.keys(rates).map(k => <option key={k}>{k}</option>)}</select></label>
      <label className="dash-field"><span>Área (m²)</span><Num value={value.areaM2} label="Área" onChange={v => onChange(initialAreaCalc(category, value.kind, v))}/></label>
      <label className="dash-field"><span>Horas por pessoa</span><Num value={value.hours} step="0.5" label="Horas" onChange={v => onChange({ ...value, hours: v })}/></label>
      <label className="dash-field"><span>Pessoas</span><Num value={value.people} label="Pessoas" onChange={v => onChange({ ...value, people: Math.max(1, Math.round(v)) })}/></label>
      <label className="dash-field"><span>Cobrança</span><select value={value.billing} onChange={e => onChange({ ...value, billing: e.target.value as AreaCalc["billing"] })}><option value="hora">Por hora</option><option value="diária">Por diária</option></select></label>
      <label className="dash-field"><span>Valor da hora (R$)</span><MoneyInput cents={value.hourlyCents} label="Valor da hora" onChange={c => onChange({ ...value, hourlyCents: c })}/></label>
      <label className="dash-field"><span>Valor da diária (R$)</span><MoneyInput cents={value.dailyCents} label="Valor da diária" onChange={c => onChange({ ...value, dailyCents: c })}/></label>
    </div>
    <p className="cp-total">Sugestão: <strong>{formatMoney(areaTotalCents(value))}</strong> ({value.people} pessoa(s), {value.hours}h cada, cobrança por {value.billing}). Referência: {rates[value.kind]?.m2PerHour} m²/hora por pessoa.</p>
  </div>;
}

// ------------------------------------------------------------------ lucro e prejuízo

export function ProfitBox({ priceCents, costCents }: { priceCents: number; costCents: number }) {
  const p = profitability(priceCents, costCents);
  return <div className={`cp-profit ${p.loss ? "is-loss" : p.lowMargin ? "is-low" : "is-ok"}`} role="status">
    {p.loss ? <AlertTriangle size={18}/> : <TrendingUp size={18}/>}
    <div><strong>{p.loss ? "Atenção: esta proposta dá prejuízo" : p.lowMargin ? "Margem baixa" : "Proposta lucrativa"}</strong><span>Valor {formatMoney(priceCents)} − custos {formatMoney(costCents)} = lucro líquido <b>{formatMoney(p.profitCents)}</b> ({p.marginPercent}%)</span></div>
  </div>;
}

// ------------------------------------------------------------------ ajuste sobre a sugestão da plataforma

function PriceAdjuster({ platformCents, amountCents, copilotCents, onChange }: { platformCents: number; amountCents: number; copilotCents: number; onChange: (cents: number) => void }) {
  const diff = Math.round(((amountCents - platformCents) / platformCents) * 1000) / 10;
  const step = (percent: number) => onChange(Math.max(100, Math.round((amountCents * (1 + percent / 100)) / 100) * 100));
  return <div className="cp-adjust" role="group" aria-label="Ajustar valor">
    <div><span>Valor sugerido pela plataforma</span><strong>{formatMoney(platformCents)}</strong><small>{diff === 0 ? "Sua proposta está igual à sugestão." : `Sua proposta está ${Math.abs(diff).toLocaleString("pt-BR")}% ${diff > 0 ? "acima" : "abaixo"} da sugestão.`} O cliente compara as propostas e escolhe a melhor.</small></div>
    <div className="cp-adjust-buttons">
      <button type="button" className="dash-small-button dash-ghost-button" onClick={() => step(-10)}><Minus size={13}/> 10%</button>
      <button type="button" className="dash-small-button dash-ghost-button" onClick={() => step(-5)}><Minus size={13}/> 5%</button>
      <button type="button" className="dash-small-button" onClick={() => step(5)}><Plus size={13}/> 5%</button>
      <button type="button" className="dash-small-button" onClick={() => step(10)}><Plus size={13}/> 10%</button>
      <button type="button" className="dash-small-button dash-ghost-button" onClick={() => onChange(platformCents)}><RotateCcw size={13}/> Sugestão</button>
      {copilotCents > 0 && copilotCents !== platformCents && <button type="button" className="dash-small-button dash-ghost-button" onClick={() => onChange(copilotCents)}><Calculator size={13}/> Usar cálculo do Copilot</button>}
    </div>
  </div>;
}

// ------------------------------------------------------------------ montar e enviar proposta

export function ProposalComposer({ event, onClose }: { event: EventItem; onClose: () => void }) {
  const { busy, run } = useAction();
  const category = event.category as RequestCategory;
  const [scope, setScope] = useState<ContractScope>(event.scope === "full" ? "full" : "labor");
  const [eventCalc, setEventCalc] = useState<EventCalc>(() => initialEventCalc(event.guests, event.type, event.details?.withAlcohol !== false));
  const [meal, setMeal] = useState<MealPrepInput>(() => mealPrepInputFor(Math.max(1, Number(event.details?.mealsPerWeek ?? 10) * Number(event.details?.weeks ?? 1))));
  const [area, setArea] = useState<AreaCalc>(() => initialAreaCalc(category === "gardening" ? "gardening" : "cleaning", event.details?.propertyKind, Number(event.details?.areaM2 ?? 80)));
  const [extraCents, setExtraCents] = useState(0);
  const [margin, setMargin] = useState(30);
  const [discount, setDiscount] = useState(0);
  // Valor sugerido pela plataforma com base no pedido; o profissional pode aumentar ou diminuir.
  const platformCents = Number(event.details?.suggestedCents) || 0;
  const [amountText, setAmountText] = useState(() => (platformCents > 0 ? centsInput(platformCents) : ""));
  const [message, setMessage] = useState("");
  const [terms, setTerms] = useState("50% via Pix na confirmação e 50% até o dia do serviço.");
  const [time, setTime] = useState(event.time ?? "");

  const costCents = useMemo(() => {
    if (category === "mealPrep") return calculateMealPrep(meal).costCents + extraCents;
    if (category === "cleaning" || category === "gardening") return extraCents;
    return staffTotalCents(eventCalc.staff) + (scope === "full" ? itemsTotalCents(eventCalc.items) : 0) + extraCents;
  }, [category, meal, eventCalc, scope, extraCents]);
  const suggestedCents = useMemo(() => {
    const base = category === "mealPrep" ? calculateMealPrep(meal).priceCents + extraCents
      : category === "cleaning" || category === "gardening" ? areaTotalCents(area) + extraCents
      : Math.round(costCents * (1 + margin / 100));
    return Math.round(base * (1 - discount / 100));
  }, [category, meal, area, costCents, margin, extraCents, discount]);
  const amountCents = parseCents(amountText) ?? suggestedCents;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (amountCents <= 0) { toast.error("Informe o valor da proposta."); return; }
    const breakdown = { category, scope, margin, discount, extraCents, ...(category === "event" ? { eventCalc } : category === "mealPrep" ? { meal } : { area }) };
    const ok = await run("send-proposal", () => post("/proposals", { eventId: event.id, amountCents, costCents, message, paymentTerms: terms, scope, ...(time ? { eventTime: time } : {}), breakdown }), "Proposta enviada ao cliente.");
    if (ok) onClose();
  };

  return <form className="dash-card cp-composer" onSubmit={submit}>
    <div className="dash-card-heading"><div><span className="dash-eyebrow">Copilot · {categoryLabel[category]}</span><h3>Proposta para “{event.title}”</h3><p className="dash-muted">{event.type} · {event.city} · {event.guests} pessoa(s) · {formatDate(event.date)}{event.time ? ` às ${event.time}` : ""} · orçamento do cliente {formatMoney(event.budgetCents)}</p></div><Calculator size={20}/></div>
    {event.clientTag === "Cliente Antigo" && <div className="dash-alert dash-alert-success"><BadgePercent size={17}/> Cliente antigo ({event.clientPreviousEvents} serviço(s) fechado(s) na plataforma). Que tal oferecer um desconto de fidelidade ou um pacote especial? <button type="button" className="dash-small-button" onClick={() => { setDiscount(5); setAmountText(""); }}>Aplicar 5%</button><button type="button" className="dash-small-button" onClick={() => { setDiscount(10); setAmountText(""); }}>Aplicar 10%</button></div>}
    {event.description && <p className="cp-note">“{event.description}”</p>}
    {category === "event" && <>
      <label className="dash-field"><span>Escopo do contrato</span><select value={scope} onChange={e => setScope(e.target.value as ContractScope)}>{(Object.keys(SCOPE_LABELS) as ContractScope[]).map(s => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}</select><small className="dash-field-help">{scope === "labor" ? "Só mão de obra: os ingredientes servem como lista de compras para o cliente e não entram no seu custo." : "Serviço completo: ingredientes, louças e utensílios entram no seu custo."}</small></label>
      <EventEstimator guests={event.guests} value={eventCalc} onChange={setEventCalc}/>
    </>}
    {category === "mealPrep" && <MealPrepCalculator value={meal} onChange={setMeal}/>}
    {(category === "cleaning" || category === "gardening") && <AreaCalculator category={category} value={area} onChange={setArea}/>}
    <div className="dash-form-grid">
      <label className="dash-field"><span>Outros custos (transporte, gás, aluguel…) R$</span><MoneyInput cents={extraCents} label="Outros custos" onChange={setExtraCents}/></label>
      {category === "event" && <label className="dash-field"><span>Margem desejada (%)</span><Num value={margin} label="Margem" onChange={setMargin}/></label>}
      <label className="dash-field"><span>Desconto (%)</span><Num value={discount} label="Desconto" onChange={v => setDiscount(Math.min(100, v))}/></label>
      <label className="dash-field"><span>Valor da proposta (R$)</span><input inputMode="decimal" value={amountText} placeholder={centsInput(suggestedCents)} onChange={e => setAmountText(e.target.value)}/><small className="dash-field-help">{platformCents > 0 ? `Sugestão da plataforma: ${formatMoney(platformCents)} · cálculo do Copilot: ${formatMoney(suggestedCents)}.` : `Sugestão do Copilot: ${formatMoney(suggestedCents)}. Você pode alterar.`}</small></label>
      <label className="dash-field"><span>Horário</span><input type="time" value={time} onChange={e => setTime(e.target.value)}/></label>
    </div>
    {platformCents > 0 && <PriceAdjuster platformCents={platformCents} amountCents={amountCents} copilotCents={suggestedCents} onChange={c => setAmountText(centsInput(c))}/>}
    <ProfitBox priceCents={amountCents} costCents={costCents}/>
    <label className="dash-field"><span>Condições de pagamento</span><input required value={terms} onChange={e => setTerms(e.target.value)} maxLength={600}/></label>
    <label className="dash-field"><span>Mensagem ao cliente</span><textarea required rows={4} value={message} onChange={e => setMessage(e.target.value)} placeholder="Cardápio, o que está incluso, equipe, diferenciais e disponibilidade." maxLength={5000}/></label>
    <div className="cp-actions"><button type="button" className="dash-outline-button" onClick={onClose}>Cancelar</button><button className="dash-primary-button" type="submit" disabled={busy === "send-proposal"}>{busy === "send-proposal" ? <Loader2 className="dash-spinner" size={16}/> : <Send size={16}/>} Enviar proposta de {formatMoney(amountCents)}</button></div>
  </form>;
}

// ------------------------------------------------------------------ calculadoras avulsas

export function CalculatorsPanel() {
  const [tab, setTab] = useState<"event" | "mealPrep" | "cleaning" | "gardening">("event");
  const [guests, setGuests] = useState(100);
  const [eventCalc, setEventCalc] = useState<EventCalc>(() => initialEventCalc(100, "Jantar"));
  const [meal, setMeal] = useState<MealPrepInput>(MEAL_PREP_DEFAULTS);
  const [cleaning, setCleaning] = useState<AreaCalc>(() => initialAreaCalc("cleaning", undefined, 80));
  const [garden, setGarden] = useState<AreaCalc>(() => initialAreaCalc("gardening", undefined, 200));
  const tabs = [{ id: "event", label: "Evento", icon: UtensilsCrossed }, { id: "mealPrep", label: "Marmitas", icon: ChefHat }, { id: "cleaning", label: "Limpeza", icon: Sparkles }, { id: "gardening", label: "Jardinagem", icon: Leaf }] as const;
  return <div className="dash-stack">
    <div className="dash-section-intro"><div><span className="dash-eyebrow">Copilot</span><h2>Calculadoras inteligentes.</h2><p>Estimativas de ingredientes, porções, brigada, marmitas, limpeza e jardinagem. Tudo editável — use como ponto de partida para suas propostas.</p></div></div>
    <div className="dash-admin-tabs" role="tablist">{tabs.map(t => { const Icon = t.icon; return <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "is-active" : ""} onClick={() => setTab(t.id)}><Icon size={16}/> {t.label}</button>; })}</div>
    <section className="dash-card">
      {tab === "event" && <><label className="dash-field cp-guests"><span>Convidados</span><Num value={guests} label="Convidados" onChange={v => { const n = Math.max(1, Math.round(v)); setGuests(n); setEventCalc(c => ({ ...c, items: estimateIngredients(n, c.style, c.withAlcohol), staff: estimateBrigade(n, c.style, c.withAlcohol) })); }}/></label><EventEstimator guests={guests} value={eventCalc} onChange={setEventCalc}/><p className="cp-total">Custo total (equipe + ingredientes): <strong>{formatMoney(itemsTotalCents(eventCalc.items) + staffTotalCents(eventCalc.staff))}</strong></p></>}
      {tab === "mealPrep" && <MealPrepCalculator value={meal} onChange={setMeal}/>}
      {tab === "cleaning" && <AreaCalculator category="cleaning" value={cleaning} onChange={setCleaning}/>}
      {tab === "gardening" && <AreaCalculator category="gardening" value={garden} onChange={setGarden}/>}
    </section>
  </div>;
}
