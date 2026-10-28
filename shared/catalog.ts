export type Professional = {
  id: string;
  name: string;
  type: 'Chef particular' | 'Buffet' | 'Freelancer';
  category: string;
  city: string;
  description: string;
  image: string;
  price: number;
  tags: string[];
  featured: boolean;
  demo: boolean;
};

export const heroImage = '/manus-storage/async-images/AS2GvfyibY6JhUqcsUG6KZ/image-1.webp';
export const professionals: Professional[] = [
  {
    id: 'demo-chef', name: 'Ateliê da Mesa', type: 'Chef particular',
    category: 'Italiana contemporânea', city: 'São Paulo, SP',
    description: 'Um jantar feito para o seu momento. Menus autorais inspirados na cozinha italiana, com ingredientes frescos e um cuidado especial em cada detalhe.',
    image: '/manus-storage/async-images/AS2GvfyibY6JhUqcsUG6KZ/image-2.webp',
    price: 180, tags: ['Jantar em casa', 'Menu autoral'], featured: true, demo: true,
  },
  {
    id: 'demo-buffet', name: 'Essência Buffet', type: 'Buffet',
    category: 'Celebrações & eventos', city: 'São Paulo, SP',
    description: 'Da recepção intimista à grande celebração, uma experiência gastronômica pensada para receber bem. Cozinha brasileira contemporânea e serviço acolhedor.',
    image: '/manus-storage/async-images/AS2GvfyibY6JhUqcsUG6KZ/image-3.webp',
    price: 120, tags: ['Casamentos', 'Eventos corporativos'], featured: false, demo: true,
  },
  {
    id: 'demo-brasa', name: 'Casa & Brasa', type: 'Chef particular',
    category: 'Brasileira & fogo', city: 'Campinas, SP',
    description: 'O encontro entre o sabor da brasa e a hospitalidade brasileira. Cortes selecionados, acompanhamentos sazonais e uma mesa que convida a ficar.',
    image: '/manus-storage/async-images/AS2GvfyibY6JhUqcsUG6KZ/image-4.webp',
    price: 160, tags: ['Churrasco premium', 'Cozinha brasileira'], featured: false, demo: true,
  },
];
