'use client';
/**
 * Mapa interativo (Leaflet). Clique no mapa para mudar o centro da busca;
 * o círculo mostra o raio em km. Os pontos são APROXIMADOS (centro da região).
 * Produção: use um provedor de tiles com SLA (MapTiler, Stadia, Mapbox) via NEXT_PUBLIC_TILE_URL —
 * o padrão abaixo é o tema escuro da CARTO, que exige atribuição e tem limites de uso.
 */
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { SearchItem } from '@/lib/api';

const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL ?? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTRIBUTION = '&copy; OpenStreetMap &copy; CARTO';

const pin = (label: string) =>
  L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-100%);display:inline-flex;align-items:center;height:28px;padding:0 10px;border-radius:999px;background:linear-gradient(135deg,#ff3d7f,#7c5cff);color:#fff;font:700 12px/1 system-ui;white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.45);border:2px solid #fff">${label}</div>`,
    iconSize: [0, 0],
  });

function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

function ClickToMove({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMove(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function MapaBusca(props: {
  center: [number, number];
  radiusKm: number;
  items?: SearchItem[];
  onMove?: (lat: number, lng: number) => void;
  height?: number;
  tall?: boolean;
}) {
  const router = useRouter();
  const zoom = props.radiusKm > 80 ? 8 : props.radiusKm > 30 ? 9 : props.radiusKm > 12 ? 10 : props.radiusKm > 4 ? 12 : 13;
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return (
    <div className={`map${props.tall ? ' tall' : ''}`} style={props.height ? { height: props.height } : undefined}>
      <MapContainer center={props.center} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
        <Recenter center={props.center} zoom={zoom} />
        {props.onMove && <ClickToMove onMove={props.onMove} />}
        <Circle center={props.center} radius={props.radiusKm * 1000} pathOptions={{ color: '#ff3d7f', weight: 1.5, fillColor: '#ff3d7f', fillOpacity: 0.08 }} />
        {props.items?.map((it) => (
          <Marker key={it.id} position={[it.lat, it.lng]} icon={pin(escape(it.display_name))}
            eventHandlers={{ click: () => router.push(`/anuncio/${it.slug}`) }}>
            <Tooltip direction="top" offset={[0, -30]}>{it.age} anos · {it.region_label}</Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
