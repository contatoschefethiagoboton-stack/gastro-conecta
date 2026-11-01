/** Página pública do anúncio (renderizada no servidor; boa para SEO e desempenho). */
import { notFound } from 'next/navigation';
import DenunciaBotao from '@/components/DenunciaBotao';
import MapaRegiao from '@/components/MapaRegiao';
import VitrinePPV from '@/components/VitrinePPV';
import { API_URL, brl, type Taxonomy } from '@/lib/api';

export const revalidate = 60;

interface Ad {
  id: string; slug: string; title: string; description: string; display_name: string; age: number;
  is_verified: boolean; verification_video_url: string | null; category: string; gender: string; orientation: string;
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
  return data ? { title: `${data.ad.display_name} · ${data.ad.region_label}` } : {};
}

export default async function AnuncioPage({ params }: { params: { slug: string } }) {
  const data = await load(params.slug);
  if (!data) notFound();
  const { ad, tax } = data;

  const labels = new Map(Object.values(tax).flatMap((v) => (Array.isArray(v) ? v.map((o) => [o.value, o.label] as const) : [])));
  const L = (vs: string[]) => vs.map((v) => labels.get(v) ?? v);
  const wa = ad.whatsapp?.replace(/\D/g, '');
  const msg = encodeURIComponent(`Olá ${ad.display_name}, vi seu anúncio e gostaria de mais informações.`);

  const facts: [string, string[]][] = [
    ['Massagens', L(ad.massage_types)],
    ['Atende', L(ad.audiences)],
    ['Serviços', L(ad.services)],
    ['Local', L(ad.service_locations)],
    ['Estrutura', L(ad.amenities)],
    ['Pagamento', L(ad.accepted_payments)],
  ];

  return (
    <article style={{ display: 'grid', gap: 16, padding: '16px 0' }}>
      <header style={{ display: 'grid', gap: 4 }}>
        <h1 style={{ margin: 0 }}>{ad.display_name}, {ad.age}</h1>
        <div className="muted">{ad.title} · {ad.region_label}, {ad.city}{ad.state ? `/${ad.state}` : ''}</div>
        <div className="chips">
          {ad.is_verified && <span className="badge ok">✔ Identidade verificada (+18)</span>}
          <span className="badge">{labels.get(ad.category)} · {labels.get(ad.gender)}</span>
          <span className="badge">{labels.get(ad.orientation)}</span>
          {ad.offers_video_call && <span className="badge">Videochamada</span>}
        </div>
      </header>

      <section className="card contact" aria-label="Contato">
        {wa && <a className="btn primary" href={`https://wa.me/${wa}?text=${msg}`} target="_blank" rel="noopener noreferrer nofollow">WhatsApp</a>}
        {ad.telegram && <a className="btn" href={`https://t.me/${ad.telegram}`} target="_blank" rel="noopener noreferrer nofollow">Telegram</a>}
        {ad.phone_public && <a className="btn" href={`tel:${ad.phone_public}`}>Ligar</a>}
        {ad.external_links.map((l) => (
          <a key={l.url} className="btn" href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc">{l.label}</a>
        ))}
      </section>

      {ad.verification_video_url && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Vídeo de verificação</h2>
          <p className="muted">Gravado com código-desafio único e conferido pela nossa equipe junto ao documento oficial.</p>
          <video src={ad.verification_video_url} controls playsInline preload="metadata" style={{ maxHeight: 480 }} />
        </section>
      )}

      <section className="grid" aria-label="Galeria">
        {ad.media.map((m) =>
          m.kind === 'photo' ? (
            <img key={m.id} src={m.url} alt="" loading="lazy" style={{ borderRadius: 12, width: '100%', aspectRatio: '3/4', objectFit: 'cover' }} />
          ) : (
            <video key={m.id} src={m.url} controls playsInline preload="metadata" style={{ borderRadius: 12 }} />
          ),
        )}
      </section>

      <section className="card" style={{ whiteSpace: 'pre-line' }}>{ad.description}</section>

      <section className="card" style={{ display: 'grid', gap: 12 }}>
        {facts.filter(([, v]) => v.length).map(([k, v]) => (
          <div key={k}><strong>{k}: </strong><span className="muted">{v.join(' · ')}</span></div>
        ))}
      </section>

      {ad.prices.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Valores</h2>
          <table><tbody>
            {ad.prices.map((p) => <tr key={p.label}><td>{p.label}</td><td style={{ textAlign: 'right' }}>{brl(p.priceCents)}</td></tr>)}
          </tbody></table>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Região de atendimento</h2>
        <p className="muted">Área aproximada — o endereço exato é combinado diretamente com o anunciante.</p>
        <MapaRegiao lat={ad.lat} lng={ad.lng} radiusKm={Math.max(ad.service_radius_km, 1)} />
      </section>

      <VitrinePPV adId={ad.id} />
      <DenunciaBotao adId={ad.id} />
    </article>
  );
}
