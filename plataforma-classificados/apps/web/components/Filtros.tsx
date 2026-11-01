'use client';
/** Painel lateral de filtros (drawer), usado no celular e no computador. */
import { useEffect } from 'react';
import { IconClose } from './Icons';
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
  hasPpv: boolean;
}

export const LIST_KEYS = ['gender', 'orientation', 'massageTypes', 'audiences', 'services', 'serviceLocations', 'amenities', 'acceptedPayments'] as const;
type ListKey = (typeof LIST_KEYS)[number];

export function countActive(f: FiltersState, defaults: FiltersState) {
  let n = LIST_KEYS.reduce((acc, k) => acc + f[k].length, 0);
  if (f.ageMin !== defaults.ageMin || f.ageMax !== defaults.ageMax) n++;
  if (f.radiusKm !== defaults.radiusKm) n++;
  if (f.videoCall) n++;
  if (f.hasPpv) n++;
  return n;
}

function Group({ title, hint, options, value, onChange }: { title: string; hint?: string; options: Option[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="filter-group">
      <h3>{title} {hint && <small>{hint}</small>}</h3>
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

export default function Filtros(props: {
  open: boolean;
  onClose: () => void;
  tax: Taxonomy;
  f: FiltersState;
  set: (p: Partial<FiltersState>) => void;
  onReset: () => void;
  resultLabel: string;
}) {
  const { tax, f, set, open, onClose } = props;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const list = (key: ListKey) => ({ value: f[key], onChange: (v: string[]) => set({ [key]: v } as Partial<FiltersState>) });

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="filters-title">
        <div className="drawer-head">
          <h2 id="filters-title">Filtros</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Fechar filtros"><IconClose /></button>
        </div>

        <div className="drawer-body">
          <div className="filter-group">
            <h3>Distância <small>até {f.radiusKm} km</small></h3>
            <input type="range" min={tax.radiusKm.min} max={tax.radiusKm.max} value={f.radiusKm}
              onChange={(e) => set({ radiusKm: Number(e.target.value) })} style={{ width: '100%' }} aria-label="Raio em km" />
          </div>

          <div className="filter-group">
            <h3>Idade <small>{f.ageMin}–{f.ageMax} anos</small></h3>
            <div className="range-row">
              <label>Mínima<input type="number" min={tax.ageRange.min} max={f.ageMax} value={f.ageMin} onChange={(e) => set({ ageMin: Number(e.target.value) })} /></label>
              <label>Máxima<input type="number" min={f.ageMin} max={tax.ageRange.max} value={f.ageMax} onChange={(e) => set({ ageMax: Number(e.target.value) })} /></label>
            </div>
          </div>

          {f.category === 'massagem' && <Group title="Tipo de massagem" hint="qualquer um" options={tax.massageTypes} {...list('massageTypes')} />}
          <Group title="Orientação" options={tax.orientations} {...list('orientation')} />
          <Group title="Atende" hint="todos selecionados" options={tax.audiences} {...list('audiences')} />
          <Group title="Serviços e práticas" hint="todos selecionados" options={tax.services} {...list('services')} />
          <Group title="Local de atendimento" hint="qualquer um" options={tax.serviceLocations} {...list('serviceLocations')} />
          <Group title="Estrutura" hint="todos selecionados" options={tax.amenities} {...list('amenities')} />
          <Group title="Formas de pagamento" hint="qualquer uma" options={tax.acceptedPayments} {...list('acceptedPayments')} />

          <div className="filter-group" style={{ display: 'grid', gap: 14 }}>
            <label className="switch-row">Faz videochamada
              <input type="checkbox" checked={f.videoCall} onChange={(e) => set({ videoCall: e.target.checked })} />
            </label>
            <label className="switch-row">Tem conteúdo exclusivo
              <input type="checkbox" checked={f.hasPpv} onChange={(e) => set({ hasPpv: e.target.checked })} />
            </label>
          </div>
        </div>

        <div className="drawer-foot">
          <button className="btn ghost" onClick={props.onReset}>Limpar tudo</button>
          <button className="btn primary block" onClick={onClose}>{props.resultLabel}</button>
        </div>
      </aside>
    </>
  );
}
