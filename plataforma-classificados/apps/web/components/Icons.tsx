/** Ícones SVG inline (traço 1.8, herdam a cor do texto). */
import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

export const IconSearch = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const IconPin = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
export const IconLocate = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7" /></svg>;
export const IconFilter = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
export const IconMap = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></svg>;
export const IconGrid = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></svg>;
export const IconClose = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const IconShield = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
export const IconVerified = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" aria-hidden {...p}>
    <path fill="currentColor" d="M12 2.5 14.4 4l2.8-.2 1.1 2.6 2.4 1.5-.6 2.8 1 2.6-2 2-.4 2.8-2.8.6-1.9 2.1L12 20.6l-2.6 1.2-1.9-2.1-2.8-.6-.4-2.8-2-2 1-2.6-.6-2.8 2.4-1.5L6.8 3.8 9.6 4 12 2.5Z" />
    <path d="m8.5 12 2.4 2.4 4.6-4.8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const IconVideo = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="m16 10.5 5-3v9l-5-3" /></svg>;
export const IconLock = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
export const IconEye = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
export const IconPhone = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></svg>;
export const IconSend = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="m21 3-9 18-2-8-8-2 19-8Z" /></svg>;
export const IconLink = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>;
export const IconFlag = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 21V4h11l-1.5 4L16 12H5" /></svg>;
export const IconChevronLeft = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="m15 18-6-6 6-6" /></svg>;
export const IconChevronRight = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="m9 18 6-6-6-6" /></svg>;
export const IconSparkles = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" /></svg>;
export const IconWhatsApp = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" aria-hidden {...p}>
    <path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3Z" />
  </svg>
);
