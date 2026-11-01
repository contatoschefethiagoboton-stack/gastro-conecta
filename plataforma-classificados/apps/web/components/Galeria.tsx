'use client';
import { useState } from 'react';
import { Placeholder } from './AdCard';
import { IconChevronLeft, IconChevronRight } from './Icons';

export interface MediaItem { id: string; kind: 'photo' | 'video'; url: string }

export default function Galeria({ media, name }: { media: MediaItem[]; name: string }) {
  const [i, setI] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const current = media[i];
  const go = (d: number) => setI((v) => (v + d + media.length) % media.length);

  return (
    <div className="gallery">
      <div className="gallery-main">
        {!current || broken[current.id] ? (
          <Placeholder name={name} />
        ) : current.kind === 'photo' ? (
          <img src={current.url} alt={`Foto ${i + 1} de ${name}`} onError={() => setBroken((b) => ({ ...b, [current.id]: true }))} />
        ) : (
          <video src={current.url} controls playsInline preload="metadata" />
        )}
        {media.length > 1 && (
          <>
            <button className="btn icon nav-btn prev badge glass" style={{ height: 42, width: 42 }} onClick={() => go(-1)} aria-label="Anterior"><IconChevronLeft /></button>
            <button className="btn icon nav-btn next badge glass" style={{ height: 42, width: 42 }} onClick={() => go(1)} aria-label="Próxima"><IconChevronRight /></button>
            <span className="badge glass counter">{i + 1} / {media.length}</span>
          </>
        )}
      </div>
      {media.length > 1 && (
        <div className="thumbs">
          {media.map((m, idx) => (
            <button key={m.id} className="thumb" aria-current={idx === i} onClick={() => setI(idx)} aria-label={`Ver mídia ${idx + 1}`}>
              {m.kind === 'photo' && !broken[m.id] ? (
                <img src={m.url} alt="" loading="lazy" onError={() => setBroken((b) => ({ ...b, [m.id]: true }))} />
              ) : (
                <Placeholder name={m.kind === 'video' ? '▶' : name} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
