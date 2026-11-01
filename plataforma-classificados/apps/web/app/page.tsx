'use client';
/** Busca pública: sem login, filtros avançados + raio em km + mapa. */
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Filtros, { type FiltersState } from '@/components/Filtros';
import { api, brl, type SearchItem, type Taxonomy } from '@/lib/api';

const MapaBusca = dynamic(() => import('@/components/MapaBusca'), { ssr: false });

const SAO_PAULO: [number, number] = [-23.5505, -46.6333];

const initial: FiltersState = {
  category: '', gender: [], orientation: [], massageTypes: [], audiences: [], services: [],
  serviceLocations: [], amenities: [], acceptedPayments: [], ageMin: 18, ageMax: 60, radiusKm: 10, q: '', videoCall: false,
};

function toQuery(f: FiltersState, center: [number, number], cursor?: string | null) {
  const p = new URLSearchParams({ lat: String(center[0]), lng: String(center[1]), radiusKm: String(f.radiusKm), ageMin: String(f.ageMin), ageMax: String(f.ageMax) });
  if (f.category) p.set('category', f.category);
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.videoCall) p.set('videoCall', 'true');
  (['gender', 'orientation', 'massageTypes', 'audiences', 'services', 'serviceLocations', 'amenities', 'acceptedPayments'] as const).forEach((k) => {
    if (f[k].length) p.set(k, f[k].join(','));
  });
  if (cursor) p.set('cursor', cursor);
  return p.toString();
}

export default function BuscaPage() {
  const [tax, setTax] = useState<Taxonomy | null>(null);
  const [f, setF] = useState<FiltersState>(initial);
  const [center, setCenter] = useState<[number, number]>(SAO_PAULO);
  const [items, setItems] = useState<SearchItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback((p: Partial<FiltersState>) => setF((prev) => ({ ...prev, ...p })), []);
  const query = useMemo(() => toQuery(f, center), [f, center]);

  useEffect(() => {
    api<Taxonomy>('/taxonomy').then(setTax).catch(() => setError('Não foi possível carregar os filtros.'));
  }, []);

  // debounce de 300 ms para não disparar uma busca por tecla
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await api<{ items: SearchItem[]; nextCursor: string | null }>(`/search?${query}`);
        setItems(r.items);
        setCursor(r.nextCursor);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const loadMore = async () => {
    const r = await api<{ items: SearchItem[]; nextCursor: string | null }>(`/search?${toQuery(f, center, cursor)}`);
    setItems((prev) => [...prev, ...r.items]);
    setCursor(r.nextCursor);
  };

  const useMyLocation = () =>
    navigator.geolocation?.getCurrentPosition(
      (pos) => setCenter([pos.coords.latitude, pos.coords.longitude]),
      () => setError('Permita o acesso à localização ou clique no mapa para escolher a região.'),
      { enableHighAccuracy: false, timeout: 8000 },
    );

  return (
    <div className="layout-search">
      {tax ? <Filtros tax={tax} f={f} set={set} /> : <aside className="card muted">Carregando filtros…</aside>}

      <section style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" onClick={useMyLocation}>📍 Perto de mim</button>
          <span className="muted">Ou clique no mapa para escolher o centro da busca.</span>
        </div>
        <MapaBusca center={center} radiusKm={f.radiusKm} items={items} onMove={(lat, lng) => setCenter([lat, lng])} />

        {error && <div className="card" style={{ borderColor: 'var(--danger)' }}>{error}</div>}
        <div className="muted">{loading ? 'Buscando…' : `${items.length}${cursor ? '+' : ''} anúncios num raio de ${f.radiusKm} km`}</div>

        <div className="grid">
          {items.map((it) => (
            <Link key={it.id} href={`/anuncio/${it.slug}`} className="card ad-card">
              {it.cover_url ? <img className="cover" src={it.cover_url} alt="" loading="lazy" /> : <div className="cover" />}
              <div className="body">
                <strong>{it.display_name}, {it.age}</strong>
                <span className="muted">{it.region_label} · {it.city}</span>
                <span className="muted">
                  {it.distance_km !== null && `${it.distance_km} km · `}
                  {it.price_from_cents !== null && `a partir de ${brl(it.price_from_cents)}`}
                </span>
                {it.offers_video_call && <span className="badge">Videochamada</span>}
              </div>
            </Link>
          ))}
        </div>
        {cursor && <button className="btn" onClick={loadMore}>Carregar mais</button>}
      </section>
    </div>
  );
}
