'use client';
/** Página inicial / busca pública: sem login, filtros avançados, raio em km, grade ou mapa. */
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import AdCard from '@/components/AdCard';
import Filtros, { countActive, type FiltersState, LIST_KEYS } from '@/components/Filtros';
import { IconFilter, IconGrid, IconLocate, IconMap, IconSearch, IconShield, IconVerified, IconVideo } from '@/components/Icons';
import { api, type SearchItem, type Taxonomy } from '@/lib/api';

const MapaBusca = dynamic(() => import('@/components/MapaBusca'), { ssr: false, loading: () => <div className="map tall" /> });

const SAO_PAULO: [number, number] = [-23.5505, -46.6333];

const DEFAULTS: FiltersState = {
  category: '', gender: [], orientation: [], massageTypes: [], audiences: [], services: [],
  serviceLocations: [], amenities: [], acceptedPayments: [], ageMin: 18, ageMax: 60, radiusKm: 25, q: '', videoCall: false, hasPpv: false,
};

function toQuery(f: FiltersState, center: [number, number], cursor?: string | null) {
  const p = new URLSearchParams({ lat: String(center[0]), lng: String(center[1]), radiusKm: String(f.radiusKm), ageMin: String(f.ageMin), ageMax: String(f.ageMax) });
  if (f.category) p.set('category', f.category);
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.videoCall) p.set('videoCall', 'true');
  if (f.hasPpv) p.set('hasPpv', 'true');
  LIST_KEYS.forEach((k) => f[k].length && p.set(k, f[k].join(',')));
  if (cursor) p.set('cursor', cursor);
  return p.toString();
}

function Busca() {
  const params = useSearchParams();
  const [tax, setTax] = useState<Taxonomy | null>(null);
  const [f, setF] = useState<FiltersState>(DEFAULTS);
  const [text, setText] = useState('');
  const [center, setCenter] = useState<[number, number]>(SAO_PAULO);
  const [placeLabel, setPlaceLabel] = useState('São Paulo, SP');
  const [items, setItems] = useState<SearchItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'map'>('grid');
  const [drawer, setDrawer] = useState(false);

  const set = useCallback((p: Partial<FiltersState>) => setF((prev) => ({ ...prev, ...p })), []);
  const query = useMemo(() => toQuery(f, center), [f, center]);
  const active = countActive(f, DEFAULTS);

  // links do cabeçalho: /?categoria=massagem, /?ppv=1
  useEffect(() => {
    const cat = params.get('categoria');
    set({ category: cat === 'acompanhante' || cat === 'massagem' ? cat : '', hasPpv: params.get('ppv') === '1' });
  }, [params, set]);

  useEffect(() => {
    api<Taxonomy>('/taxonomy').then(setTax).catch(() => setError('Não foi possível carregar os filtros.'));
  }, []);

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
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const loadMore = async () => {
    const r = await api<{ items: SearchItem[]; nextCursor: string | null }>(`/search?${toQuery(f, center, cursor)}`);
    setItems((prev) => [...prev, ...r.items]);
    setCursor(r.nextCursor);
  };

  const nearMe = () =>
    navigator.geolocation?.getCurrentPosition(
      (pos) => { setCenter([pos.coords.latitude, pos.coords.longitude]); setPlaceLabel('Sua localização'); },
      () => setError('Permita o acesso à localização ou escolha a região no mapa.'),
      { enableHighAccuracy: false, timeout: 8000 },
    );

  const resultLabel = loading ? 'Buscando…' : `Ver ${items.length}${cursor ? '+' : ''} resultado${items.length === 1 ? '' : 's'}`;

  return (
    <>
      <section className="hero">
        <span className="badge accent" style={{ marginBottom: 18 }}><IconShield /> 100% dos perfis com identidade verificada</span>
        <h1>Encontre companhia <span className="gradient-text">real</span> perto de você</h1>
        <p>Acompanhantes e massagistas com documento e vídeo verificados. Navegue sem cadastro e fale direto pelo WhatsApp.</p>

        <form className="searchbar" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: text }); }}>
          <div className="field">
            <IconSearch />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Bairro, estilo, palavra-chave…" aria-label="Buscar" />
          </div>
          <span className="divider" />
          <button type="button" className="btn ghost" onClick={nearMe} title="Usar minha localização">
            <IconLocate /> <span>{placeLabel}</span>
          </button>
          <button type="submit" className="btn primary">Buscar</button>
        </form>

        <div className="trust">
          <span><IconVerified style={{ color: '#60a5fa' }} /> Documento + selfie + vídeo</span>
          <span><IconShield /> Seus dados não são exigidos</span>
          <span><IconVideo /> Vídeo de verificação em cada perfil</span>
        </div>
      </section>

      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="Categoria">
          {[{ value: '', label: 'Todos' }, ...(tax?.categories ?? [])].map((c) => (
            <button key={c.value} role="tab" className="tab" aria-selected={f.category === c.value}
              onClick={() => set({ category: c.value, massageTypes: c.value === 'massagem' ? f.massageTypes : [] })}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setDrawer(true)} disabled={!tax}>
          <IconFilter /> Filtros {active > 0 && <span className="count-pill">{active}</span>}
        </button>
        <div className="tabs" role="tablist" aria-label="Visualização">
          <button role="tab" className="tab" aria-selected={view === 'grid'} onClick={() => setView('grid')} aria-label="Grade"><IconGrid width={18} height={18} /></button>
          <button role="tab" className="tab" aria-selected={view === 'map'} onClick={() => setView('map')} aria-label="Mapa"><IconMap width={18} height={18} /></button>
        </div>
      </div>

      {tax && (
        <div className="scroll-x" style={{ marginBottom: 20 }} aria-label="Gênero">
          {tax.genders.map((g) => {
            const on = f.gender.includes(g.value);
            return (
              <button key={g.value} className="chip" aria-pressed={on}
                onClick={() => set({ gender: on ? f.gender.filter((v) => v !== g.value) : [...f.gender, g.value] })}>
                {g.label}
              </button>
            );
          })}
          {f.category === 'massagem' && tax.massageTypes.map((m) => {
            const on = f.massageTypes.includes(m.value);
            return (
              <button key={m.value} className="chip" aria-pressed={on}
                onClick={() => set({ massageTypes: on ? f.massageTypes.filter((v) => v !== m.value) : [...f.massageTypes, m.value] })}>
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, gap: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          {loading ? 'Buscando perfis…' : `${items.length}${cursor ? '+' : ''} perfis`}
          <span className="muted" style={{ fontWeight: 500, fontSize: 15 }}> · até {f.radiusKm} km de {placeLabel}</span>
        </h2>
        {active > 0 && <button className="btn ghost sm" onClick={() => setF({ ...DEFAULTS, category: f.category })}>Limpar filtros</button>}
      </div>

      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 16 }}>{error}</div>}

      {view === 'map' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <MapaBusca center={center} radiusKm={f.radiusKm} items={items} tall
            onMove={(lat, lng) => { setCenter([lat, lng]); setPlaceLabel('Ponto no mapa'); }} />
          <span className="subtle" style={{ fontSize: 13 }}>Clique no mapa para mudar o centro da busca. As posições são aproximadas.</span>
        </div>
      ) : loading && !items.length ? (
        <div className="results">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" />)}</div>
      ) : items.length ? (
        <>
          <div className="results">{items.map((it, i) => <AdCard key={it.id} item={it} priority={i < 4} />)}</div>
          {cursor && <div style={{ display: 'grid', placeItems: 'center', marginTop: 28 }}><button className="btn lg" onClick={loadMore}>Carregar mais perfis</button></div>}
        </>
      ) : (
        <div className="empty">
          <IconSearch width={36} height={36} className="muted" style={{ margin: '0 auto' }} />
          <h3>Nenhum perfil encontrado</h3>
          <p className="muted" style={{ margin: '0 0 18px' }}>Aumente o raio de distância ou remova alguns filtros.</p>
          <button className="btn" onClick={() => set({ radiusKm: Math.min(200, f.radiusKm * 2) })}>Buscar até {Math.min(200, f.radiusKm * 2)} km</button>
        </div>
      )}

      {tax && (
        <Filtros open={drawer} onClose={() => setDrawer(false)} tax={tax} f={f} set={set}
          onReset={() => setF({ ...DEFAULTS, category: f.category })} resultLabel={resultLabel} />
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Busca />
    </Suspense>
  );
}
