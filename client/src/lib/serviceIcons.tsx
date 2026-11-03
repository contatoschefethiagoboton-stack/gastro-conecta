import {
  Baby, Beer, Brush, Bus, Cake, Camera, Car, ChefHat, ClipboardList, Coffee, CookingPot, Dog, Droplets, Fish, Flame, Flower2,
  GraduationCap, IceCreamCone, Leaf, Lightbulb, Mic, Music, PartyPopper, Pizza, Sandwich, ShieldCheck, Shirt, Sparkles, Tent,
  Truck, Users, Utensils, Wine, Wrench, type LucideIcon,
} from 'lucide-react';
import type { ServiceIcon } from '@shared/services';

export const SERVICE_ICON_COMPONENTS: Record<ServiceIcon, LucideIcon> = {
  chef: ChefHat, pot: CookingPot, wine: Wine, sparkles: Sparkles, leaf: Leaf, utensils: Utensils,
  cake: Cake, coffee: Coffee, flame: Flame, music: Music, camera: Camera, truck: Truck,
  party: PartyPopper, flower: Flower2, baby: Baby, shield: ShieldCheck, car: Car, clipboard: ClipboardList, users: Users,
  brush: Brush, pizza: Pizza, fish: Fish, beer: Beer, sandwich: Sandwich, ice: IceCreamCone, tent: Tent, lightbulb: Lightbulb,
  shirt: Shirt, droplets: Droplets, wrench: Wrench, dog: Dog, graduation: GraduationCap, bus: Bus, mic: Mic,
};
export const SERVICE_ICON_LABELS: Record<ServiceIcon, string> = {
  chef: 'Chapéu de chef', pot: 'Panela', wine: 'Taça', sparkles: 'Brilho (limpeza)', leaf: 'Folha (jardim)', utensils: 'Talheres',
  cake: 'Bolo', coffee: 'Café', flame: 'Fogo / churrasco', music: 'Música', camera: 'Câmera', truck: 'Caminhão / food truck',
  party: 'Festa', flower: 'Flor / decoração', baby: 'Bebê / babá', shield: 'Escudo / segurança', car: 'Carro / manobrista',
  clipboard: 'Prancheta / cerimonial', users: 'Pessoas / recepção', brush: 'Pincel / maquiagem', pizza: 'Pizza', fish: 'Peixe / sushi',
  beer: 'Chopp / cerveja', sandwich: 'Lanche / salgados', ice: 'Sorvete', tent: 'Tenda / locação', lightbulb: 'Lâmpada / iluminação',
  shirt: 'Camisa / lavanderia', droplets: 'Gotas / piscina', wrench: 'Chave / manutenção', dog: 'Cachorro / pets',
  graduation: 'Capelo / aulas', bus: 'Ônibus / transporte', mic: 'Microfone / apresentador',
};
export const serviceIcon = (icon: string): LucideIcon => SERVICE_ICON_COMPONENTS[icon as ServiceIcon] ?? Utensils;
