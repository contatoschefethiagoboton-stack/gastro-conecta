import { COOKIE_NAME } from "@shared/const";
import { api } from "@/lib/api";
import {
  Activity,
  BadgePercent,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  CreditCard,
  Download,
  FileCheck2,
  FileText,
  Gift,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  PackageCheck,
  Plus,
  ReceiptText,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Star,
  UserCircle2,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import "../dashboard.css";

type AccountType = "client" | "provider" | "freelancer";
type UserRole = "user" | "admin";
type DashboardTab =
  | "overview"
  | "events"
  | "radar"
  | "jobs"
  | "applications"
  | "wallet"
  | "proposals"
  | "contracts"
  | "reviews"
  | "plans"
  | "profile"
  | "integrations"
  | "admin";
type AdminSection = "users" | "coupons" | "audit";

type DashboardUser = {
  id: number;
  name: string;
  email: string;
  accountType: AccountType;
  role: UserRole;
  status: string;
  city?: string;
  bio?: string;
  specialty?: string;
  vip?: boolean;
  discountPercent?: number;
  featured?: boolean;
};

type Event = {
  id: number;
  clientId: number;
  providerId?: number;
  title: string;
  type: string;
  date?: string;
  city: string;
  location?: string;
  guests: number;
  budgetCents: number;
  description?: string;
  score: number;
  status: "open" | "booked" | "completed" | "cancelled";
  createdAt: string;
};
type Proposal = {
  id: number;
  eventId: number;
  providerId: number;
  amountCents: number;
  message: string;
  status: string;
  providerName?: string;
  eventTitle?: string;
};
type Job = {
  id: number;
  title: string;
  role: "Cozinheiro" | "Ajudante" | "Garçom" | "Barman";
  date: string;
  city: string;
  hours: number;
  dailyCents: number;
  description: string;
  status: string;
  providerId: number;
  eventId?: number;
};
type Application = {
  id: number;
  jobId: number;
  userId: number;
  status: string;
  jobTitle?: string;
  dailyCents?: number;
  freelancerName?: string;
};
type Transaction = {
  id: number;
  type: string;
  description: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  status: string;
  createdAt: string;
};
type Contract = { id: number; kind: "A" | "B" | "C"; title: string; status: string; createdAt: string };
type ReviewTarget = { id: number; name: string };
type PendingReview = { eventId: number; title: string; targets: ReviewTarget[] };
type Review = { id?: number; rating: number; feedback: string; targetName?: string; createdAt?: string };
type Plan = { id: string; name: string; days: number; priceCents: number };
type Subscription = { id?: number; planId: string; status: string; createdAt?: string };
type Integration = { id: string; name: string; status: "pending" | "configured"; description: string };
type AdminOverview = { users: number; events: number; pending: number; revenueCents: number };
type AuditLog = { id: number; action: string; details: string; createdAt: string; actorId: number };
type Coupon = { id: number; code: string; discountPercent: number; cashbackPercent: number; active: boolean };

type MeResponse = { user: DashboardUser | null };
type EventsResponse = { events: Event[] };
type ProposalsResponse = { proposals: Proposal[] };
type JobsResponse = { jobs: Job[] };
type ApplicationsResponse = { applications: Application[] };
type WalletResponse = { transactions: Transaction[]; availableCents: number; pendingCents: number };
type ContractsResponse = { contracts: Contract[] };
type ReviewsResponse = { pending: PendingReview[]; reviews: Review[] };
type SubscriptionsResponse = { plans: Plan[]; subscription: Subscription | null };
type IntegrationsResponse = { integrations: Integration[]; paymentsLive: boolean };
type AdminUsersResponse = { users: DashboardUser[] };
type AdminOverviewResponse = AdminOverview;
type AuditResponse = { logs: AuditLog[] };
type CouponsResponse = { coupons: Coupon[] };
type ApiErrorShape = { error?: string; status?: number };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

const parseCents = (value: string): number | null => {
  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return null;
  const brazilian = /^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(normalized);
  const decimal = /^\d+(?:\.\d{1,2})?$/.test(normalized);
  if (!brazilian && !decimal) return null;
  const numeric = brazilian ? normalized.replace(/\./g, "").replace(",", ".") : normalized;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
};
const formatMoney = (cents: number) => money.format(cents / 100);
const dateKey = (value?: string) => value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
const localTodayKey = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};
const isDateOnOrBeforeToday = (value?: string) => {
  const key = dateKey(value);
  return Boolean(key) && key <= localTodayKey();
};
const formatDate = (value?: string, withTime = false) => {
  if (!value) return "Data a definir";
  const key = dateKey(value);
  const parsed = key && (!withTime || !/[T ]/.test(value))
    ? new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : (withTime ? dateTime : dateOnly).format(parsed);
};
const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

function errorMessage(error: unknown, fallback = "Não foi possível concluir esta ação.") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "error" in error) {
    const message = (error as ApiErrorShape).error;
    if (message) return message;
  }
  return fallback;
}
function isUnauthorized(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as ApiErrorShape & { response?: { status?: number } };
  return candidate.status === 401 || candidate.status === 403 || candidate.response?.status === 401 || candidate.response?.status === 403;
}

async function downloadAuthenticatedFile(path: string, fileName: string) {
  try {
    const headers = new Headers();
    try {
      const raw = sessionStorage.getItem("manus-cookie");
      const token = raw?.split(";").find((value) => value.trim().startsWith(`${COOKIE_NAME}=`))?.trim().slice(COOKIE_NAME.length + 1);
      if (token) headers.set("Authorization", `Bearer ${token}`);
    } catch {
      // Cookie fallback remains available when embedded storage is restricted.
    }
    const response = await fetch(`/api/gastro${path}`, { credentials: "include", headers });
    if (!response.ok) {
      let message = "Não foi possível baixar o arquivo.";
      try {
        const body = await response.json() as ApiErrorShape;
        if (body.error) message = body.error;
      } catch { /* PDF/error responses do not need a JSON body. */ }
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error: unknown) {
    toast.error(errorMessage(error, "Não foi possível baixar o arquivo."));
  }
}
function scoreBand(score: number) {
  if (score >= 80) return { label: "Alta intenção", className: "score-high" };
  if (score >= 50) return { label: "Em avaliação", className: "score-medium" };
  return { label: "Em pesquisa", className: "score-low" };
}

const accountLabel: Record<AccountType, string> = {
  client: "Cliente",
  provider: "Fornecedor",
  freelancer: "Freelancer",
};

function navItemsFor(user: DashboardUser): Array<{ id: DashboardTab; label: string; icon: typeof LayoutDashboard }> {
  const items: Array<{ id: DashboardTab; label: string; icon: typeof LayoutDashboard }> = [
    { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  ];
  if (user.accountType === "client" || user.accountType === "provider") items.push({ id: "events", label: user.accountType === "provider" ? "Meus eventos" : "Eventos", icon: CalendarDays });
  if (user.accountType === "provider") items.push({ id: "radar", label: "Radar", icon: Activity });
  if (user.accountType !== "client") items.push({ id: "jobs", label: "Vagas", icon: BriefcaseBusiness });
  if (user.accountType === "provider" || user.accountType === "freelancer") items.push({ id: "applications", label: user.accountType === "provider" ? "Equipe / candidaturas" : "Candidaturas", icon: ClipboardCheck });
  if (user.accountType === "provider" || user.accountType === "freelancer") items.push({ id: "wallet", label: "Carteira", icon: WalletCards });
  if (user.accountType !== "freelancer") items.push({ id: "proposals", label: "Propostas", icon: Send });
  items.push(
    { id: "contracts", label: "Contratos", icon: FileText },
    { id: "reviews", label: "Avaliações", icon: Star },
    { id: "plans", label: "Planos", icon: PackageCheck },
    { id: "profile", label: "Perfil", icon: UserCircle2 },
    { id: "integrations", label: "Integrações", icon: Settings2 },
  );
  if (user.role === "admin") items.push({ id: "admin", label: "Administração", icon: ShieldCheck });
  return items;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="dash-empty">
      <div className="dash-empty-mark"><CircleAlert size={20} /></div>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action}
    </div>
  );
}

function LoadingState() {
  return <div className="dash-loading"><Loader2 className="dash-spinner" size={20} /> Carregando dados reais…</div>;
}

export default function Dashboard() {
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [authError, setAuthError] = useState("");
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loadingKey, setLoadingKey] = useState("");
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  const [events, setEvents] = useState<Event[] | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [reviews, setReviews] = useState<ReviewsResponse | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionsResponse | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationsResponse | null>(null);
  const [adminUsers, setAdminUsers] = useState<DashboardUser[] | null>(null);
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[] | null>(null);
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [adminSection, setAdminSection] = useState<AdminSection>("users");

  const [eventForm, setEventForm] = useState({ title: "", type: "", date: "", city: "", location: "", guests: "", budget: "", description: "", stage: "research" });
  const [proposalForm, setProposalForm] = useState({ eventId: "", amount: "", message: "" });
  const [jobForm, setJobForm] = useState({ title: "", role: "Cozinheiro", date: "", city: "", hours: "8", daily: "", description: "", eventId: "" });
  const [profileForm, setProfileForm] = useState({ name: "", city: "", bio: "", specialty: "" });
  const [contractForm, setContractForm] = useState({ kind: "A" as "A" | "B" | "C", eventId: "", jobId: "" });
  const [reviewForms, setReviewForms] = useState<Record<string, { rating: string; feedback: string }>>({});
  const [adminSearch, setAdminSearch] = useState("");
  const [couponForm, setCouponForm] = useState({ code: "", discountPercent: "", cashbackPercent: "" });
  const [refreshKey, setRefreshKey] = useState(0);

  const navItems = useMemo(() => (user ? navItemsFor(user) : []), [user]);
  const activeLabel = navItems.find((item) => item.id === activeTab)?.label ?? "Visão geral";

  const run = async <T,>(key: string, request: () => Promise<T>, onSuccess: (value: T) => void) => {
    setLoadingKey(key);
    setPageError("");
    try {
      const value = await request();
      onSuccess(value);
    } catch (error: unknown) {
      if (!isUnauthorized(error)) setPageError(errorMessage(error));
    } finally {
      setLoadingKey("");
    }
  };

  useEffect(() => {
    let active = true;
    void api<MeResponse>("/me")
      .then((response) => {
        if (!active) return;
        setUser(response.user);
        if (response.user) setProfileForm({ name: response.user.name, city: response.user.city ?? "", bio: response.user.bio ?? "", specialty: response.user.specialty ?? "" });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (!isUnauthorized(error)) setAuthError(errorMessage(error, "Não foi possível verificar sua sessão."));
      })
      .finally(() => {
        if (active) setLoadingUser(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    if (activeTab === "overview") {
      if (user.accountType !== "freelancer") {
        void run("overview-events", () => api<EventsResponse>("/events"), (response) => setEvents(response.events ?? []));
        void run("overview-proposals", () => api<ProposalsResponse>("/proposals"), (response) => setProposals(response.proposals ?? []));
      }
      if (user.accountType !== "client") {
        void run("overview-jobs", () => api<JobsResponse>("/jobs"), (response) => setJobs(response.jobs ?? []));
      }
    }
    if (activeTab === "events" || activeTab === "radar") {
      void run("events", () => api<EventsResponse>("/events"), (response) => setEvents(response.events ?? []));
    }
    if (activeTab === "proposals") {
      void run("proposals", () => api<ProposalsResponse>("/proposals"), (response) => setProposals(response.proposals ?? []));
      if (user.accountType === "provider") {
        void run("proposal-events", () => api<EventsResponse>("/events"), (response) => setEvents(response.events ?? []));
      }
    }
    if (activeTab === "jobs") {
      void run("jobs", () => api<JobsResponse>("/jobs"), (response) => setJobs(response.jobs ?? []));
      if (user.accountType === "provider") {
        void run("job-events", () => api<EventsResponse>("/events"), (response) => setEvents(response.events ?? []));
      }
    }
    if (activeTab === "applications") {
      void run("applications", () => api<ApplicationsResponse>("/applications"), (response) => setApplications(response.applications ?? []));
    }
    if (activeTab === "wallet") {
      void run("wallet", () => api<WalletResponse>("/wallet"), setWallet);
    }
    if (activeTab === "contracts") {
      void run("contracts", () => api<ContractsResponse>("/contracts"), (response) => setContracts(response.contracts ?? []));
      if (user.accountType !== "freelancer") {
        void run("contract-events", () => api<EventsResponse>("/events"), (response) => setEvents(response.events ?? []));
      }
      if (user.accountType !== "client") {
        void run("contract-jobs", () => api<JobsResponse>("/jobs"), (response) => setJobs(response.jobs ?? []));
        void run("contract-applications", () => api<ApplicationsResponse>("/applications"), (response) => setApplications(response.applications ?? []));
      }
    }
    if (activeTab === "reviews") {
      void run("reviews", () => api<ReviewsResponse>("/reviews"), setReviews);
    }
    if (activeTab === "plans") {
      void run("plans", () => api<SubscriptionsResponse>("/subscriptions"), setSubscriptions);
    }
    if (activeTab === "integrations") {
      void run("integrations", () => api<IntegrationsResponse>("/integrations"), setIntegrations);
    }
    if (activeTab === "admin" && user.role === "admin") {
      void run("admin-users", () => api<AdminUsersResponse>("/admin/users"), (response) => setAdminUsers(response.users ?? []));
      void run("admin-overview", () => api<AdminOverviewResponse>("/admin/overview"), setAdminOverview);
      void run("admin-coupons", () => api<CouponsResponse>("/admin/coupons"), (response) => setCoupons(response.coupons ?? []));
      void run("admin-audit", () => api<AuditResponse>("/admin/audit"), (response) => setAuditLogs(response.logs ?? []));
    }
  }, [activeTab, user, refreshKey]);

  const validCents = (value: string, label: string) => {
    const cents = parseCents(value);
    if (cents !== null) return cents;
    const message = `Informe ${label} com um valor válido (ex.: 180,50 ou 180.50).`;
    setPageError(message);
    setNotice("");
    toast.error(message);
    return null;
  };

  const action = async <T,>(key: string, request: () => Promise<T>, success: string, after?: () => void) => {
    setLoadingKey(key);
    setPageError("");
    setNotice("");
    try {
      await request();
      setNotice(success);
      toast.success(success);
      after?.();
      setRefreshKey((current) => current + 1);
    } catch (error: unknown) {
      const message = errorMessage(error);
      setPageError(message);
      toast.error(message);
    } finally {
      setLoadingKey("");
    }
  };

  const submitEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const budgetCents = validCents(eventForm.budget, "o orçamento");
    if (budgetCents === null) return;
    await action("create-event", () => api<{ event: Event }>("/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: eventForm.title, type: eventForm.type, date: eventForm.date || undefined, city: eventForm.city, location: eventForm.location || undefined, guests: Number(eventForm.guests), budgetCents, description: eventForm.description || undefined, stage: eventForm.stage }),
    }), "Evento criado e salvo na sua conta.", () => {
      setEventForm({ title: "", type: "", date: "", city: "", location: "", guests: "", budget: "", description: "", stage: "research" });
      setEvents(null);
      setActiveTab("events");
    });
  };

  const submitProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountCents = validCents(proposalForm.amount, "o valor da proposta");
    if (amountCents === null) return;
    await action("send-proposal", () => api<{ proposal: Proposal }>("/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: Number(proposalForm.eventId), amountCents, message: proposalForm.message }),
    }), "Proposta enviada. O cliente poderá analisá-la pelo painel.", () => {
      setProposalForm({ eventId: "", amount: "", message: "" });
      setProposals(null);
    });
  };

  const acceptProposal = async (proposalId: number) => {
    await action(`accept-${proposalId}`, () => api<{ ok: true }>(`/proposals/${proposalId}/accept`, { method: "POST" }), "Proposta aceita. O pagamento ainda não foi realizado.", () => setProposals(null));
  };

  const submitJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const dailyCents = validCents(jobForm.daily, "a diária");
    if (dailyCents === null) return;
    await action("create-job", () => api<{ job: Job }>("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: jobForm.title, role: jobForm.role, date: jobForm.date, city: jobForm.city, hours: Number(jobForm.hours), dailyCents, description: jobForm.description, eventId: jobForm.eventId ? Number(jobForm.eventId) : undefined }),
    }), "Vaga publicada.", () => {
      setJobForm({ title: "", role: "Cozinheiro", date: "", city: "", hours: "8", daily: "", description: "", eventId: "" });
      setJobs(null);
    });
  };

  const applyToJob = async (jobId: number) => {
    await action(`apply-${jobId}`, () => api<{ ok: true }>(`/jobs/${jobId}/apply`, { method: "POST" }), "Candidatura enviada.", () => setApplications(null));
  };

  const completeEvent = async (eventId: number) => {
    await action(`complete-event-${eventId}`, () => api<{ event: Event }>(`/events/${eventId}/complete`, { method: "PATCH" }), "Evento concluído. A janela de avaliações foi aberta.", () => setEvents(null));
  };

  const completeJob = async (jobId: number) => {
    await action(`complete-job-${jobId}`, () => api<{ job: Job }>(`/jobs/${jobId}/complete`, { method: "PATCH" }), "Vaga concluída.", () => setJobs(null));
  };

  const acceptApplication = async (applicationId: number) => {
    await action(`accept-application-${applicationId}`, () => api<{ ok: true }>(`/applications/${applicationId}/accept`, { method: "POST" }), "Freelancer aceito. Nenhum pagamento foi realizado.", () => setApplications(null));
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await action("profile", () => api<{ user: DashboardUser }>("/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileForm),
    }), "Perfil atualizado.", () => setUser((current) => current ? { ...current, ...profileForm } : current));
  };

  const requestPlan = async (planId: string) => {
    await action(`plan-${planId}`, () => api<{ subscription: Subscription }>("/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    }), "Solicitação registrada como pendente de pagamento e validação.", () => setSubscriptions(null));
  };

  const createContract = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const kind: "A" | "B" | "C" = user?.accountType === "client" ? "B" : user?.accountType === "freelancer" ? "C" : contractForm.kind;
    const allowed = (kind === "A" && user?.accountType === "provider") || (kind === "B" && (user?.accountType === "client" || user?.accountType === "provider")) || (kind === "C" && (user?.accountType === "provider" || user?.accountType === "freelancer"));
    if (!allowed) {
      const message = "Este tipo de contrato não está disponível para o seu perfil.";
      setPageError(message);
      toast.error(message);
      return;
    }
    const payload: { kind: "A" | "B" | "C"; eventId?: number; jobId?: number } = { kind };
    if (kind === "B") {
      if (!contractForm.eventId) {
        const message = "Selecione um evento reservado ou concluído para o contrato B.";
        setPageError(message);
        toast.error(message);
        return;
      }
      payload.eventId = Number(contractForm.eventId);
    }
    if (kind === "C") {
      if (!contractForm.jobId) {
        const message = "Selecione uma vaga com candidatura aceita para o contrato C.";
        setPageError(message);
        toast.error(message);
        return;
      }
      payload.jobId = Number(contractForm.jobId);
    }
    await action("contract", () => api<{ contract: Contract }>("/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }), "Minuta criada a partir do vínculo selecionado.", () => setContracts(null));
  };

  const submitReview = async (pending: PendingReview, target: ReviewTarget) => {
    const key = `${pending.eventId}-${target.id}`;
    const values = reviewForms[key] ?? { rating: "", feedback: "" };
    await action(`review-${key}`, () => api<{ review: Review }>("/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: pending.eventId, targetId: target.id, rating: Number(values.rating), feedback: values.feedback }),
    }), "Avaliação registrada.", () => setReviews(null));
  };

  const updateAdminUser = async (account: DashboardUser, patch: Partial<Pick<DashboardUser, "name" | "status" | "vip" | "discountPercent" | "featured">>) => {
    await action(`admin-user-${account.id}`, () => api<{ ok: true }>(`/admin/users/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }), "Alteração administrativa auditada.", () => setAdminUsers(null));
  };

  const createCoupon = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await action("coupon", () => api<{ ok: true }>("/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: couponForm.code.trim().toUpperCase(), discountPercent: Number(couponForm.discountPercent), cashbackPercent: Number(couponForm.cashbackPercent) }),
    }), "Cupom criado.", () => {
      setCouponForm({ code: "", discountPercent: "", cashbackPercent: "" });
      setCoupons(null);
    });
  };

  const tryCheckout = async () => {
    await action("checkout", () => api<{ ok: true }>("/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }), "Checkout iniciado.");
  };

  if (loadingUser) {
    return <main className="dash-page"><div className="dash-auth-loading"><Loader2 className="dash-spinner" size={24} /> Verificando sua sessão…</div></main>;
  }

  if (!user) {
    return (
      <main className="dash-page dash-logged-out">
        <section className="dash-login-card">
          <span className="dash-kicker">GastroConecta / painel</span>
          <div className="dash-empty-mark"><LayoutDashboard size={22} /></div>
          <h1>Seu painel começa com uma conexão.</h1>
          <p>{authError || "Entre na sua conta para acessar eventos, propostas, vagas e sua operação."}</p>
          <Link className="dash-primary-button" href="/conta">Ir para minha conta <ChevronRight size={17} /></Link>
        </section>
      </main>
    );
  }

  const setTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
    setPageError("");
    setNotice("");
  };

  return (
    <main className="dash-page">
      <div className={`dash-layout ${mobileNavOpen ? "nav-open" : ""}`}>
        <button className="dash-mobile-backdrop" aria-label="Fechar menu" type="button" onClick={() => setMobileNavOpen(false)} />
        <aside className="dash-sidebar">
          <div className="dash-sidebar-brand">
            <span className="dash-brand-mark">G</span>
            <div><strong>Gastro</strong><span>Conecta</span></div>
            <button className="dash-close-mobile" type="button" onClick={() => setMobileNavOpen(false)} aria-label="Fechar navegação"><X size={18} /></button>
          </div>
          <div className="dash-profile-mini">
            <span className="dash-avatar">{initials(user.name)}</span>
            <div><strong>{user.name}</strong><span>{accountLabel[user.accountType]}</span></div>
          </div>
          <nav className="dash-nav" aria-label="Navegação do painel">
            <span className="dash-nav-label">Seu espaço</span>
            {navItems.map((item) => {
              const Icon = item.icon;
              return <button type="button" key={item.id} className={`dash-nav-item ${activeTab === item.id ? "is-active" : ""}`} onClick={() => setTab(item.id)}><Icon size={17} /><span>{item.label}</span>{activeTab === item.id && <ChevronRight className="dash-nav-arrow" size={15} />}</button>;
            })}
          </nav>
          <div className="dash-sidebar-bottom">
            <div className="dash-safety-note"><ShieldCheck size={16} /><span>Dados e pagamentos só avançam quando a integração estiver homologada.</span></div>
            <button className="dash-signout" type="button" onClick={() => { void action("logout", () => api<{ ok: true }>("/logout", { method: "POST" }), "Sessão encerrada.", () => { try { sessionStorage.removeItem("manus-cookie"); } catch { /* Storage can be restricted in embedded previews. */ } window.location.assign("/"); }); }}><LogOut size={16} /> Sair da conta</button>
          </div>
        </aside>

        <section className="dash-main">
          <header className="dash-topbar">
            <button className="dash-menu-button" type="button" onClick={() => setMobileNavOpen(true)} aria-label="Abrir navegação"><Menu size={20} /></button>
            <div><span className="dash-breadcrumb">Painel /</span><strong>{activeLabel}</strong></div>
            <div className="dash-topbar-actions"><span className="dash-session-pill"><span className="dash-session-dot" /> Sessão ativa</span><span className="dash-avatar dash-avatar-small">{initials(user.name)}</span></div>
          </header>
          <div className="dash-content">
            <div className="dash-heading-row">
              <div><span className="dash-kicker">{accountLabel[user.accountType]}{user.role === "admin" ? " / administrador" : ""}</span><h1>{activeLabel}</h1></div>
              <span className="dash-city"><Building2 size={15} /> {user.city || "Cidade não informada"}</span>
            </div>
            {pageError && <div className="dash-alert dash-alert-error" role="alert"><CircleAlert size={17} /> {pageError}<button type="button" onClick={() => setPageError("")} aria-label="Fechar erro"><X size={15} /></button></div>}
            {notice && <div className="dash-alert dash-alert-success" role="status"><Check size={17} /> {notice}</div>}
            {user.accountType === "provider" && user.status === "pending" && <div className="dash-alert dash-alert-warning" role="status"><Clock3 size={17} /> Seu cadastro de fornecedor está pendente de validação administrativa. A liberação é necessária antes de enviar propostas, publicar vagas ou iniciar transações.</div>}
            {activeTab === "overview" && <OverviewPanel user={user} events={events} proposals={proposals} jobs={jobs} onTab={setTab} />}
            {activeTab === "events" && <EventsPanel user={user} events={events} loading={loadingKey === "events"} form={eventForm} setForm={setEventForm} onSubmit={submitEvent} onComplete={completeEvent} onTab={setTab} loadingKey={loadingKey} />}
            {activeTab === "radar" && <RadarPanel events={events} loading={loadingKey === "events"} onTab={setTab} />}
            {activeTab === "proposals" && <ProposalsPanel user={user} proposals={proposals} events={events} loading={loadingKey === "proposals"} form={proposalForm} setForm={setProposalForm} onSubmit={submitProposal} onAccept={acceptProposal} loadingKey={loadingKey} />}
            {activeTab === "jobs" && <JobsPanel user={user} jobs={jobs} events={events} loading={loadingKey === "jobs"} form={jobForm} setForm={setJobForm} onSubmit={submitJob} onApply={applyToJob} onComplete={completeJob} loadingKey={loadingKey} />}
            {activeTab === "applications" && <ApplicationsPanel user={user} applications={applications} loading={loadingKey === "applications"} onAccept={acceptApplication} loadingKey={loadingKey} />}
            {activeTab === "wallet" && <WalletPanel wallet={wallet} loading={loadingKey === "wallet"} />}
            {activeTab === "contracts" && <ContractsPanel user={user} contracts={contracts} events={events} jobs={jobs} applications={applications} form={contractForm} setForm={setContractForm} onSubmit={createContract} loading={loadingKey === "contract"} />}
            {activeTab === "reviews" && <ReviewsPanel reviews={reviews} reviewForms={reviewForms} setReviewForms={setReviewForms} onSubmit={submitReview} loadingKey={loadingKey} />}
            {activeTab === "plans" && <PlansPanel data={subscriptions} loading={loadingKey === "plans"} onRequest={requestPlan} loadingKey={loadingKey} />}
            {activeTab === "profile" && <ProfilePanel user={user} form={profileForm} setForm={setProfileForm} onSubmit={saveProfile} loading={loadingKey === "profile"} />}
            {activeTab === "integrations" && <IntegrationsPanel data={integrations} loading={loadingKey === "integrations"} onCheckout={tryCheckout} checkoutLoading={loadingKey === "checkout"} />}
            {activeTab === "admin" && <AdminPanel overview={adminOverview} users={adminUsers} coupons={coupons} logs={auditLogs} section={adminSection} setSection={setAdminSection} search={adminSearch} setSearch={setAdminSearch} onUpdateUser={updateAdminUser} onCreateCoupon={createCoupon} couponForm={couponForm} setCouponForm={setCouponForm} loadingKey={loadingKey} />}
          </div>
        </section>
      </div>
    </main>
  );
}

function OverviewPanel({ user, events, proposals, jobs, onTab }: { user: DashboardUser; events: Event[] | null; proposals: Proposal[] | null; jobs: Job[] | null; onTab: (tab: DashboardTab) => void }) {
  const hasRealData = Boolean((events && events.length) || (proposals && proposals.length) || (jobs && jobs.length));
  return (
    <div className="dash-stack">
      <section className="dash-welcome-card"><div><span className="dash-eyebrow">Um novo capítulo para sua operação</span><h2>Olá, {user.name.split(" ")[0]}.</h2><p>Acompanhe suas conexões gastronômicas com clareza, do primeiro contato ao contrato.</p></div><span className="dash-welcome-symbol"><ShoppingBag size={38} /></span></section>
      <div className="dash-card-grid dash-card-grid-three">
        <button type="button" className="dash-quick-card" onClick={() => onTab(user.accountType === "provider" ? "radar" : user.accountType === "client" ? "events" : "jobs")}><span className="dash-quick-icon orange"><CalendarDays size={19} /></span><strong>{user.accountType === "provider" ? "Encontrar oportunidades" : user.accountType === "client" ? "Organizar um evento" : "Ver vagas"}</strong><span>Ir para a área</span><ChevronRight size={16} /></button>
        <button type="button" className="dash-quick-card" onClick={() => onTab(user.accountType === "client" || user.accountType === "provider" ? "proposals" : "applications")}><span className="dash-quick-icon olive"><Send size={19} /></span><strong>{user.accountType === "freelancer" ? "Minhas candidaturas" : "Acompanhar propostas"}</strong><span>Ver atualizações</span><ChevronRight size={16} /></button>
        <button type="button" className="dash-quick-card" onClick={() => onTab("profile")}><span className="dash-quick-icon sand"><UserCircle2 size={19} /></span><strong>Manter perfil em dia</strong><span>Editar informações</span><ChevronRight size={16} /></button>
      </div>
      <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Atividade da sua conta</span><h3>O que está acontecendo</h3></div><Activity size={20} /></div>{!hasRealData ? <EmptyState title="Ainda não há atividade registrada" detail="Quando você criar um evento, enviar uma proposta ou se candidatar a uma vaga, os dados aparecerão aqui." /> : <div className="dash-activity-list">{events?.slice(0, 3).map((event) => <div className="dash-activity-row" key={`event-${event.id}`}><span className="dash-list-icon"><CalendarDays size={16} /></span><div><strong>{event.title}</strong><span>Evento · {event.status}</span></div><span>{formatMoney(event.budgetCents)}</span></div>)}{proposals?.slice(0, 3).map((proposal) => <div className="dash-activity-row" key={`proposal-${proposal.id}`}><span className="dash-list-icon"><Send size={16} /></span><div><strong>{proposal.eventTitle || "Proposta"}</strong><span>Proposta · {proposal.status}</span></div><span>{formatMoney(proposal.amountCents)}</span></div>)}{jobs?.slice(0, 3).map((job) => <div className="dash-activity-row" key={`job-${job.id}`}><span className="dash-list-icon"><BriefcaseBusiness size={16} /></span><div><strong>{job.title}</strong><span>Vaga · {job.status}</span></div><span>{formatMoney(job.dailyCents)}/dia</span></div>)}</div>}</section>
    </div>
  );
}

function EventsPanel({ user, events, loading, form, setForm, onSubmit, onComplete, onTab, loadingKey }: { user: DashboardUser; events: Event[] | null; loading: boolean; form: { title: string; type: string; date: string; city: string; location: string; guests: string; budget: string; description: string; stage: string }; setForm: React.Dispatch<React.SetStateAction<typeof form>>; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onComplete: (id: number) => void; onTab: (tab: DashboardTab) => void; loadingKey: string }) {
  const visibleEvents = user.accountType === "provider" ? events?.filter((item) => item.providerId === user.id) : events;
  const isClient = user.accountType === "client";
  return <div className="dash-stack"><div className="dash-section-intro"><div><span className="dash-eyebrow">{isClient ? "Eventos e pedidos" : "Eventos em que você participa"}</span><h2>{isClient ? "Organize a próxima experiência." : "Acompanhe suas experiências."}</h2><p>{isClient ? "Os detalhes ficam vinculados à sua conta e podem receber propostas reais." : "Aqui aparecem apenas eventos reservados ou concluídos com vínculo ao seu perfil."}</p></div></div>{isClient && <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Novo evento</span><h3>Conte o que você está planejando</h3></div><CalendarDays size={20} /></div><form className="dash-form" onSubmit={onSubmit}><div className="dash-form-grid"><Field label="Título" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} placeholder="Jantar de aniversário" required /><Field label="Tipo de experiência" value={form.type} onChange={(value) => setForm((current) => ({ ...current, type: value }))} placeholder="Jantar, casamento, corporativo…" required /><Field label="Data" type="date" value={form.date} onChange={(value) => setForm((current) => ({ ...current, date: value }))} /><Field label="Cidade" value={form.city} onChange={(value) => setForm((current) => ({ ...current, city: value }))} placeholder="São Paulo" required /><Field label="Local" value={form.location} onChange={(value) => setForm((current) => ({ ...current, location: value }))} placeholder="Opcional" /><Field label="Convidados" type="number" value={form.guests} onChange={(value) => setForm((current) => ({ ...current, guests: value }))} min="1" required /><Field label="Orçamento (R$)" value={form.budget} onChange={(value) => setForm((current) => ({ ...current, budget: value }))} placeholder="0,00" inputMode="decimal" required /><label className="dash-field"><span>Momento da decisão</span><select value={form.stage} onChange={(event) => setForm((current) => ({ ...current, stage: event.target.value }))}><option value="research">Ainda pesquisando</option><option value="comparing">Comparando propostas</option><option value="ready">Pronto para contratar</option></select></label></div><label className="dash-field"><span>Descrição</span><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Conte o que é importante para este evento." rows={3} /></label><SubmitButton loading={loadingKey === "create-event"} label="Salvar evento" /></form></section>}<section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">{isClient ? "Seus registros" : "Participações"}</span><h3>{isClient ? "Eventos" : "Meus eventos"}</h3></div><span className="dash-count-label">{visibleEvents?.length ?? 0} registrados</span></div>{loading ? <LoadingState /> : !visibleEvents?.length ? <EmptyState title={isClient ? "Nenhum evento por enquanto" : "Nenhum evento vinculado"} detail={isClient ? "Crie o primeiro acima. Não exibimos exemplos como se fossem seus." : "Quando um cliente aceitar sua proposta, o evento aparecerá aqui."} /> : <div className="dash-record-list">{visibleEvents.map((item) => <article className="dash-record" key={item.id}><div className="dash-record-main"><span className="dash-list-icon"><CalendarDays size={17} /></span><div><h4>{item.title}</h4><p>{item.type} · {item.city} · {item.guests} convidados</p><span>{formatDate(item.date)} · {item.status}</span></div></div><div className="dash-record-actions"><strong>{formatMoney(item.budgetCents)}</strong><span className={`dash-score ${scoreBand(item.score).className}`}>{item.score} · {scoreBand(item.score).label}</span>{user.accountType === "provider" && item.status === "booked" && isDateOnOrBeforeToday(item.date) && <button className="dash-small-button dash-complete-button" type="button" onClick={() => onComplete(item.id)} disabled={loadingKey === `complete-event-${item.id}`}>{loadingKey === `complete-event-${item.id}` ? <Loader2 className="dash-spinner" size={14} /> : <Check size={14} />} Concluir</button>}</div></article>)}</div>}</section>{isClient && <button className="dash-text-link" type="button" onClick={() => onTab("proposals")}>Ver propostas recebidas <ChevronRight size={15} /></button>}</div>;
}

function RadarPanel({ events, loading, onTab }: { events: Event[] | null; loading: boolean; onTab: (tab: DashboardTab) => void }) {
  const [intentFilter, setIntentFilter] = useState<"all" | "high" | "medium" | "research">("all");
  const [cityFilter, setCityFilter] = useState("");
  const openEvents = events?.filter((item) => item.status === "open" && !item.providerId) ?? [];
  const cities = [...new Set(openEvents.map((item) => item.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const intentOptions = [
    { value: "all" as const, label: "Todos" },
    { value: "high" as const, label: "Alta (80–100)" },
    { value: "medium" as const, label: "Média (50–79)" },
    { value: "research" as const, label: "Pesquisa (0–49)" },
  ];
  const filteredEvents = openEvents.filter((item) => {
    const matchesIntent = intentFilter === "all" || (intentFilter === "high" ? item.score >= 80 : intentFilter === "medium" ? item.score >= 50 && item.score < 80 : item.score < 50);
    return matchesIntent && (!cityFilter || item.city === cityFilter);
  });
  return <div className="dash-stack"><div className="dash-section-intro"><div><span className="dash-eyebrow">Oportunidades reais</span><h2>Radar de intenção.</h2><p>Score calculado pelo servidor a partir dos sinais do evento. Nenhuma oportunidade é inventada.</p></div><button className="dash-outline-button" type="button" onClick={() => onTab("proposals")}><Send size={16} /> Enviar proposta</button></div><section className="dash-card"><div className="dash-radar-filters"><div className="dash-radar-intents" role="tablist" aria-label="Filtrar por intenção">{intentOptions.map((option) => <button type="button" role="tab" aria-selected={intentFilter === option.value} className={`dash-radar-intent ${intentFilter === option.value ? "is-active" : ""}`} key={option.value} onClick={() => setIntentFilter(option.value)}>{option.label}</button>)}</div><label className="dash-radar-city-filter"><span>Cidade</span><select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}><option value="">Todas as cidades</option>{cities.map((city) => <option value={city} key={city}>{city}</option>)}</select></label></div>{loading ? <LoadingState /> : !filteredEvents.length ? <EmptyState title="Nenhuma oportunidade encontrada" detail={openEvents.length ? "Ajuste os filtros de intenção ou cidade para ver outros eventos abertos." : "Quando houver eventos compatíveis e abertos, eles serão exibidos aqui."} /> : <div className="dash-record-list">{filteredEvents.map((item) => <article className="dash-record" key={item.id}><div className="dash-record-main"><span className="dash-list-icon orange"><Activity size={17} /></span><div><h4>{item.title}</h4><p>{item.type} · {item.city} · {item.guests} convidados</p><span>{formatDate(item.date)} · {item.status}</span></div></div><div className="dash-record-value"><strong>{formatMoney(item.budgetCents)}</strong><span className={`dash-score ${scoreBand(item.score).className}`}>{item.score} · {scoreBand(item.score).label}</span></div></article>)}</div>}</section></div>;
}

function ProposalsPanel({ user, proposals, events, loading, form, setForm, onSubmit, onAccept, loadingKey }: { user: DashboardUser; proposals: Proposal[] | null; events: Event[] | null; loading: boolean; form: { eventId: string; amount: string; message: string }; setForm: React.Dispatch<React.SetStateAction<typeof form>>; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onAccept: (id: number) => void; loadingKey: string }) {
  const canSend = user.accountType === "provider";
  return <div className="dash-stack"><div className="dash-section-intro"><div><span className="dash-eyebrow">Negociação transparente</span><h2>Propostas sem ruído.</h2><p>Valores ficam em centavos no servidor e a aceitação não confirma pagamento.</p></div></div>{canSend && <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Nova proposta</span><h3>Apresente seu trabalho</h3></div><Send size={20} /></div><form className="dash-form" onSubmit={onSubmit}><div className="dash-form-grid"><label className="dash-field"><span>Evento</span><select required value={form.eventId} onChange={(event) => setForm((current) => ({ ...current, eventId: event.target.value }))}><option value="">Selecione um evento aberto</option>{events?.filter((item) => item.status === "open").map((item) => <option value={item.id} key={item.id}>{item.title} · {item.city}</option>)}</select></label><Field label="Valor da proposta (R$)" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} placeholder="0,00" required inputMode="decimal" /></div><label className="dash-field"><span>Mensagem</span><textarea required value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder="Explique sua proposta, escopo e disponibilidade." rows={3} /></label><SubmitButton loading={loadingKey === "send-proposal"} label="Enviar proposta" /></form></section>}<section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Histórico</span><h3>{canSend ? "Enviadas" : "Recebidas"}</h3></div><span className="dash-count-label">{proposals?.length ?? 0}</span></div>{loading ? <LoadingState /> : !proposals?.length ? <EmptyState title="Nenhuma proposta registrada" detail="Assim que uma proposta existir para sua conta, ela aparecerá aqui." /> : <div className="dash-record-list">{proposals.map((proposal) => <article className="dash-record" key={proposal.id}><div className="dash-record-main"><span className="dash-list-icon"><Send size={17} /></span><div><h4>{proposal.eventTitle || `Evento #${proposal.eventId}`}</h4><p>{proposal.providerName || "Fornecedor"}</p><span>{proposal.message}</span></div></div><div className="dash-record-actions"><strong>{formatMoney(proposal.amountCents)}</strong><span className={`dash-status dash-status-${proposal.status}`}>{proposal.status}</span>{!canSend && proposal.status === "pending" && <button className="dash-small-button" type="button" onClick={() => onAccept(proposal.id)} disabled={loadingKey === `accept-${proposal.id}`}>{loadingKey === `accept-${proposal.id}` ? <Loader2 className="dash-spinner" size={14} /> : <Check size={14} />} Aceitar</button>}</div></article>)}</div>}</section></div>;
}

function JobsPanel({ user, jobs, events, loading, form, setForm, onSubmit, onApply, onComplete, loadingKey }: { user: DashboardUser; jobs: Job[] | null; events: Event[] | null; loading: boolean; form: { title: string; role: string; date: string; city: string; hours: string; daily: string; description: string; eventId: string }; setForm: React.Dispatch<React.SetStateAction<typeof form>>; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onApply: (id: number) => void; onComplete: (id: number) => void; loadingKey: string }) {
  const linkedEvents = events?.filter((item) => item.providerId === user.id && item.status === "booked") ?? [];
  return <div className="dash-stack"><div className="dash-section-intro"><div><span className="dash-eyebrow">Escalas e diárias</span><h2>{user.accountType === "provider" ? "Monte sua equipe." : "Encontre sua próxima diária."}</h2><p>{user.accountType === "provider" ? "Publique uma vaga com função, jornada e diária claros." : "As vagas são públicas e as candidaturas ficam vinculadas à sua conta."}</p></div></div>{user.accountType === "provider" && <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Nova vaga</span><h3>Publicar oportunidade</h3></div><Plus size={20} /></div><form className="dash-form" onSubmit={onSubmit}><div className="dash-form-grid"><Field label="Título" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} placeholder="Brunch de domingo" required /><label className="dash-field"><span>Função</span><select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}><option>Cozinheiro</option><option>Ajudante</option><option>Garçom</option><option>Barman</option></select></label><Field label="Data" type="date" value={form.date} onChange={(value) => setForm((current) => ({ ...current, date: value }))} required /><Field label="Cidade" value={form.city} onChange={(value) => setForm((current) => ({ ...current, city: value }))} required /><Field label="Horas" type="number" value={form.hours} onChange={(value) => setForm((current) => ({ ...current, hours: value }))} min="1" required /><Field label="Diária (R$)" value={form.daily} onChange={(value) => setForm((current) => ({ ...current, daily: value }))} placeholder="0,00" inputMode="decimal" required /><label className="dash-field"><span>Evento relacionado (opcional)</span><select value={form.eventId} onChange={(event) => setForm((current) => ({ ...current, eventId: event.target.value }))}><option value="">Sem vínculo com evento</option>{linkedEvents.map((item) => <option value={item.id} key={item.id}>{item.title} · {formatDate(item.date)}</option>)}</select><small className="dash-field-help">Vincule a vaga a um evento reservado para manter a operação 360° no mesmo contexto.</small></label></div><label className="dash-field"><span>Descrição</span><textarea required value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} placeholder="Escopo, uniforme, horário e detalhes importantes." /></label><SubmitButton loading={loadingKey === "create-job"} label="Publicar vaga" /></form></section>}<section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Oportunidades</span><h3>{user.accountType === "provider" ? "Vagas da operação" : "Vagas disponíveis"}</h3></div><span className="dash-count-label">{jobs?.length ?? 0}</span></div>{loading ? <LoadingState /> : !jobs?.length ? <EmptyState title="Nenhuma vaga disponível" detail="Quando houver oportunidades reais, elas aparecerão neste espaço." /> : <div className="dash-record-list">{jobs.map((job) => <article className="dash-record" key={job.id}><div className="dash-record-main"><span className="dash-list-icon orange"><BriefcaseBusiness size={17} /></span><div><h4>{job.title}</h4><p>{job.role} · {job.city} · {job.hours}h</p><span>{formatDate(job.date)} · {job.description}</span></div></div><div className="dash-record-actions"><strong>{formatMoney(job.dailyCents)}<small>/dia</small></strong><span className={`dash-status dash-status-${job.status}`}>{job.status}</span>{user.accountType === "provider" && job.providerId === user.id && job.status === "booked" && isDateOnOrBeforeToday(job.date) && <button className="dash-small-button dash-complete-button" type="button" onClick={() => onComplete(job.id)} disabled={loadingKey === `complete-job-${job.id}`}>{loadingKey === `complete-job-${job.id}` ? <Loader2 className="dash-spinner" size={14} /> : <Check size={14} />} Concluir</button>}{user.accountType === "freelancer" && job.status === "open" && <button className="dash-small-button" type="button" onClick={() => onApply(job.id)} disabled={loadingKey === `apply-${job.id}`}>{loadingKey === `apply-${job.id}` ? <Loader2 className="dash-spinner" size={14} /> : <ClipboardCheck size={14} />} Candidatar</button>}</div></article>)}</div>}</section></div>;
}

function ApplicationsPanel({ user, applications, loading, onAccept, loadingKey }: { user: DashboardUser; applications: Application[] | null; loading: boolean; onAccept: (id: number) => void; loadingKey: string }) {
  const isProvider = user.accountType === "provider";
  return <div className="dash-stack"><div className="dash-section-intro"><div><span className="dash-eyebrow">{isProvider ? "Equipe" : "Seu histórico"}</span><h2>{isProvider ? "Escolha quem vai com você." : "Candidaturas enviadas."}</h2><p>{isProvider ? "Veja os freelancers por vaga e aceite uma candidatura pending quando estiver pronto. Aceitar não confirma pagamento." : "Acompanhe o status das oportunidades às quais você se candidatou."}</p></div></div><section className="dash-card">{loading ? <LoadingState /> : !applications?.length ? <EmptyState title={isProvider ? "Nenhuma candidatura recebida" : "Nenhuma candidatura ainda"} detail={isProvider ? "As candidaturas para suas vagas aparecerão aqui com o nome do freelancer." : "As candidaturas que você enviar aparecerão aqui com status atualizado pelo servidor."} /> : <div className="dash-record-list">{applications.map((application) => <article className="dash-record" key={application.id}><div className="dash-record-main"><span className="dash-list-icon"><ClipboardCheck size={17} /></span><div><h4>{application.jobTitle || `Vaga #${application.jobId}`}</h4><span>{isProvider ? application.freelancerName || `Freelancer #${application.userId}` : `Candidatura #${application.id}`}</span></div></div><div className="dash-record-actions">{application.dailyCents !== undefined && <strong>{formatMoney(application.dailyCents)}<small>/dia</small></strong>}<span className={`dash-status dash-status-${application.status}`}>{application.status}</span>{isProvider && application.status === "pending" && <button className="dash-small-button" type="button" onClick={() => onAccept(application.id)} disabled={loadingKey === `accept-application-${application.id}`}>{loadingKey === `accept-application-${application.id}` ? <Loader2 className="dash-spinner" size={14} /> : <Check size={14} />} Aceitar</button>}</div></article>)}</div>}</section></div>;
}

function WalletPanel({ wallet, loading }: { wallet: WalletResponse | null; loading: boolean }) {
  return <div className="dash-stack"><div className="dash-section-intro"><div><span className="dash-eyebrow">Financeiro</span><h2>Carteira com valores reais.</h2><p>Não exibimos recebimentos fictícios. Taxas e pendências vêm da API.</p></div></div>{loading ? <LoadingState /> : !wallet ? <section className="dash-card"><EmptyState title="Carteira ainda não disponível" detail="Não há dados financeiros carregados para esta conta." /></section> : <><div className="dash-card-grid dash-card-grid-three"><section className="dash-money-card"><span>Disponível</span><strong>{formatMoney(wallet.availableCents)}</strong><WalletCards size={20} /></section><section className="dash-money-card muted"><span>Pendente</span><strong>{formatMoney(wallet.pendingCents)}</strong><Clock3 size={20} /></section><section className="dash-money-card outline"><span>Transações</span><strong>{wallet.transactions.length}</strong><ReceiptText size={20} /></section></div><section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Extrato</span><h3>Movimentações</h3></div></div>{!wallet.transactions.length ? <EmptyState title="Nenhuma transação registrada" detail="Valores só aparecem após movimentações autorizadas pelo servidor." /> : <div className="dash-record-list">{wallet.transactions.map((transaction) => <article className="dash-record" key={transaction.id}><div className="dash-record-main"><span className="dash-list-icon"><ReceiptText size={17} /></span><div><h4>{transaction.description}</h4><p>{formatDate(transaction.createdAt, true)} · {transaction.status}</p><span>Bruto {formatMoney(transaction.grossCents)} · Taxa {formatMoney(transaction.feeCents)}</span></div></div><strong>{formatMoney(transaction.netCents)}</strong></article>)}</div>}</section></>}</div>;
}

function ContractsPanel({ user, contracts, events, jobs, applications, form, setForm, onSubmit, loading }: { user: DashboardUser; contracts: Contract[] | null; events: Event[] | null; jobs: Job[] | null; applications: Application[] | null; form: { kind: "A" | "B" | "C"; eventId: string; jobId: string }; setForm: React.Dispatch<React.SetStateAction<typeof form>>; onSubmit: (event: FormEvent<HTMLFormElement>) => void; loading: boolean }) {
  const kinds: Array<"A" | "B" | "C"> = [
    ...(user.accountType === "provider" ? ["A" as const] : []),
    ...((user.accountType === "client" || user.accountType === "provider") ? ["B" as const] : []),
    ...((user.accountType === "provider" || user.accountType === "freelancer") ? ["C" as const] : []),
  ];
  const selectedKind = kinds.includes(form.kind) ? form.kind : kinds[0];
  const contractEvents = events?.filter((item) => (user.accountType !== "provider" || item.providerId === user.id) && (item.status === "booked" || item.status === "completed")) ?? [];
  const acceptedJobIds = new Set(applications?.filter((item) => item.status === "accepted").map((item) => item.jobId));
  const contractJobs = jobs?.filter((item) => acceptedJobIds.has(item.id) && (user.accountType !== "provider" || item.providerId === user.id)) ?? [];
  return <div className="dash-stack"><div className="dash-section-intro"><div><span className="dash-eyebrow">Documentos de trabalho</span><h2>Minutas vinculadas ao contexto.</h2><p>Contratos A, B e C são gerados a partir dos vínculos autorizados e precisam de revisão jurídica.</p></div></div><section className="dash-card dash-notice-card"><div className="dash-notice-icon"><FileCheck2 size={20} /></div><div><strong>Minuta não é promessa de validade jurídica</strong><p>Use os PDFs para revisar dados persistidos. A validade e a adequação à sua operação dependem de revisão profissional.</p></div></section>{!kinds.length ? <section className="dash-card"><EmptyState title="Nenhum contrato disponível para este perfil" detail="Os tipos de minuta são liberados conforme o vínculo da sua conta." /></section> : <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Nova minuta</span><h3>Escolha o tipo e o vínculo</h3></div><Plus size={20} /></div><form className="dash-form" onSubmit={onSubmit}><div className="dash-form-grid"><label className="dash-field"><span>Tipo</span><select value={selectedKind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as "A" | "B" | "C", eventId: "", jobId: "" }))}>{kinds.map((kind) => <option value={kind} key={kind}>{kind === "A" ? "A · plataforma / prestador" : kind === "B" ? "B · cliente / fornecedor" : "C · fornecedor / freelancer"}</option>)}</select></label>{selectedKind === "A" && <div className="dash-field"><span>Vínculo</span><p className="dash-field-help dash-field-help-box">Contrato A é exclusivo do fornecedor e não exige evento ou vaga.</p></div>}{selectedKind === "B" && <label className="dash-field"><span>Evento reservado ou concluído</span><select required value={form.eventId} onChange={(event) => setForm((current) => ({ ...current, eventId: event.target.value }))}><option value="">Selecione um evento</option>{contractEvents.map((item) => <option value={item.id} key={item.id}>{item.title} · {item.status}</option>)}</select><small className="dash-field-help">O contrato B exige um evento booked ou completed.</small></label>}{selectedKind === "C" && <label className="dash-field"><span>Vaga com candidatura aceita</span><select required value={form.jobId} onChange={(event) => setForm((current) => ({ ...current, jobId: event.target.value }))}><option value="">Selecione uma vaga</option>{contractJobs.map((item) => <option value={item.id} key={item.id}>{item.title} · {item.role}</option>)}</select><small className="dash-field-help">O servidor escolhe a candidatura accepted desse job.</small></label>}</div><button className="dash-primary-button" type="submit" disabled={loading}>{loading ? <Loader2 className="dash-spinner" size={16} /> : <FileText size={16} />} Gerar minuta</button></form></section>}<section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Arquivo</span><h3>Seus contratos</h3></div></div>{!contracts?.length ? <EmptyState title="Nenhum contrato ainda" detail="Gere uma minuta a partir de um vínculo autorizado para vê-la aqui." /> : <div className="dash-record-list">{contracts.map((contract) => <article className="dash-record" key={contract.id}><div className="dash-record-main"><span className="dash-list-icon"><FileText size={17} /></span><div><h4>{contract.title}</h4><p>Tipo {contract.kind} · {contract.status}</p><span>{formatDate(contract.createdAt, true)}</span></div></div><button className="dash-small-button" type="button" onClick={() => void downloadAuthenticatedFile(`/contracts/${contract.id}/pdf`, `gastro-contrato-${contract.id}.pdf`)}><Download size={14} /> PDF</button></article>)}</div>}</section></div>;
}

function ReviewsPanel({ reviews, reviewForms, setReviewForms, onSubmit, loadingKey }: { reviews: ReviewsResponse | null; reviewForms: Record<string, { rating: string; feedback: string }>; setReviewForms: React.Dispatch<React.SetStateAction<Record<string, { rating: string; feedback: string }>>>; onSubmit: (pending: PendingReview, target: ReviewTarget) => void; loadingKey: string }) {
  return <div className="dash-stack"><div className="dash-section-intro"><div><span className="dash-eyebrow">Relações transparentes</span><h2>Avaliações 360.</h2><p>Avaliações devidas podem bloquear novas ações transacionais após o prazo de 24h, conforme a regra do servidor.</p></div></div><section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Pendências</span><h3>O que precisa da sua atenção</h3></div><Star size={20} /></div>{!reviews?.pending.length ? <EmptyState title="Nenhuma avaliação pendente" detail="Quando uma participação concluída pedir sua avaliação, ela aparecerá aqui." /> : <div className="dash-review-list">{reviews.pending.map((pending) => <div className="dash-review-event" key={pending.eventId}><strong>{pending.title}</strong>{pending.targets.map((target) => { const key = `${pending.eventId}-${target.id}`; const values = reviewForms[key] ?? { rating: "", feedback: "" }; return <div className="dash-review-form" key={target.id}><div><span>Avaliar</span><b>{target.name}</b></div><select aria-label={`Nota para ${target.name}`} value={values.rating} onChange={(event) => setReviewForms((current) => ({ ...current, [key]: { ...values, rating: event.target.value } }))}><option value="">Nota</option><option value="1">1 · Precisa melhorar</option><option value="2">2</option><option value="3">3 · Adequado</option><option value="4">4</option><option value="5">5 · Excelente</option></select><input aria-label={`Comentário para ${target.name}`} value={values.feedback} onChange={(event) => setReviewForms((current) => ({ ...current, [key]: { ...values, feedback: event.target.value } }))} placeholder="Feedback curto" /><button className="dash-small-button" type="button" disabled={!values.rating || !values.feedback.trim() || loadingKey === `review-${key}`} onClick={() => onSubmit(pending, target)}>{loadingKey === `review-${key}` ? <Loader2 className="dash-spinner" size={14} /> : <Check size={14} />} Enviar</button></div>; })}</div>)}</div>}</section><section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Histórico</span><h3>Avaliações publicadas</h3></div></div>{!reviews?.reviews.length ? <EmptyState title="Nenhuma avaliação publicada" detail="Seu histórico de avaliações aparecerá aqui sem notas inventadas." /> : <div className="dash-record-list">{reviews.reviews.map((review, index) => <article className="dash-record" key={review.id ?? index}><div><h4>{review.targetName || "Participação"}</h4><p>{review.feedback}</p></div><strong className="dash-rating"><Star size={15} /> {review.rating}/5</strong></article>)}</div>}</section></div>;
}

function PlansPanel({ data, loading, onRequest, loadingKey }: { data: SubscriptionsResponse | null; loading: boolean; onRequest: (id: string) => void; loadingKey: string }) {
  return <div className="dash-stack"><div className="dash-section-intro"><div><span className="dash-eyebrow">Cresça no seu ritmo</span><h2>Planos sem cobrança simulada.</h2><p>Escolher um plano registra uma solicitação pendente; pagamento e aprovação não são confirmados automaticamente.</p></div></div><section className="dash-card dash-notice-card"><div className="dash-notice-icon"><ShieldCheck size={20} /></div><div><strong>Provider: status pending requer validação administrativa</strong><p>Uma assinatura pendente não significa pagamento confirmado nem acesso aprovado. A operação depende da homologação.</p></div></section>{loading ? <LoadingState /> : !data?.plans.length ? <section className="dash-card"><EmptyState title="Planos indisponíveis" detail="A API ainda não retornou planos para esta conta." /></section> : <div className="dash-card-grid dash-card-grid-three">{data.plans.map((plan) => <article className="dash-plan-card" key={plan.id}><span className="dash-plan-tag">{plan.days} dias</span><h3>{plan.name}</h3><strong>{plan.priceCents > 0 ? formatMoney(plan.priceCents) : "Preço em definição"}</strong><p>Solicitação com status pending_payment, sem cobrança local; o valor será definido antes de qualquer cobrança.</p><button className="dash-primary-button" type="button" disabled={loadingKey === `plan-${plan.id}`} onClick={() => onRequest(plan.id)}>{loadingKey === `plan-${plan.id}` ? <Loader2 className="dash-spinner" size={16} /> : <CreditCard size={16} />} Solicitar plano</button></article>)}</div>}{data?.subscription && <section className="dash-card"><div className="dash-card-heading"><h3>Solicitação atual</h3><span className="dash-status dash-status-pending">{data.subscription.status}</span></div><p className="dash-muted">Plano {data.subscription.planId} · {data.subscription.createdAt ? formatDate(data.subscription.createdAt, true) : "aguardando data"}</p></section>}</div>;
}

function ProfilePanel({ user, form, setForm, onSubmit, loading }: { user: DashboardUser; form: { name: string; city: string; bio: string; specialty: string }; setForm: React.Dispatch<React.SetStateAction<typeof form>>; onSubmit: (event: FormEvent<HTMLFormElement>) => void; loading: boolean }) {
  return <div className="dash-stack"><div className="dash-section-intro"><div><span className="dash-eyebrow">Identidade da conta</span><h2>Seu perfil, do seu jeito.</h2><p>Avatar com iniciais, sem retratos inventados. Edite apenas os dados suportados pela API.</p></div><span className="dash-avatar dash-avatar-large">{initials(user.name)}</span></div><section className="dash-card"><form className="dash-form" onSubmit={onSubmit}><div className="dash-form-grid"><Field label="Nome" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} required /><Field label="Cidade" value={form.city} onChange={(value) => setForm((current) => ({ ...current, city: value }))} required /><Field label="Especialidade" value={form.specialty} onChange={(value) => setForm((current) => ({ ...current, specialty: value }))} placeholder="Opcional" /></div><label className="dash-field"><span>Bio</span><textarea value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} rows={5} placeholder="Conte um pouco sobre sua experiência e forma de trabalhar." /></label><SubmitButton loading={loading} label="Salvar perfil" /></form></section><section className="dash-card dash-profile-meta"><div><span>E-mail</span><strong>{user.email}</strong></div><div><span>Tipo de conta</span><strong>{accountLabel[user.accountType]}</strong></div><div><span>Status</span><strong>{user.status}</strong></div></section></div>;
}

function IntegrationsPanel({ data, loading, onCheckout, checkoutLoading }: { data: IntegrationsResponse | null; loading: boolean; onCheckout: () => void; checkoutLoading: boolean }) {
  return <div className="dash-stack"><div className="dash-section-intro"><div><span className="dash-eyebrow">Conexões da operação</span><h2>Integrações com status honesto.</h2><p>Nenhuma credencial, split, escrow, biometria ou emissão fiscal é presumida como ativa.</p></div></div>{loading ? <LoadingState /> : <><section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Serviços</span><h3>Estado das integrações</h3></div><Settings2 size={20} /></div>{!data?.integrations.length ? <EmptyState title="Nenhuma integração configurada" detail="A API não retornou integrações para esta conta." /> : <div className="dash-integration-list">{data.integrations.map((integration) => <div className="dash-integration-row" key={integration.id}><span className="dash-list-icon"><Settings2 size={16} /></span><div><strong>{integration.name}</strong><p>{integration.description}</p></div><span className={`dash-status dash-status-${integration.status}`}>{integration.status === "configured" ? "configurada" : "pendente"}</span></div>)}</div>}</section><section className="dash-card dash-checkout-card"><div><span className="dash-eyebrow">Checkout</span><h3>{data?.paymentsLive ? "Checkout disponível" : "Checkout indisponível / em homologação"}</h3><p>{data?.paymentsLive ? "O gateway retornou uma configuração ativa; a API continuará conduzindo o fluxo." : "Ainda não há gateway homologado. O botão consulta o endpoint real e não cria cobrança falsa."}</p></div><button className="dash-outline-button" type="button" onClick={onCheckout} disabled={checkoutLoading}>{checkoutLoading ? <Loader2 className="dash-spinner" size={16} /> : <CreditCard size={16} />} Consultar checkout</button></section></>}</div>;
}

function AdminPanel({ overview, users, coupons, logs, section, setSection, search, setSearch, onUpdateUser, onCreateCoupon, couponForm, setCouponForm, loadingKey }: { overview: AdminOverview | null; users: DashboardUser[] | null; coupons: Coupon[] | null; logs: AuditLog[] | null; section: AdminSection; setSection: (section: AdminSection) => void; search: string; setSearch: (value: string) => void; onUpdateUser: (account: DashboardUser, patch: Partial<Pick<DashboardUser, "name" | "status" | "vip" | "discountPercent" | "featured">>) => void; onCreateCoupon: (event: FormEvent<HTMLFormElement>) => void; couponForm: { code: string; discountPercent: string; cashbackPercent: string }; setCouponForm: React.Dispatch<React.SetStateAction<typeof couponForm>>; loadingKey: string }) {
  const filteredUsers = users?.filter((account) => `${account.name} ${account.email} ${account.city ?? ""}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  return <div className="dash-stack"><div className="dash-section-intro"><div><span className="dash-eyebrow">Acesso restrito</span><h2>Administração auditável.</h2><p>Somente o proprietário autenticado pode validar contas e benefícios. Alterações não são silenciosas.</p></div><button className="dash-outline-button" type="button" onClick={() => void downloadAuthenticatedFile("/report/pdf", "gastro-relatorio.pdf")}><Download size={16} /> Exportar auditoria PDF</button></div><div className="dash-admin-overview">{overview ? <><div><span>Usuários</span><strong>{overview.users}</strong></div><div><span>Eventos</span><strong>{overview.events}</strong></div><div><span>Pendências</span><strong>{overview.pending}</strong></div><div><span>Receita registrada</span><strong>{formatMoney(overview.revenueCents)}</strong></div></> : <div className="dash-admin-empty">Resumo indisponível no momento.</div>}</div><div className="dash-admin-tabs" role="tablist" aria-label="Seções administrativas"><button type="button" className={section === "users" ? "is-active" : ""} onClick={() => setSection("users")}><Users size={16} /> Usuários e validação</button><button type="button" className={section === "coupons" ? "is-active" : ""} onClick={() => setSection("coupons")}><Gift size={16} /> Cupons e cashback</button><button type="button" className={section === "audit" ? "is-active" : ""} onClick={() => setSection("audit")}><ReceiptText size={16} /> Auditoria</button></div>{section === "users" && <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Busca</span><h3>Contas e benefícios</h3></div><label className="dash-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, e-mail ou cidade" /></label></div>{!filteredUsers.length ? <EmptyState title="Nenhuma conta encontrada" detail="A busca não retornou usuários para sua sessão." /> : <div className="dash-admin-users">{filteredUsers.map((account) => <article className="dash-admin-user" key={account.id}><div className="dash-record-main"><span className="dash-avatar dash-avatar-small">{initials(account.name)}</span><div><h4>{account.name}</h4><p>{account.email} · {account.accountType} · {account.city || "cidade não informada"}</p><span>ID {account.id} · {account.status}</span></div></div><div className="dash-admin-controls"><select value={account.status} onChange={(event) => onUpdateUser(account, { status: event.target.value })} disabled={loadingKey === `admin-user-${account.id}`} aria-label={`Status de ${account.name}`}><option value="active">active</option><option value="pending">pending</option><option value="suspended">suspended</option><option value="blocked">blocked</option><option value="deleted">deleted</option></select><label><input type="checkbox" checked={Boolean(account.vip)} onChange={(event) => onUpdateUser(account, { vip: event.target.checked })} /> VIP</label><label><input type="checkbox" checked={Boolean(account.featured)} onChange={(event) => onUpdateUser(account, { featured: event.target.checked })} /> Destaque</label><label className="dash-percent-input"><input type="number" min="0" max="100" value={account.discountPercent ?? 0} onChange={(event) => onUpdateUser(account, { discountPercent: Number(event.target.value) })} /> % desconto</label></div></article>)}</div>}</section>}{section === "coupons" && <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Benefícios comerciais</span><h3>Criar cupom</h3></div><BadgePercent size={20} /></div><form className="dash-form" onSubmit={onCreateCoupon}><div className="dash-form-grid"><Field label="Código" value={couponForm.code} onChange={(value) => setCouponForm((current) => ({ ...current, code: value }))} placeholder="BEMVINDO" required /><Field label="Desconto (%)" type="number" value={couponForm.discountPercent} onChange={(value) => setCouponForm((current) => ({ ...current, discountPercent: value }))} min="0" required /><Field label="Cashback (%)" type="number" value={couponForm.cashbackPercent} onChange={(value) => setCouponForm((current) => ({ ...current, cashbackPercent: value }))} min="0" required /></div><SubmitButton loading={loadingKey === "coupon"} label="Criar cupom" /></form>{!coupons?.length ? <EmptyState title="Nenhum cupom cadastrado" detail="Crie um benefício apenas quando as regras comerciais estiverem definidas." /> : <div className="dash-record-list">{coupons.map((coupon) => <article className="dash-record" key={coupon.id}><div><h4>{coupon.code}</h4><p>{coupon.discountPercent}% desconto · {coupon.cashbackPercent}% cashback</p></div><span className={`dash-status ${coupon.active ? "dash-status-configured" : "dash-status-pending"}`}>{coupon.active ? "ativo" : "inativo"}</span></article>)}</div>}</section>}{section === "audit" && <section className="dash-card"><div className="dash-card-heading"><div><span className="dash-eyebrow">Histórico protegido</span><h3>Log de ações</h3></div><button className="dash-small-button" type="button" onClick={() => void downloadAuthenticatedFile("/report/pdf", "gastro-relatorio.pdf")}><Download size={14} /> PDF</button></div>{!logs?.length ? <EmptyState title="Nenhum log disponível" detail="As ações administrativas registradas aparecerão aqui." /> : <div className="dash-record-list">{logs.map((log) => <article className="dash-record" key={log.id}><div><h4>{log.action}</h4><p>{log.details}</p><span>{formatDate(log.createdAt, true)} · ator #{log.actorId}</span></div><span className="dash-list-icon"><ReceiptText size={16} /></span></article>)}</div>}</section>}</div>;
}

type FieldProps = { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean; min?: string; inputMode?: "decimal" | "numeric" | "text" };
function Field({ label, value, onChange, type = "text", placeholder, required, min, inputMode }: FieldProps) {
  return <label className="dash-field"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} min={min} inputMode={inputMode} /></label>;
}
function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return <button className="dash-primary-button" type="submit" disabled={loading}>{loading ? <Loader2 className="dash-spinner" size={16} /> : <Check size={16} />} {label}</button>;
}
