'use client';
import type { Option, Taxonomy } from '@/lib/api';

export interface FiltersState {
  category: string;
  gender: string[];
  orientation: string[];
  massageTypes: string[];
  audiences: string[];
  services: string[];
  serviceLocations: string[];
  amenities: string[];
  acceptedPayments: string[];
  ageMin: number;
  ageMax: number;
  radiusKm: number;
  q: string;
  videoCall: boolean;
}

type ListKey = 'gender' | 'orientation' | 'massageTypes' | 'audiences' | 'services' | 'serviceLocations' | 'amenities' | 'acceptedPayments';

function Chips({ title, hint, options, value, onChange }: { title: string; hint?: string; options: Option[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <h3>{title} {hint && <span style={{ textTransform: 'none', letterSpacing: 0 }}>· {hint}</span>}</h3>
      <div className="chips">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button key={o.value} type="button" className="chip" aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Filtros({ tax, f, set }: { tax: Taxonomy; f: FiltersState; set: (p: Partial<FiltersState>) => void }) {
  const list = (key: ListKey) => ({ value: f[key], onChange: (v: string[]) => set({ [key]: v } as Partial<FiltersState>) });
  return (
    <aside className="filters card">
      <label>
        Buscar
        <input value={f.q} placeholder="bairro, estilo, palavra-chave" onChange={(e) => set({ q: e.target.value })} />
      </label>

      <div>
        <h3>Categoria</h3>
        <div className="chips">
          {[{ value: '', label: 'Todas' }, ...tax.categories].map((c) => (
            <button key={c.value} type="button" className="chip" aria-pressed={f.category === c.value}
              onClick={() => set({ category: c.value, massageTypes: c.value === 'massagem' ? f.massageTypes : [] })}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <Chips title="Gênero" options={tax.genders} {...list('gender')} />
      {f.category === 'massagem' && <Chips title="Tipo de massagem" options={tax.massageTypes} {...list('massageTypes')} />}
      <Chips title="Orientação" options={tax.orientations} {...list('orientation')} />
      <Chips title="Atende" hint="todos" options={tax.audiences} {...list('audiences')} />
      <Chips title="Serviços" hint="todos" options={tax.services} {...list('services')} />
      <Chips title="Local" options={tax.serviceLocations} {...list('serviceLocations')} />
      <Chips title="Estrutura" hint="todos" options={tax.amenities} {...list('amenities')} />
      <Chips title="Pagamento" options={tax.acceptedPayments} {...list('acceptedPayments')} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label>Idade mín.<input type="number" min={tax.ageRange.min} max={f.ageMax} value={f.ageMin} onChange={(e) => set({ ageMin: Number(e.target.value) })} /></label>
        <label>Idade máx.<input type="number" min={f.ageMin} max={tax.ageRange.max} value={f.ageMax} onChange={(e) => set({ ageMax: Number(e.target.value) })} /></label>
      </div>

      <label>
        Raio: {f.radiusKm} km
        <input type="range" min={tax.radiusKm.min} max={tax.radiusKm.max} value={f.radiusKm} onChange={(e) => set({ radiusKm: Number(e.target.value) })} />
      </label>

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={f.videoCall} onChange={(e) => set({ videoCall: e.target.checked })} />
        Faz videochamada
      </label>
    </aside>
  );
}
