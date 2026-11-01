/** Perfil público do anúncio (SSR). */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import DenunciaBotao from '@/components/DenunciaBotao';
import Galeria from '@/components/Galeria';
import { IconChevronRight, IconLink, IconPhone, IconPin, IconSend, IconShield, IconVerified, IconVideo, IconWhatsApp } from '@/components/Icons';
import MapaRegiao from '@/components/MapaRegiao';
import VitrinePPV from '@/components/VitrinePPV';
import { API_URL, brl, type Taxonomy } from '@/lib/api';

export const revalidate = 60;

interface Ad {
  id: string; slug: string; title: string; description: string; display_name: string; age: number;
  is_verified: boolean; verified_at: string | null; verification_video_url: string | null; category: string; gender: string; orientation: string;
  massage_types: string[]; audiences: string[]; services: string[]; service_locations: string[]; amenities: string[];
  accepted_payments: string[]; whatsapp: string | null; telegram: string | null; phone_public: string | null;
  offers_video_call: boolean; external_links: { label: string; url: string }[];
  region_label: string; city: string; state: string | null; lat: number; lng: number; service_radius_km: number;
  prices: { label: string; durationMinutes: number | null; priceCents: number }[];
  media: { id: string; kind: 'photo' | 'video'; url: string }[];
}

async function load(slug: string) {
  const [adRes, taxRes] = await Promise.all([
    fetch(`${API_URL}/ads/${encodeURIComponent(slug)}`, { next: { revalidate: 60 } }),
    fetch(`${API_URL}/taxonomy`, { next: { revalidate: 3600 } }),
  ]);
  if (adRes.status === 404) return null;
  if (!adRes.ok) throw new Error('Falha ao carregar anúncio');
  return { ad: (await adRes.json()) as Ad, tax: (await taxRes.json()) as Taxonomy };
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const data = await load(params.slug);
  return data ? { title: `${data.ad.display_name}, ${data.ad.age} · ${data.ad.region_label}`, description: data.ad.title } : {};
}

export default async function AnuncioPage({ params }: { params: { slug: string } }) {
  const data = await load(params.slug);
  if (!data) notFound();
  const { ad, tax } = data;

  const labels = new Map(Object.values(tax).flatMap((v) => (Array.isArray(v) ? v.map((o) => [o.value, o.label] as const) : [])));
  const L = (vs: string[]) => vs.map((v) => labels.get(v) ?? v);
  const wa = ad.whatsapp?.replace(/\D/g, '');
  const waHref = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Olá ${ad.display_name}, vi seu perfil no Belíssima VIP e gostaria de mais informações.`)}` : null;
  const fromPrice = ad.prices.length ? Math.min(...ad.prices.map((p) => p.priceCents)) : null;

  const facts: [string, string[]][] = [
    ['Tipos de massagem', L(ad.massage_types)],
    ['Atende', L(ad.audiences)],
    ['Serviços', L(ad.services)],
    ['Local de atendimento', L(ad.service_locations)],
    ['Estrutura', L(ad.amenities)],
    ['Formas de pagamento', L(ad.accepted_payments)],
  ];

  return (
    <>
      <nav className="breadcrumb" aria-label="Navegação">
        <Link href="/">Início</Link><IconChevronRight width={14} height={14} />
        <Link href={`/?categoria=${ad.category}`}>{labels.get(ad.category)}</Link><IconChevronRight width={14} height={14} />
        <span>{ad.city}</span>
      </nav>

      <article className="profile">
        <div style={{ display: 'grid', gap: 28, minWidth: 0 }}>
          <Galeria media={ad.media} name={ad.display_name} />

          <header className="profile-head">
            <h1>
              {ad.display_name}, {ad.age}
              {ad.is_verified && <IconVerified aria-label="Verificada" />}
            </h1>
            <div className="sub"><IconPin /> {ad.region_label}, {ad.city}{ad.state ? ` · ${ad.state}` : ''} · atende num raio de {ad.service_radius_km} km</div>
            <div className="chips">
              {ad.is_verified && <span className="badge ok"><IconShield /> Identidade verificada</span>}
              <span className="badge">{labels.get(ad.category)} · {labels.get(ad.gender)}</span>
              <span className="badge">{labels.get(ad.orientation)}</span>
              {ad.offers_video_call && <span className="badge"><IconVideo /> Videochamada</span>}
            </div>
          </header>

          <section>
            <h2 className="section-title">{ad.title}</h2>
            <p className="muted" style={{ whiteSpace: 'pre-line', margin: 0, fontSize: 16, lineHeight: 1.7 }}>{ad.description}</p>
          </section>

          {ad.prices.length > 0 && (
            <section>
              <h2 className="section-title">Valores</h2>
              <div className="prices">
                {ad.prices.map((p) => (
                  <div key={p.label} className="price-card">
                    <div className="muted" style={{ fontSize: 13 }}>{p.label}</div>
                    <div className="v">{brl(p.priceCents)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card facts">
            {facts.filter(([, v]) => v.length).map(([k, v]) => (
              <div key={k} className="fact">
                <h4>{k}</h4>
                <div className="chips">{v.map((x) => <span key={x} className="tag">{x}</span>)}</div>
              </div>
            ))}
          </section>

          <VitrinePPV adId={ad.id} />

          <section>
            <h2 className="section-title">Região de atendimento</h2>
            <MapaRegiao lat={ad.lat} lng={ad.lng} radiusKm={Math.max(ad.service_radius_km, 1)} />
            <p className="subtle" style={{ fontSize: 13 }}>Área aproximada. O endereço é combinado diretamente com o anunciante.</p>
          </section>
        </div>

        <aside className="aside-sticky">
          <div className="card solid contact-card">
            {fromPrice !== null && <div className="from">a partir de<b>{brl(fromPrice)}</b></div>}
            {waHref && <a className="btn whatsapp lg block" href={waHref} target="_blank" rel="noopener noreferrer nofollow"><IconWhatsApp /> Chamar no WhatsApp</a>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {ad.telegram && <a className="btn block" href={`https://t.me/${ad.telegram}`} target="_blank" rel="noopener noreferrer nofollow"><IconSend /> Telegram</a>}
              {ad.phone_public && <a className="btn block" href={`tel:${ad.phone_public}`}><IconPhone /> Ligar</a>}
            </div>
            {ad.external_links.length > 0 && (
              <div className="chips">
                {ad.external_links.map((l) => (
                  <a key={l.url} className="btn sm" href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc"><IconLink /> {l.label}</a>
                ))}
              </div>
            )}
            <p className="subtle" style={{ fontSize: 12, margin: 0 }}>
              Nunca faça pagamento antecipado para desconhecidos. Diga que viu o perfil no Belíssima VIP.
            </p>
          </div>

          {ad.verification_video_url && (
            <div className="card" style={{ display: 'grid', gap: 10 }}>
              <strong style={{ display: 'flex', gap: 8, alignItems: 'center' }}><IconShield style={{ width: 18, color: 'var(--ok)' }} /> Vídeo de verificação</strong>
              <video src={ad.verification_video_url} controls playsInline preload="metadata" style={{ borderRadius: 12, width: '100%' }} />
              <span className="subtle" style={{ fontSize: 12 }}>Gravado com código único e conferido com documento oficial pela nossa equipe.</span>
            </div>
          )}

          <DenunciaBotao adId={ad.id} />
        </aside>
      </article>

      {(waHref || ad.phone_public) && (
        <div className="mobile-cta">
          {waHref && <a className="btn whatsapp lg" href={waHref} target="_blank" rel="noopener noreferrer nofollow"><IconWhatsApp /> WhatsApp</a>}
          {ad.phone_public && <a className="btn lg" href={`tel:${ad.phone_public}`}><IconPhone /> Ligar</a>}
        </div>
      )}
    </>
  );
}
