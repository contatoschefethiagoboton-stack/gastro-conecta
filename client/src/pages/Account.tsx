import { api } from "@/lib/api";
import { ArrowRight, Check, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useSite } from "@/lib/site";
import { getAttribution } from "@/lib/attribution";
import { formatPhone, isValidPhoneBR } from "@shared/validators";
import "../dashboard.css";

type AccountMode = "login" | "register" | "forgot";
type AccountType = "client" | "provider";

type AccountUser = {
  id: number;
  name: string;
  email: string;
  accountType: AccountType;
  role: "user" | "admin";
  status: string;
  city?: string;
};

type AuthResponse = { user: AccountUser };
type ApiErrorShape = { error?: string };

const passwordRequirements = [
  { key: "length", label: "10 caracteres ou mais", test: (value: string) => value.length >= 10 },
  { key: "upper", label: "uma letra maiúscula", test: (value: string) => /[A-Z]/.test(value) },
  { key: "lower", label: "uma letra minúscula", test: (value: string) => /[a-z]/.test(value) },
  { key: "digit", label: "um número", test: (value: string) => /\d/.test(value) },
  { key: "special", label: "um caractere especial", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "error" in error) {
    const message = (error as ApiErrorShape).error;
    if (message) return message;
  }
  return fallback;
}

export default function Account() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AccountMode>(() => new URLSearchParams(window.location.search).has("cadastro") ? "register" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountType>(() => new URLSearchParams(window.location.search).get("cadastro") === "profissional" ? "provider" : "client");
  const [serviceId, setServiceId] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [notifyOptIn, setNotifyOptIn] = useState(false);
  const linkExpired = new URLSearchParams(window.location.search).get("link") === "expirado";
  const { serviceCatalog } = useSite();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [forgotSent, setForgotSent] = useState("");

  const passwordChecks = useMemo(
    () => passwordRequirements.map((rule) => ({ ...rule, valid: rule.test(password) })),
    [password],
  );
  const passwordIsStrong = passwordChecks.every((rule) => rule.valid);

  const selectMode = (nextMode: AccountMode) => {
    setMode(nextMode);
    setErrorMessage("");
    setForgotSent("");
  };

  const requestReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      const response = await api<{ message: string }>("/password/forgot", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      setForgotSent(response.message);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, "Não foi possível enviar agora. Tente novamente."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    if (mode === "register" && !passwordIsStrong) {
      setErrorMessage("Escolha uma senha que cumpra todos os requisitos de segurança.");
      return;
    }
    if (mode === "register" && !isValidPhoneBR(whatsapp)) {
      setErrorMessage("Informe um WhatsApp válido com DDD.");
      return;
    }
    if (mode === "register" && accountType === "provider" && !serviceId) {
      setErrorMessage("Escolha qual profissional você é.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api<AuthResponse>(mode === "login" ? "/login" : "/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login"
            ? { email: email.trim(), password }
            : {
                name: name.trim(),
                email: email.trim(),
                password,
                accountType,
                city: city.trim(),
                ...(accountType === "provider" ? { serviceId } : {}),
                whatsapp,
                notifyOptIn: accountType === "client" ? notifyOptIn : false,
                attribution: getAttribution(),
              },
        ),
      });
      if (!response.user) throw new Error("A sessão não foi criada. Tente novamente.");
      toast.success(mode === "login" ? "Bem-vindo de volta." : "Conta criada com sucesso.");
      await queryClient.invalidateQueries();
      const returnTo = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("returnTo") : null;
      setLocation(response.user.role === "admin" ? "/admin/painel" : returnTo === "orcamento" ? "/orcamento" : "/painel");
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Não foi possível concluir. Confira os dados e tente novamente.");
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="account-page">
      <section className="account-shell" aria-labelledby="account-title">
        <div className="account-intro">
          <span className="account-kicker">GastroConecta</span>
          <h1 id="account-title">Uma boa conexão começa pela sua mesa.</h1>
          <p>
            Crie sua conta para organizar experiências, encontrar profissionais e manter tudo o que importa em um só lugar.
          </p>
          <div className="account-trust">
            <ShieldCheck aria-hidden="true" size={18} />
            <span>Seus dados ficam protegidos por sessão autenticada.</span>
          </div>
        </div>

        <div className="account-card">
          <div className="account-tabs" role="tablist" aria-label="Acesso à conta">
            <button
              className={`account-tab ${mode === "login" ? "is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => selectMode("login")}
            >
              Entrar
            </button>
            <button
              className={`account-tab ${mode === "register" ? "is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              onClick={() => selectMode("register")}
            >
              Criar conta
            </button>
          </div>

          {linkExpired && mode === "login" && <p className="account-next-step" role="status">O link de acesso expirou. Entre com seu e-mail e senha.</p>}
          {mode === "forgot" ? (
            <>
              <div className="account-heading">
                <span className="account-eyebrow">Recuperar acesso</span>
                <h2>Esqueci minha senha</h2>
                <p>Informe o e-mail da sua conta (cliente ou profissional) para receber o link de redefinição.</p>
              </div>
              <form className="account-form" onSubmit={requestReset}>
                <label className="account-field">
                  <span>E-mail</span>
                  <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" />
                </label>
                {forgotSent && <p className="account-next-step" role="status">{forgotSent}</p>}
                {errorMessage && <p className="account-form-error" role="alert">{errorMessage}</p>}
                <button className="account-submit" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="account-spinner" size={18} /> : <ArrowRight size={18} />}
                  {isSubmitting ? "Aguarde…" : "Enviar link"}
                </button>
                <button className="account-link-button" type="button" onClick={() => selectMode("login")}>Voltar para o login</button>
              </form>
            </>
          ) : (<>
          <div className="account-heading">
            <span className="account-eyebrow">{mode === "login" ? "Que bom ter você aqui" : "Comece sua jornada"}</span>
            <h2>{mode === "login" ? "Entre na sua conta" : "Crie seu acesso GastroConecta"}</h2>
            <p>
              {mode === "login"
                ? "Clientes e profissionais entram por aqui."
                : "Clientes usam de graça. Profissionais pagam só uma assinatura mensal, sem comissão."}
            </p>
          </div>

          <form className="account-form" onSubmit={submit}>
            {mode === "register" && (
              <label className="account-field">
                <span>Nome completo</span>
                <input
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Como podemos chamar você?"
                />
              </label>
            )}

            <label className="account-field">
              <span>E-mail</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@exemplo.com"
              />
            </label>

            {mode === "register" && (
              <div className="account-form-grid">
                <label className="account-field">
                  <span>Cidade</span>
                  <input
                    autoComplete="address-level2"
                    required
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="Campinas"
                  />
                </label>
                <label className="account-field">
                  <span>Quero participar como</span>
                  <select value={accountType} onChange={(event) => setAccountType(event.target.value as AccountType)}>
                    <option value="client">Cliente (quero contratar — grátis)</option>
                    <option value="provider">Profissional (quero oferecer meus serviços)</option>
                  </select>
                </label>
              </div>
            )}

            {mode === "register" && (
              <label className="account-field">
                <span>WhatsApp (com DDD)</span>
                <input type="tel" inputMode="tel" autoComplete="tel" required value={whatsapp} onChange={(event) => setWhatsapp(formatPhone(event.target.value))} placeholder="(19) 99999-9999" />
                <small className="account-field-help">{accountType === "provider" ? "Você recebe os novos pedidos de orçamento por aqui." : "Você recebe as propostas e respostas por aqui, com um link que abre direto no site."}</small>
              </label>
            )}

            {mode === "register" && accountType === "client" && (
              <label className="account-check">
                <input type="checkbox" checked={notifyOptIn} onChange={(event) => setNotifyOptIn(event.target.checked)} />
                <span>Quero receber pelo WhatsApp quando entrarem novos profissionais na minha região.</span>
              </label>
            )}

            {mode === "register" && accountType === "provider" && (
              <label className="account-field">
                <span>Qual profissional você é?</span>
                <select required value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
                  <option value="">Selecione a sua profissão</option>
                  {serviceCatalog.map((category) => (
                    <optgroup key={category.id} label={category.name}>
                      {category.services.map((service) => <option key={service.id} value={service.id}>{service.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}

            {mode === "register" && accountType === "provider" && (
              <p className="account-next-step">
                Depois de criar o acesso, você completa o cadastro (pode marcar outras profissões também): CPF ou CNPJ (MEI ou Limitada), logo, foto do rosto, pelo menos 3 fotos de trabalhos anteriores e dados bancários/Pix. Após a aprovação, ative a assinatura mensal via Pix para aparecer no catálogo.
              </p>
            )}

            <label className="account-field">
              <span>Senha</span>
              <span className="account-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Sua senha"
                />
                <button
                  className="account-password-toggle"
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            {mode === "register" && (
              <ul className="account-password-rules" aria-label="Regras da senha">
                {passwordChecks.map((rule) => (
                  <li key={rule.key} className={rule.valid ? "is-valid" : ""}>
                    <Check size={14} aria-hidden="true" />
                    {rule.label}
                  </li>
                ))}
              </ul>
            )}

            {mode === "login" && <button className="account-link-button account-forgot" type="button" onClick={() => selectMode("forgot")}>Esqueci minha senha</button>}

            {errorMessage && <p className="account-form-error" role="alert">{errorMessage}</p>}

            <button className="account-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="account-spinner" size={18} /> : <ArrowRight size={18} />}
              {isSubmitting ? "Aguarde…" : mode === "login" ? "Entrar na conta" : "Criar minha conta"}
            </button>
          </form>
          </>)}

        </div>
      </section>
    </main>
  );
}
