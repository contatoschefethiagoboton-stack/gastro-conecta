// Painel → Automação e Google: indexação rápida, robô das redes (Instagram, Facebook e WhatsApp)
// e posts automáticos de boas-vindas e depoimentos.
import { useEffect, useState, type ReactNode } from 'react';
import { Bot, Check, Globe, Loader2, Megaphone, Send, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Não foi possível concluir.');
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
function Card({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return <section className="adm-card"><header className="adm-card-head"><h3 className="adm-auto-title">{icon}{title}</h3>{action}</header>{children}</section>;
}
const Spinner = () => <div className="adm-center"><Loader2 className="ob-spin" size={18}/></div>;
const Status = ({ ok, label }: { ok: boolean; label: string }) => <span className={`adm-tag ${ok ? 'adm-ok' : 'adm-warn'}`}>{ok ? '✓' : '•'} {label}{ok ? '' : ': não configurado'}</span>;

type IndexInfo = { google: boolean; indexNow: boolean; googleDailyQuota: number; googleSentToday: number; googleToday?: { ok: number; error: number; skipped: number; lastError: string }; queued: number; log: Array<{ url: string; engine: string; type: string; status: string; detail?: string; createdAt: string }> };
function IndexingCard() {
  const [data, setData] = useState<IndexInfo | null>(null);
  const [busy, setBusy] = useState('');
  const load = () => api<IndexInfo>('/admin/indexing').then(setData).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, []);
  const submit = async (scope: 'main' | 'all') => {
    setBusy(scope);
    try { await api('/admin/indexing/submit', { method: 'POST', body: JSON.stringify({ scope }) }); toast.success('Páginas enviadas aos buscadores.'); await load(); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(''); }
  };
  return <Card title="Indexação rápida (Google e Bing)" icon={<Globe size={18}/>}>
    {!data ? <Spinner/> : <div className="adm-content-fields">
      <p className="adm-muted">Quando um profissional é aprovado, paga, ganha teste ou um serviço novo é criado, o site avisa os buscadores na hora. O <strong>sitemap.xml</strong> continua sendo enviado normalmente pelo Search Console.</p>
      <div className="adm-row-tags adm-status-tags"><Status ok={data.google} label="Google Indexing API"/><Status ok={data.indexNow} label="IndexNow (Bing, Yandex)"/>{data.google && <span className="adm-tag">Google hoje: {data.googleSentToday}/{data.googleDailyQuota}</span>}{data.googleToday && data.googleToday.ok > 0 && <span className="adm-tag adm-ok">✓ Google aceitou {data.googleToday.ok}</span>}{data.googleToday && data.googleToday.error > 0 && <span className="adm-tag adm-warn">Google recusou {data.googleToday.error}</span>}{data.queued > 0 && <span className="adm-tag">{data.queued} na fila</span>}</div>
      {data.googleToday?.error ? <p className="adm-alert">Motivo informado pelo Google: {data.googleToday.lastError || 'sem detalhe'}{/permission|owner|forbidden|403/i.test(data.googleToday.lastError) ? ' — adicione o e-mail da conta de serviço como Proprietário no Search Console.' : ''}</p> : null}
      <div className="adm-trial-row">
        <button type="button" className="ob-btn ob-btn-primary" disabled={!!busy || (!data.google && !data.indexNow)} onClick={() => void submit('main')}>{busy === 'main' ? <Loader2 className="ob-spin" size={16}/> : <Send size={16}/>} Enviar páginas principais</button>
        <button type="button" className="ob-btn ob-btn-outline" disabled={!!busy || !data.indexNow} onClick={() => void submit('all')}>{busy === 'all' ? <Loader2 className="ob-spin" size={16}/> : <Send size={16}/>} Enviar o site inteiro (IndexNow)</button>
      </div>
      {data.log.length ? <div className="adm-auto-log">{data.log.slice(0, 30).map((l, i) => <div key={i}><time>{when(l.createdAt)}</time><span className={`adm-tag ${l.status === 'ok' ? 'adm-ok' : 'adm-warn'}`}>{l.engine} · {l.status}</span><code>{l.url.replace(/^https?:\/\/[^/]+/, '')}</code>{l.detail && <small>{l.detail}</small>}</div>)}</div> : <p className="adm-muted">Nenhum envio ainda.</p>}
    </div>}
  </Card>;
}

type Inbox = { id: number; platform: string; kind: string; senderName?: string; text: string; intent?: string; reply?: string; status: string; error?: string; createdAt: string };
type SocialInfo = { webhook: boolean; pages: boolean; autoReply: boolean; stats: Record<string, number>; inbox: Inbox[] };
const STATUS_LABEL: Record<string, string> = { replied: 'Respondido', ignored: 'Sem pedido (ignorado)', error: 'Erro ao responder', cooldown: 'Já respondido há pouco', paused: 'Robô pausado', pending: 'Processando' };
const PLATFORM: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp' };
function SocialCard() {
  const [data, setData] = useState<SocialInfo | null>(null);
  const [text, setText] = useState('Oi! Preciso de garçom para sábado em Campinas, festa de 80 pessoas');
  const [preview, setPreview] = useState<{ intent: any; reply: string | null } | null>(null);
  const [busy, setBusy] = useState('');
  const load = () => api<SocialInfo>('/admin/social').then(setData).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, []);
  const toggle = async (autoReply: boolean) => { try { await api('/admin/social/settings', { method: 'PUT', body: JSON.stringify({ autoReply }) }); setData(d => d && { ...d, autoReply }); toast.success(autoReply ? 'Robô ligado.' : 'Robô pausado.'); } catch (e) { toast.error(errText(e)); } };
  const simulate = async () => { setBusy('sim'); try { setPreview(await api('/admin/social/preview', { method: 'POST', body: JSON.stringify({ text, platform: 'instagram' }) })); } catch (e) { toast.error(errText(e)); } finally { setBusy(''); } };
  return <Card title="Robô do Instagram, Facebook e WhatsApp" icon={<Bot size={18}/>}>
    {!data ? <Spinner/> : <div className="adm-content-fields">
      <p className="adm-muted">Quem comenta ou manda mensagem procurando um serviço (ex.: “preciso de garçom para sábado”) recebe na hora o link do orçamento já preenchido com serviço, cidade e data. Quem diz que é profissional recebe o link de cadastro. Conversas que não são pedido são ignoradas, e cada pessoa recebe no máximo 1 resposta a cada 12 horas.</p>
      <div className="adm-row-tags adm-status-tags"><Status ok={data.webhook} label="Webhook da Meta"/><Status ok={data.pages} label="Página do Facebook / Instagram"/>{Object.entries(data.stats).map(([k, v]) => <span key={k} className="adm-tag">{STATUS_LABEL[k] ?? k}: {v}</span>)}</div>
      <label className="adm-check"><input type="checkbox" checked={data.autoReply} onChange={e => void toggle(e.target.checked)}/> Responder automaticamente</label>
      <div className="adm-content-field"><span className="adm-content-label">Simular uma mensagem (não envia nada)</span>
        <div className="adm-svc-add"><input value={text} onChange={e => setText(e.target.value)} maxLength={1000}/><button type="button" className="ob-btn ob-btn-outline" disabled={busy === 'sim'} onClick={() => void simulate()}>{busy === 'sim' ? <Loader2 className="ob-spin" size={16}/> : <Sparkles size={16}/>} Simular</button></div>
        {preview && <div className="adm-auto-preview"><p><strong>Entendi:</strong> {preview.intent.kind === 'client' ? 'cliente' : preview.intent.kind === 'provider' ? 'profissional' : 'não é pedido'}{preview.intent.serviceSlug ? ` · ${preview.intent.serviceSlug}` : ''}{preview.intent.city ? ` · ${preview.intent.city}` : ''}{preview.intent.date ? ` · ${preview.intent.date.split('-').reverse().join('/')}` : ''}{preview.intent.guests ? ` · ${preview.intent.guests} pessoas` : ''} ({preview.intent.source === 'ai' ? 'IA' : 'regras'})</p><p><strong>Resposta:</strong> {preview.reply ?? '— (não responde)'}</p></div>}
      </div>
      {data.inbox.length ? <div className="adm-auto-log">{data.inbox.map(m => <div key={m.id}><time>{when(m.createdAt)}</time><span className={`adm-tag ${m.status === 'replied' ? 'adm-ok' : m.status === 'error' ? 'adm-warn' : ''}`}>{PLATFORM[m.platform] ?? m.platform} · {m.kind === 'comment' ? 'comentário' : 'mensagem'} · {STATUS_LABEL[m.status] ?? m.status}</span><code>{m.senderName ? `${m.senderName}: ` : ''}{m.text}</code>{m.error && <small>{m.error}</small>}</div>)}</div> : <p className="adm-muted">Nenhuma mensagem recebida ainda.</p>}
    </div>}
  </Card>;
}

type Post = { id: number; kind: string; caption: string; imageUrl?: string; status: string; error?: string; createdAt: string; publishedAt?: string | null };
type PostsInfo = { autoPublish: boolean; facebook: boolean; instagram: boolean; posts: Post[] };
const POST_STATUS: Record<string, string> = { draft: 'Rascunho', approved: 'Aprovado (sai na próxima rodada)', published: 'Publicado', failed: 'Falhou', discarded: 'Descartado' };
function PostsCard() {
  const [data, setData] = useState<PostsInfo | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState('');
  const load = () => api<PostsInfo>('/admin/social/posts').then(setData).catch(e => toast.error(errText(e)));
  useEffect(() => { void load(); }, []);
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => { setBusy(key); try { await fn(); toast.success(ok); await load(); } catch (e) { toast.error(errText(e)); } finally { setBusy(''); } };
  return <Card title="Posts automáticos" icon={<Megaphone size={18}/>} action={<button type="button" className="ob-btn ob-btn-outline" disabled={!!busy} onClick={() => void act('gen', () => api('/admin/social/posts/generate', { method: 'POST' }), 'Rascunhos atualizados.')}>{busy === 'gen' ? <Loader2 className="ob-spin" size={16}/> : <Sparkles size={16}/>} Gerar agora</button>}>
    {!data ? <Spinner/> : <div className="adm-content-fields">
      <p className="adm-muted">A cada 6 horas o site monta posts de <strong>boas-vindas</strong> aos profissionais novos e de <strong>depoimentos</strong> (nota 4+; só o primeiro nome de quem avaliou), com foto do profissional e link rastreado. Revise e publique com um clique, ou ligue a publicação automática (no máximo 2 por dia).</p>
      <div className="adm-row-tags adm-status-tags"><Status ok={data.facebook} label="Facebook"/><Status ok={data.instagram} label="Instagram"/></div>
      <label className="adm-check"><input type="checkbox" checked={data.autoPublish} onChange={e => void act('auto', () => api('/admin/social/posts-settings', { method: 'PUT', body: JSON.stringify({ autoPublish: e.target.checked }) }), e.target.checked ? 'Publicação automática ligada.' : 'Publicação automática desligada.')}/> Publicar automaticamente (até 2 por dia)</label>
      {!data.posts.length ? <p className="adm-muted">Nenhum post ainda. Eles aparecem quando houver profissionais novos ou depoimentos.</p> : <div className="adm-auto-posts">{data.posts.map(p => <article key={p.id} className="adm-auto-post">
        {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy"/> : <div className="adm-auto-noimg">Sem foto</div>}
        <div>
          <div className="adm-row-tags adm-status-tags"><span className="adm-tag">{p.kind === 'testimonial' ? 'Depoimento' : 'Boas-vindas'}</span><span className={`adm-tag ${p.status === 'published' ? 'adm-ok' : p.status === 'failed' ? 'adm-warn' : ''}`}>{POST_STATUS[p.status] ?? p.status}{p.publishedAt ? ` em ${when(p.publishedAt)}` : ''}</span></div>
          <textarea rows={6} value={edits[p.id] ?? p.caption} disabled={p.status === 'published'} onChange={e => setEdits(x => ({ ...x, [p.id]: e.target.value }))}/>
          {p.error && <small className="adm-muted">{p.error}</small>}
          {p.status !== 'published' && <div className="adm-row-actions">
            {edits[p.id] !== undefined && edits[p.id] !== p.caption && <button type="button" onClick={() => void act(`s-${p.id}`, () => api(`/admin/social/posts/${p.id}`, { method: 'PATCH', body: JSON.stringify({ caption: edits[p.id] }) }), 'Legenda salva.')}><Check size={14}/> Salvar legenda</button>}
            <button type="button" disabled={!!busy || !data.facebook} onClick={() => void act(`p-${p.id}`, () => api(`/admin/social/posts/${p.id}/publish`, { method: 'POST' }), 'Publicado!')}>{busy === `p-${p.id}` ? <Loader2 className="ob-spin" size={14}/> : <Send size={14}/>} Publicar agora</button>
            {p.status !== 'discarded' ? <button type="button" className="danger" onClick={() => void act(`d-${p.id}`, () => api(`/admin/social/posts/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'discarded' }) }), 'Descartado.')}><Trash2 size={14}/> Descartar</button>
              : <button type="button" onClick={() => void act(`r-${p.id}`, () => api(`/admin/social/posts/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'draft' }) }), 'Voltou para rascunho.')}><X size={14}/> Desfazer</button>}
          </div>}
        </div>
      </article>)}</div>}
    </div>}
  </Card>;
}

export function AutomationSection() {
  return <div className="adm-stack"><IndexingCard/><SocialCard/><PostsCard/></div>;
}
