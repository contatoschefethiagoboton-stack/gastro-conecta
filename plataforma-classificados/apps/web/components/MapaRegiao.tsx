'use client';
import dynamic from 'next/dynamic';

const MapaBusca = dynamic(() => import('./MapaBusca'), { ssr: false, loading: () => <div className="map" /> });

export default function MapaRegiao({ lat, lng, radiusKm }: { lat: number; lng: number; radiusKm: number }) {
  return <MapaBusca center={[lat, lng]} radiusKm={radiusKm} height={260} />;
}
