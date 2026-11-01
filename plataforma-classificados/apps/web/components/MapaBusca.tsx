'use client';
/**
 * Mapa interativo (Leaflet). Clique no mapa para mudar o centro da busca;
 * o círculo mostra o raio em km. Os pontos são APROXIMADOS (centro da região).
 * Produção: use um provedor de tiles com SLA (MapTiler, Stadia, Mapbox) via NEXT_PUBLIC_TILE_URL —
 * os servidores públicos do OpenStreetMap não suportam tráfego alto.
 */
import 'leaflet/dist/leaflet.css';
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { useEffect } from 'react';
import type { SearchItem } from '@/lib/api';

const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
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
}) {
  const zoom = props.radiusKm > 50 ? 8 : props.radiusKm > 15 ? 10 : 12;
  return (
    <div className="map" style={props.height ? { height: props.height } : undefined}>
      <MapContainer center={props.center} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer url={TILE_URL} attribution="&copy; OpenStreetMap" />
        <Recenter center={props.center} />
        {props.onMove && <ClickToMove onMove={props.onMove} />}
        <Circle center={props.center} radius={props.radiusKm * 1000} pathOptions={{ color: '#e0457b', weight: 1, fillOpacity: 0.08 }} />
        {props.items?.map((it) => (
          <CircleMarker key={it.id} center={[it.lat, it.lng]} radius={7} pathOptions={{ color: '#fff', fillColor: '#e0457b', fillOpacity: 0.9, weight: 1 }}>
            <Tooltip>{it.display_name} · {it.region_label}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
