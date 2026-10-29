import type { ServiceGroup } from './services';

export type Professional = {
  id: string;
  name: string;
  type: ServiceGroup;
  category: string;
  city: string;
  description: string;
  image: string;
  price: number;
  tags: string[];
  featured: boolean;
  demo: boolean;
  gallery?: string[];
  socials?: Array<{ network: string; url: string }>;
  website?: string;
  /** Serviços oferecidos (rótulos). */
  services?: string[];
  rating?: { average: number; count: number };
  /** Selo "Top Rated": média 4,5+ com 3 ou mais avaliações. */
  topRated?: boolean;
};

export const heroImage = '/img/hero.svg';
export const professionals: Professional[] = [
  {
    id: 'demo-chef', name: 'Ateliê da Mesa', type: 'Gastronomia',
    category: 'Italiana contemporânea', city: 'São Paulo, SP',
    description: 'Um jantar feito para o seu momento. Menus autorais inspirados na cozinha italiana, com ingredientes frescos e um cuidado especial em cada detalhe.',
    image: '/img/demo-chef.svg',
    price: 180, tags: ['Chef executivo', 'Jantar em casa'], featured: true, demo: true,
  },
  {
    id: 'demo-buffet', name: 'Essência Buffet', type: 'Gastronomia',
    category: 'Celebrações & eventos', city: 'São Paulo, SP',
    description: 'Da recepção intimista à grande celebração, uma experiência gastronômica pensada para receber bem. Cozinha brasileira contemporânea e serviço acolhedor.',
    image: '/img/demo-buffet.svg',
    price: 120, tags: ['Buffet', 'Eventos corporativos'], featured: false, demo: true,
  },
  {
    id: 'demo-brasa', name: 'Casa & Brasa', type: 'Gastronomia',
    category: 'Brasileira & fogo', city: 'Campinas, SP',
    description: 'O encontro entre o sabor da brasa e a hospitalidade brasileira. Cortes selecionados, acompanhamentos sazonais e uma mesa que convida a ficar.',
    image: '/img/demo-brasa.svg',
    price: 160, tags: ['Chef executivo', 'Churrasco premium'], featured: false, demo: true,
  },
];
