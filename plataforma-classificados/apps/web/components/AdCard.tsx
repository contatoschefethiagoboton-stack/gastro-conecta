'use client';
import Link from 'next/link';
import { useState } from 'react';
import { IconVerified, IconVideo } from './Icons';
import { brl, type SearchItem } from '@/lib/api';

/** Fundo em gradiente determinístico (por nome) quando não há foto ou ela falha. */
export function Placeholder({ name }: { name: string }) {
  // matiz sempre dentro da paleta da marca (rosa → roxo → azul-violeta)
  const hue = 255 + ([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % 85);
  return (
    <div
      className="placeholder-media"
      style={{ background: `radial-gradient(circle at 30% 20%, hsl(${hue} 80% 55% / .55), transparent 60%), radial-gradient(circle at 80% 90%, hsl(${hue - 40} 80% 50% / .45), transparent 60%), #15121b` }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function AdCard({ item, priority = false }: { item: SearchItem; priority?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link href={`/anuncio/${item.slug}`} className="ad-card" aria-label={`${item.display_name}, ${item.age} anos, ${item.region_label}`}>
      <div className="media">
        {item.cover_url && !broken ? (
          <img src={item.cover_url} alt="" loading={priority ? 'eager' : 'lazy'} onError={() => setBroken(true)} />
        ) : (
          <Placeholder name={item.display_name} />
        )}
      </div>
      <div className="top">
        {item.distance_km !== null ? <span className="badge glass">{item.distance_km < 1 ? '< 1 km' : `${item.distance_km} km`}</span> : <span />}
        {item.offers_video_call && <span className="badge glass" title="Faz videochamada"><IconVideo /></span>}
      </div>
      <div className="info">
        <span className="name">
          {item.display_name}, {item.age}
          <IconVerified aria-label="Identidade verificada" />
        </span>
        <span className="meta">{item.region_label} · {item.city}</span>
        {item.price_from_cents !== null && (
          <span className="price">a partir de <b>{brl(item.price_from_cents)}</b></span>
        )}
      </div>
    </Link>
  );
}
