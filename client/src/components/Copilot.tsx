import { api } from "@/lib/api";
import { ArrowRight, Bot, MessageCircle, RefreshCw, Send, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";
import { useLocation } from "wouter";
import type { CopilotNudge } from "@shared/copilotGoals";
import "../dashboard.css";

type CopilotRole = "user" | "assistant";
type CopilotMessage = { id: number; role: CopilotRole; content: string; createdAt: string };
type MeResponse = { user: { id: number } | null };
type MessagesResponse = { messages: CopilotMessage[] };
type CopilotResponse = { reply: string };
type NudgeResponse = { nudge: CopilotNudge; proactive: boolean };

const VISITOR_KEY = "copilot.visitor.history";
const SEEN_KEY = "copilot.nudge.seen";
const BUBBLE_DELAY_MS = 6000;

// Links do assistente são caminhos do site (/orcamento, /painel…): o Streamdown só libera
// links relativos quando conhece a origem. Sem HTML cru nas respostas.
const hardenEntry = defaultRehypePlugins.harden as [unknown, Record<string, unknown>];
const rehypePlugins = [[hardenEntry[0], { ...hardenEntry[1], defaultOrigin: typeof window === "undefined" ? "https://eventosconecta.com.br" : window.location.origin }]] as any;

const storage = {
  get(key: string) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { sessionStorage.setItem(key, value); } catch { /* sem armazenamento */ } },
};

function readVisitorHistory(): CopilotMessage[] {
  try {
    const parsed = JSON.parse(storage.get(VISITOR_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(m => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string").slice(-30) : [];
  } catch { return []; }
}

function readableError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível conectar ao assistente.";
}

export default function Copilot() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVisitor, setIsVisitor] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryText, setRetryText] = useState("");
  const [nudge, setNudge] = useState<CopilotNudge | null>(null);
  const [bubble, setBubble] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Próximo passo de fechamento (funciona com ou sem IA). Atualiza a cada página.
  useEffect(() => {
    let alive = true;
    let timer = 0;
    api<NudgeResponse>("/copilot/nudge").then(data => {
      if (!alive) return;
      setNudge(data.nudge);
      if (data.proactive && storage.get(SEEN_KEY) !== data.nudge.id) timer = window.setTimeout(() => setBubble(true), BUBBLE_DELAY_MS);
    }).catch(() => undefined);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [location]);

  const markSeen = () => { if (nudge) storage.set(SEEN_KEY, nudge.id); setBubble(false); };

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    setErrorMessage("");
    setRetryText("");
    try {
      const me = await api<MeResponse>("/me");
      if (!me.user) {
        setIsVisitor(true);
        setMessages(readVisitorHistory());
        return;
      }
      setIsVisitor(false);
      const history = await api<MessagesResponse>("/messages");
      setMessages(history.messages ?? []);
    } catch (error: unknown) {
      setErrorMessage(readableError(error));
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    markSeen();
    void loadHistory();
  }, [isOpen, location]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    if (isVisitor) storage.set(VISITOR_KEY, JSON.stringify(messages.slice(-30)));
  }, [messages, isVisitor]);

  const sendMessage = async (text = draft) => {
    const message = text.trim();
    if (!message || isSending) return;
    const optimistic: CopilotMessage = { id: Date.now(), role: "user", content: message, createdAt: new Date().toISOString() };
    // O visitante manda o próprio histórico (nada fica gravado no servidor).
    const history = isVisitor ? [...(nudge && messages.length === 0 ? [{ role: "assistant" as const, content: nudge.message }] : []), ...messages.map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))].slice(-12) : undefined;
    setMessages(current => [...current, optimistic]);
    setDraft("");
    setRetryText("");
    setErrorMessage("");
    setIsSending(true);
    try {
      const response = await api<CopilotResponse>("/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, ...(history ? { history } : {}) }) });
      setMessages(current => [...current, { id: Date.now() + 1, role: "assistant", content: response.reply, createdAt: new Date().toISOString() }]);
    } catch (error: unknown) {
      setMessages(current => current.filter(item => item.id !== optimistic.id));
      setRetryText(message);
      setErrorMessage(readableError(error));
    } finally {
      setIsSending(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void sendMessage(); };
  const empty = !isLoadingHistory && messages.length === 0;

  return (
    <div className="copilot-root">
      {!isOpen && bubble && nudge && (
        <div className="copilot-bubble" role="status">
          <button className="copilot-bubble-close" type="button" onClick={markSeen} aria-label="Dispensar"><X size={14} /></button>
          <p>{nudge.message}</p>
          <div className="copilot-bubble-actions">
            <a className="copilot-cta" href={nudge.action.href} onClick={markSeen}>{nudge.action.label} <ArrowRight size={13} /></a>
            <button type="button" className="copilot-link" onClick={() => setIsOpen(true)}>Conversar</button>
          </div>
        </div>
      )}
      {isOpen && (
        <section className="copilot-panel" aria-label="Assistente Eventos Conecta">
          <header className="copilot-header">
            <div className="copilot-title">
              <span className="copilot-icon"><Bot size={17} aria-hidden="true" /></span>
              <div>
                <strong>Copilot</strong>
                <span>{isVisitor ? "Tire dúvidas e peça seu orçamento" : "Seu assistente para fechar negócios"}</span>
              </div>
            </div>
            <button className="copilot-close" type="button" onClick={() => setIsOpen(false)} aria-label="Fechar Copilot"><X size={18} /></button>
          </header>

          <div className="copilot-messages" aria-live="polite">
            {isLoadingHistory && <p className="copilot-status">Carregando…</p>}
            {empty && nudge && (
              <article className="copilot-message copilot-message-assistant"><p>{nudge.message}</p></article>
            )}
            {empty && !nudge && (
              <div className="copilot-login-state">
                <Bot size={24} aria-hidden="true" />
                <strong>Como posso ajudar?</strong>
                <p>Peça uma orientação sobre eventos, propostas, contratos ou operação.</p>
              </div>
            )}
            {messages.map(message => (
              <article key={`${message.id}-${message.createdAt}`} className={`copilot-message copilot-message-${message.role}`}>
                {message.role === "assistant" ? <Streamdown rehypePlugins={rehypePlugins}>{message.content}</Streamdown> : <p>{message.content}</p>}
              </article>
            ))}
            {empty && nudge && (
              <div className="copilot-chips">
                {nudge.suggestions.map(s => <button key={s} type="button" onClick={() => void sendMessage(s)} disabled={isSending}>{s}</button>)}
              </div>
            )}
            {isSending && <p className="copilot-status">Pensando…</p>}
            {errorMessage && (
              <div className="copilot-error" role="alert">
                <span>{errorMessage}</span>
                {retryText && (
                  <button type="button" onClick={() => void sendMessage(retryText)} disabled={isSending}><RefreshCw size={14} /> Tentar novamente</button>
                )}
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>

          {nudge && (
            <a className="copilot-next" href={nudge.action.href}>
              <span>Próximo passo</span><strong>{nudge.action.label}</strong><ArrowRight size={14} />
            </a>
          )}
          <form className="copilot-composer" onSubmit={onSubmit}>
            <input value={draft} onChange={event => setDraft(event.target.value)} placeholder={isVisitor ? "Ex.: preciso de garçom sábado em Campinas" : "Escreva sua pergunta…"} aria-label="Mensagem para o Copilot" disabled={isSending || isLoadingHistory} />
            <button type="submit" aria-label="Enviar mensagem" disabled={!draft.trim() || isSending || isLoadingHistory}><Send size={16} /></button>
          </form>
        </section>
      )}
      <button className={`copilot-launcher ${isOpen ? "is-open" : ""}`} type="button" onClick={() => { setIsOpen(open => !open); setBubble(false); }} aria-expanded={isOpen} aria-label={isOpen ? "Fechar Copilot" : "Abrir Copilot"}>
        {isOpen ? <X size={19} /> : <MessageCircle size={20} />}
        <span>{isOpen ? "Copilot" : "Fale com a gente"}</span>
      </button>
    </div>
  );
}
