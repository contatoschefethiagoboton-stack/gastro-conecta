import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { detectIntent, parseDate, parseGuests } from '../shared/socialIntent';
import { buildReply, parseMetaWebhook, validMetaSignature } from './gastro/social';
import { seoCatalogFrom, seoCitiesFrom } from '../shared/seo';

const cities = seoCitiesFrom({});
const seo = seoCatalogFrom();
const now = new Date('2026-11-04T15:00:00Z'); // quarta-feira

describe('intenção das mensagens', () => {
  it('cliente: serviço, cidade, data e convidados', () => {
    const i = detectIntent('Boa tarde! Preciso de garçom para sábado em Campinas, festa de 80 pessoas', cities, seo.services, now);
    expect(i).toMatchObject({ kind: 'client', serviceSlug: 'garcom-para-evento', date: '2026-11-07', guests: 80 });
    expect(i.city?.name).toBe('Campinas');
  });
  it('outros serviços e datas', () => {
    expect(detectIntent('quanto custa um personal chef pra fazer marmita fit?', cities, seo.services, now).serviceSlug).toBe('personal-chef');
    expect(detectIntent('alguém indica buffet para casamento dia 12/12 em Valinhos', cities, seo.services, now)).toMatchObject({ kind: 'client', serviceSlug: 'buffet-para-festa', date: '2026-12-12' });
    expect(detectIntent('preciso de bartender amanhã', cities, seo.services, now)).toMatchObject({ serviceSlug: 'barman-para-evento', date: '2026-11-05' });
    expect(detectIntent('tem disponibilidade? preciso de chef em santa bárbara d\'oeste', cities, seo.services, now).city?.name).toBe("Santa Bárbara d'Oeste");
  });
  it('profissional querendo trabalhar', () => {
    expect(detectIntent('Sou garçom, como faço para participar?', cities, seo.services, now).kind).toBe('provider');
    expect(detectIntent('Tem vaga de freela pra cozinheira?', cities, seo.services, now).kind).toBe('provider');
  });
  it('ignora conversa que não é pedido', () => {
    expect(detectIntent('Que foto linda! 😍', cities, seo.services, now).kind).toBe('none');
    expect(detectIntent('parabéns pelo trabalho', cities, seo.services, now).kind).toBe('none');
  });
  it('datas e convidados', () => {
    expect(parseDate('dia 3', now)).toBe('2026-12-03');
    expect(parseDate('01/02', now)).toBe('2027-02-01');
    expect(parseDate('31/02', now)).toBeUndefined();
    expect(parseDate('sexta-feira', now)).toBe('2026-11-06');
    expect(parseDate('quarta', now)).toBe('2026-11-11');
    expect(parseGuests('para 30 convidados')).toBe(30);
  });
});

describe('webhook da Meta', () => {
  it('assinatura X-Hub-Signature-256', () => {
    const raw = Buffer.from('{"object":"page"}');
    const sig = `sha256=${createHmac('sha256', 'segredo').update(raw).digest('hex')}`;
    expect(validMetaSignature(raw, sig, 'segredo')).toBe(true);
    expect(validMetaSignature(raw, sig, 'outro')).toBe(false);
    expect(validMetaSignature(raw, undefined, 'segredo')).toBe(false);
  });
  it('lê DMs, comentários e WhatsApp; ignora eco e a própria conta', () => {
    const msgs = parseMetaWebhook({ object: 'instagram', entry: [{ messaging: [
      { sender: { id: '111' }, message: { mid: 'm1', text: 'preciso de garçom' } },
      { sender: { id: 'IG' }, message: { mid: 'm2', text: 'eco', is_echo: true } },
    ], changes: [{ field: 'comments', value: { id: 'c1', text: 'quanto custa?', from: { id: '222', username: 'maria' } } }, { field: 'comments', value: { id: 'c2', text: 'resposta da loja', from: { id: 'IG' } } }] }] }, { igUserId: 'IG' });
    expect(msgs.map(m => [m.platform, m.kind, m.externalId])).toEqual([['instagram', 'dm', 'm1'], ['instagram', 'comment', 'c1']]);
    const fb = parseMetaWebhook({ object: 'page', entry: [{ changes: [{ field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'p_1', message: 'tem buffet?', from: { id: '9', name: 'João Silva' } } }] }] });
    expect(fb[0]).toMatchObject({ platform: 'facebook', kind: 'comment', senderName: 'João Silva' });
    const wa = parseMetaWebhook({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { contacts: [{ wa_id: '5519999990000', profile: { name: 'Ana' } }], messages: [{ id: 'wamid.1', from: '5519999990000', type: 'text', text: { body: 'preciso de chef' } }] } }] }] });
    expect(wa[0]).toMatchObject({ platform: 'whatsapp', senderId: '5519999990000', senderName: 'Ana' });
  });
  it('resposta com link preenchido e UTM', () => {
    const intent = detectIntent('preciso de garçom para sábado em Campinas', cities, seo.services, now);
    const reply = buildReply(intent, { platform: 'instagram', kind: 'comment', senderName: '@maria.silva' }, seo, cities, 'https://eventosconecta.com.br')!;
    expect(reply).toMatch(/^Oi maria\.silva! 👋/);
    expect(reply).toContain('https://eventosconecta.com.br/orcamento?servico=garcom-para-evento&cidade=Campinas%2C+SP&data=2026-11-07&utm_source=instagram&utm_medium=comentario&utm_campaign=robo-redes');
    const pro = buildReply(detectIntent('sou barman, quero trabalhar em Valinhos', cities, seo.services, now), { platform: 'facebook', kind: 'dm' }, seo, cities, 'https://eventosconecta.com.br')!;
    expect(pro).toContain('https://eventosconecta.com.br/sp/valinhos/barman-freelancer?utm_source=facebook');
    expect(buildReply({ kind: 'none', source: 'rules' }, { platform: 'instagram', kind: 'dm' }, seo, cities)).toBeNull();
  });
});

import { testimonialCaption, welcomeCaption } from './gastro/socialPosts';
describe('posts automáticos', () => {
  const p = { id: 'user-7', name: 'Buffet Sabor', city: 'Campinas, SP', category: 'Buffet', services: ['Buffet', 'Garçom / garçonete'] };
  it('boas-vindas com link rastreado e hashtags da cidade', () => {
    const { caption, link } = welcomeCaption(p);
    expect(link).toBe('https://eventosconecta.com.br/profissionais/user-7?utm_source=instagram&utm_medium=post&utm_campaign=boas-vindas');
    expect(caption).toContain('Boas-vindas ao Eventos Conecta, Buffet Sabor!');
    expect(caption).toContain('#campinas');
    expect(caption).toContain('#garcomgarconete');
  });
  it('depoimento usa só o primeiro nome e as estrelas da nota', () => {
    const { caption } = testimonialCaption({ rating: 5, feedback: 'Atendimento impecável, todos elogiaram!', reviewerName: 'Carla Souza Lima' }, p);
    expect(caption.startsWith('⭐⭐⭐⭐⭐')).toBe(true);
    expect(caption).toContain('— Carla, sobre Buffet Sabor (Campinas)');
    expect(caption).not.toContain('Souza');
  });
});
