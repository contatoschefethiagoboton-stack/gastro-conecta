import { api } from "@/lib/api";
import { Bot, MessageCircle, RefreshCw, Send, X } from "lucide-react";
import { FormEvent, MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { useLocation } from "wouter";
import "../dashboard.css";

type CopilotRole = "user" | "assistant";

type CopilotMessage = {
  id: number;
  role: CopilotRole;
  content: string;
  createdAt: string;
};

type CurrentUser = { id: number } | null;
type MeResponse = { user: CurrentUser };
type MessagesResponse = { messages: CopilotMessage[] };
type CopilotResponse = { reply: string };

type HttpError = { status?: number; response?: { status?: number } };

function isUnauthorized(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as HttpError;
  return candidate.status === 401 || candidate.status === 403 || candidate.response?.status === 401 || candidate.response?.status === 403;
}

function readableError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "error" in error) {
    const message = (error as { error?: string }).error;
    if (message) return message;
  }
  return "Não foi possível conectar ao Copilot.";
}

export default function Copilot() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoggedOut, setIsLoggedOut] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryText, setRetryText] = useState("");
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    setErrorMessage("");
    setMessages([]);
    setRetryText("");
    try {
      const me = await api<MeResponse>("/me");
      if (!me.user) {
        setIsLoggedOut(true);
        setMessages([]);
        return;
      }
      setIsLoggedOut(false);
      const history = await api<MessagesResponse>("/messages");
      setMessages(history.messages ?? []);
    } catch (error: unknown) {
      if (isUnauthorized(error)) {
        setIsLoggedOut(true);
        setMessages([]);
      } else {
        setErrorMessage(readableError(error));
      }
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void loadHistory();
  }, [isOpen, location]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const sendMessage = async (event: FormEvent<HTMLFormElement> | ReactMouseEvent<HTMLButtonElement>, text = draft) => {
    event.preventDefault();
    const message = text.trim();
    if (!message || isSending || isLoggedOut) return;

    const optimistic: CopilotMessage = {
      id: Date.now(),
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setDraft("");
    setRetryText("");
    setErrorMessage("");
    setIsSending(true);

    try {
      const response = await api<CopilotResponse>("/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: response.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (error: unknown) {
      if (isUnauthorized(error)) setIsLoggedOut(true);
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setRetryText(message);
      setErrorMessage(readableError(error));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="copilot-root">
      {isOpen && (
        <section className="copilot-panel" aria-label="Copilot GastroConecta">
          <header className="copilot-header">
            <div className="copilot-title">
              <span className="copilot-icon"><Bot size={17} aria-hidden="true" /></span>
              <div>
                <strong>Copilot</strong>
                <span>Orientação para sua operação</span>
              </div>
            </div>
            <button className="copilot-close" type="button" onClick={() => setIsOpen(false)} aria-label="Fechar Copilot">
              <X size={18} />
            </button>
          </header>

          <div className="copilot-messages" aria-live="polite">
            {isLoadingHistory && <p className="copilot-status">Carregando seu histórico…</p>}
            {!isLoadingHistory && isLoggedOut && (
              <div className="copilot-login-state">
                <Bot size={24} aria-hidden="true" />
                <strong>Entre para conversar</strong>
                <p>O Copilot guarda o histórico por conta e não abre conversas sem autenticação.</p>
                <a href="/conta">Ir para minha conta</a>
              </div>
            )}
            {!isLoadingHistory && !isLoggedOut && messages.length === 0 && (
              <div className="copilot-login-state">
                <Bot size={24} aria-hidden="true" />
                <strong>Como posso ajudar?</strong>
                <p>Peça uma orientação sobre eventos, propostas, contratos ou operação.</p>
              </div>
            )}
            {messages.map((message) => (
              <article key={`${message.id}-${message.createdAt}`} className={`copilot-message copilot-message-${message.role}`}>
                {message.role === "assistant" ? <Streamdown>{message.content}</Streamdown> : <p>{message.content}</p>}
              </article>
            ))}
            {isSending && <p className="copilot-status">Pensando…</p>}
            {errorMessage && (
              <div className="copilot-error" role="alert">
                <span>{errorMessage}</span>
                {retryText && !isLoggedOut && (
                  <button type="button" onClick={(event) => void sendMessage(event, retryText)} disabled={isSending}>
                    <RefreshCw size={14} /> Tentar novamente
                  </button>
                )}
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>

          {!isLoggedOut && (
            <form className="copilot-composer" onSubmit={sendMessage}>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Escreva sua pergunta…"
                aria-label="Mensagem para o Copilot"
                disabled={isSending || isLoadingHistory}
              />
              <button type="submit" aria-label="Enviar mensagem" disabled={!draft.trim() || isSending || isLoadingHistory}>
                <Send size={16} />
              </button>
            </form>
          )}
        </section>
      )}
      <button className={`copilot-launcher ${isOpen ? "is-open" : ""}`} type="button" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} aria-label={isOpen ? "Fechar Copilot" : "Abrir Copilot"}>
        {isOpen ? <X size={19} /> : <MessageCircle size={20} />}
        <span>Copilot</span>
      </button>
    </div>
  );
}
