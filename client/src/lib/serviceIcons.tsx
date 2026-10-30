import { Cake, Camera, ChefHat, Coffee, CookingPot, Flame, Leaf, Music, Sparkles, Truck, Utensils, Wine, type LucideIcon } from 'lucide-react';
import type { ServiceIcon } from '@shared/services';

export const SERVICE_ICON_COMPONENTS: Record<ServiceIcon, LucideIcon> = {
  chef: ChefHat, pot: CookingPot, wine: Wine, sparkles: Sparkles, leaf: Leaf, utensils: Utensils,
  cake: Cake, coffee: Coffee, flame: Flame, music: Music, camera: Camera, truck: Truck,
};
export const SERVICE_ICON_LABELS: Record<ServiceIcon, string> = {
  chef: 'Chapéu de chef', pot: 'Panela', wine: 'Taça', sparkles: 'Brilho (limpeza)', leaf: 'Folha (jardim)', utensils: 'Talheres',
  cake: 'Bolo', coffee: 'Café', flame: 'Fogo / churrasco', music: 'Música', camera: 'Câmera', truck: 'Entrega',
};
export const serviceIcon = (icon: string): LucideIcon => SERVICE_ICON_COMPONENTS[icon as ServiceIcon] ?? Utensils;
