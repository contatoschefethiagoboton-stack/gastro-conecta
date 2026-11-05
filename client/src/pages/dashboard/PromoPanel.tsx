// Painel do profissional → Divulgar: artes prontas (feed e story) com foto, legenda e link do perfil,
// para ele publicar nas próprias redes. A plataforma gera e envia; quem publica é o profissional.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Image as ImageIcon, Loader2, Megaphone, Share2, Star } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { canvasToFile, drawArt, loadImage, type ArtData, type ArtFormat } from "@/lib/promoArt";

type KitPost = { id: number; kind: "new_provider" | "testimonial"; caption: string; link: string; sentAt: string | null; sharedAt: string | null; quote?: string; rating?: number; author?: string };
type Kit = {
  profile: { name: string; profession: string; city: string; image: string; photos: string[]; rating: { average: number; count: number } | null; listed: boolean };
  link: string;
  caption: string;
  posts: KitPost[];
};

const errText = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir.");
const profileCaption = (kit: Kit) => `📅 Agenda aberta para eventos!\n\n${kit.profile.profession}${kit.profile.city ? ` em ${kit.profile.city} e região` : ""}.\n\nVeja meu perfil, fotos dos meus trabalhos e peça seu orçamento grátis, com contrato em PDF: ${kit.link}\n\n#eventosconecta`;

export function PromoPanel() {
  const [kit, setKit] = useState<Kit | null>(null);
  const [selected, setSelected] = useState<"perfil" | number>("perfil");
  const [format, setFormat] = useState<ArtFormat>("feed");
  const [photo, setPhoto] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    api<Kit>("/promo/kit").then(data => {
      setKit(data);
      setPhoto(data.profile.image || data.profile.photos[0] || "");
      const fresh = data.posts.find(p => !p.sharedAt);
      setSelected(fresh ? fresh.id : "perfil");
    }).catch(e => toast.error(errText(e)));
  }, []);

  const post = typeof selected === "number" ? kit?.posts.find(p => p.id === selected) : undefined;
  useEffect(() => { if (kit) setCaption(post ? post.caption : profileCaption(kit)); }, [kit, selected]);

  const art: ArtData | null = useMemo(() => kit && ({
    kind: post?.kind ?? "perfil",
    name: kit.profile.name,
    profession: kit.profile.profession,
    city: kit.profile.city,
    rating: kit.profile.rating,
    ...(post?.kind === "testimonial" ? { quote: post.quote, author: post.author, stars: post.rating } : {}),
  }), [kit, post]);

  useEffect(() => {
    if (!art || !canvas.current) return;
    let alive = true;
    void (async () => {
      await document.fonts?.ready.catch(() => undefined);
      const img = await loadImage(photo);
      if (alive && canvas.current) drawArt(canvas.current, format, art, img);
    })();
    return () => { alive = false; };
  }, [art, format, photo]);

  const markShared = () => { if (post && !post.sharedAt) void api(`/promo/posts/${post.id}/shared`, { method: "POST" }).then(() => setKit(k => k && { ...k, posts: k.posts.map(p => p.id === post.id ? { ...p, sharedAt: new Date().toISOString() } : p) })).catch(() => undefined); };
  const fileName = `eventos-conecta-${format}.png`;
  const download = async () => {
    if (!canvas.current) return;
    const file = await canvasToFile(canvas.current, fileName);
    if (!file) return toast.error("Não foi possível gerar a imagem.");
    const url = URL.createObjectURL(file);
    const a = document.createElement("a"); a.href = url; a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    markShared();
    toast.success("Imagem baixada. Agora é só publicar e colar a legenda.");
  };
  const share = async () => {
    if (!canvas.current) return;
    setBusy(true);
    try {
      const file = await canvasToFile(canvas.current, fileName);
      try { await navigator.clipboard.writeText(caption); } catch { /* sem área de transferência */ }
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: caption });
        markShared();
      } else {
        await download();
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) toast.error(errText(e));
    } finally { setBusy(false); }
  };
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); toast.success(`${what} copiad${what === "Legenda" ? "a" : "o"}.`); } catch { toast.error("Não foi possível copiar."); } };

  if (!kit) return <section className="dash-card"><Loader2 className="dash-spinner" size={20}/></section>;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return <div className="pr-wrap">
    <section className="dash-card">
      <span className="dash-eyebrow"><Megaphone size={13}/> Divulgue nas suas redes</span>
      <h3 className="pr-title">Artes prontas para o seu Instagram, Facebook e status do WhatsApp</h3>
      <p className="dash-muted">Escolha a arte, toque em <strong>Compartilhar</strong> (no celular abre direto o Instagram ou o WhatsApp) ou em <strong>Baixar</strong>, e cole a legenda. Quem chega pelo seu link cai direto no seu perfil e pede orçamento para você.</p>
      {!kit.profile.listed && <p className="pr-warn">Seu perfil ainda não aparece no catálogo (cadastro em análise ou assinatura pendente). Você já pode baixar as artes; o link mostra o perfil completo assim que ele for liberado.</p>}
    </section>

    <div className="pr-grid">
      <section className="dash-card pr-preview">
        <div className="pr-tabs" role="tablist" aria-label="Formato">
          <button type="button" role="tab" aria-selected={format === "feed"} className={format === "feed" ? "is-active" : ""} onClick={() => setFormat("feed")}>Feed (4:5)</button>
          <button type="button" role="tab" aria-selected={format === "story"} className={format === "story" ? "is-active" : ""} onClick={() => setFormat("story")}>Story / status (9:16)</button>
        </div>
        <canvas ref={canvas} className={`pr-canvas pr-${format}`} aria-label="Prévia da arte"/>
        <div className="cp-actions pr-actions">
          {canShare && <button type="button" className="dash-small-button pr-primary" disabled={busy} onClick={() => void share()}>{busy ? <Loader2 className="dash-spinner" size={14}/> : <Share2 size={14}/>} Compartilhar</button>}
          <button type="button" className={`dash-small-button ${canShare ? "" : "pr-primary"}`} onClick={() => void download()}><Download size={14}/> Baixar imagem</button>
          <button type="button" className="dash-small-button" onClick={() => void copy(caption, "Legenda")}><Copy size={14}/> Copiar legenda</button>
          <button type="button" className="dash-small-button" onClick={() => void copy(kit.link, "Link")}><Copy size={14}/> Copiar link</button>
        </div>
      </section>

      <section className="dash-card pr-side">
        <h4>Qual arte?</h4>
        <div className="pr-choices">
          <button type="button" className={selected === "perfil" ? "is-active" : ""} onClick={() => setSelected("perfil")}><Megaphone size={15}/> Meu perfil (agenda aberta)</button>
          {kit.posts.map(p => <button type="button" key={p.id} className={selected === p.id ? "is-active" : ""} onClick={() => setSelected(p.id)}>
            {p.kind === "testimonial" ? <Star size={15}/> : <ImageIcon size={15}/>} {p.kind === "testimonial" ? `Depoimento de ${p.author}` : "Cheguei no Eventos Conecta"}
            {p.sharedAt ? <span className="pr-done"><Check size={12}/> publicada</span> : <span className="pr-new">nova</span>}
          </button>)}
        </div>
        {kit.profile.photos.length > 1 && <><h4>Foto</h4><div className="pr-photos">{kit.profile.photos.map(src => <button type="button" key={src} className={photo === src ? "is-active" : ""} onClick={() => setPhoto(src)} aria-label="Usar esta foto"><img src={src} alt="" loading="lazy"/></button>)}</div></>}
        <h4>Legenda</h4>
        <textarea className="pr-caption" value={caption} onChange={e => setCaption(e.target.value)} rows={8}/>
        <p className="dash-muted">Dica: no Instagram, coloque o link <strong>{kit.link.replace(/\?.*$/, "")}</strong> na bio ou use a figurinha de link no story.</p>
      </section>
    </div>
  </div>;
}
