import { describe, expect, it } from 'vitest';
import { activePromotions, isPromotionActive, type Promotion } from '../shared/promotions';
import { quoteWhatsappMessage, whatsappLink } from '../shared/business';

const base: Promotion = { id: 't', active: true, start: '11-01', end: '01-06', badge: '', title: '', text: '', cta: '', whatsappMessage: '' };

describe('promoções sazonais', () => {
  it('respeita janela que atravessa a virada do ano', () => {
    expect(isPromotionActive(base, new Date(2026, 11, 25))).toBe(true);
    expect(isPromotionActive(base, new Date(2027, 0, 3))).toBe(true);
    expect(isPromotionActive(base, new Date(2027, 0, 7))).toBe(false);
    expect(isPromotionActive(base, new Date(2026, 9, 31))).toBe(false);
  });
  it('janela comum e campanha desligada', () => {
    const p = { ...base, start: '05-20', end: '06-12' };
    expect(isPromotionActive(p, new Date(2026, 5, 12))).toBe(true);
    expect(isPromotionActive(p, new Date(2026, 5, 13))).toBe(false);
    expect(isPromotionActive({ ...p, active: false }, new Date(2026, 5, 1))).toBe(false);
  });
  it('lista padrão tem campanha ativa no fim de outubro', () => {
    expect(activePromotions(new Date(2026, 9, 27)).map(p => p.id)).toContain('confraternizacao-corporativa');
  });
});

describe('WhatsApp', () => {
  it('gera link wa.me com texto codificado', () => {
    expect(whatsappLink()).toBe('https://wa.me/5519993984529');
    expect(whatsappLink('Olá & tudo?')).toBe('https://wa.me/5519993984529?text=Ol%C3%A1%20%26%20tudo%3F');
  });
  it('resume o pedido sem campos vazios', () => {
    const msg = quoteWhatsappMessage({ type: 'Jantar em casa', date: '2026-12-24', city: 'Campinas, SP', guests: '12', budget: '3000', requestId: 7 });
    expect(msg).toContain('Pedido nº 7');
    expect(msg).toContain('Data: 24/12/2026');
    expect(msg).toContain('R$ 3.000');
    expect(msg).not.toContain('Detalhes:');
  });
});
