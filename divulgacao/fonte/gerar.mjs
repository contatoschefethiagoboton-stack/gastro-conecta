// Gera o kit de divulgação do Eventos Conecta (imagens e vídeos).
// Uso, na raiz do projeto:  node divulgacao/fonte/gerar.mjs
// Edite os textos abaixo e rode de novo para atualizar as artes.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Icons from 'lucide-react';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '..');
const ROOT = path.resolve(OUT, '..');

// ---------- Dados da marca (edite aqui) ----------
const SITE = 'eventosconecta.com.br';
const WHATSAPP = '(19) 99398-4529';
const REGIAO = 'Campinas e região';
const SERVICOS = [['ChefHat', 'Chef'], ['CookingPot', 'Personal chef'], ['Utensils', 'Buffet'], ['Users', 'Garçom'], ['Wine', 'Barman'], ['Sparkles', 'Limpeza'], ['Leaf', 'Jardinagem']];
const PROFISSOES = 'Chef · Cozinheiro · Auxiliar · Garçom · Barman · Personal chef · Buffet · Limpeza · Jardinagem';
// Valor da assinatura mensal do profissional (confira em Painel → Pagamentos; padrão da plataforma: R$ 49,90).
const PRECO_CENTAVOS = 9990;
const PRECO = (PRECO_CENTAVOS / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const PRECO_DIA = `R$ ${(Math.ceil(PRECO_CENTAVOS / 30) / 100).toFixed(2).replace('.', ',')}`;
const [PRECO_REAIS, PRECO_CENTS] = (PRECO_CENTAVOS / 100).toFixed(2).split('.');
// Vantagens reais da assinatura (o que o sistema libera para quem está em dia).
const VANTAGENS = [
  ['Search', 'Perfil no catálogo e no Google', 'Apareça para clientes da sua cidade, inclusive nas páginas de busca por serviço.'],
  ['Radar', 'Radar de pedidos', 'Pedidos da sua região com data, convidados e score de intenção do cliente.'],
  ['Send', 'Envie propostas e edite', 'Ajuste o valor enquanto o cliente decide.'],
  ['Wallet', 'Zero comissão', '100% do valor negociado é seu, direto no seu Pix.'],
  ['Calculator', 'Copilot com calculadoras', 'Ingredientes, porções, equipe, custos, lucro e alerta de prejuízo.'],
  ['ClipboardList', 'Lista de compras', 'Cobre pela lista no orçamento ou dê de cortesia.'],
  ['FileText', 'Contrato em PDF automático', 'Serviço, lista e total separados, gerado no aceite.'],
  ['MessageCircle', 'WhatsApp do cliente', 'Liberado assim que ele aceita a sua proposta.'],
  ['TrendingUp', 'Financeiro', 'Despesas, notas e lucro de cada trabalho.'],
  ['Award', 'Avaliações e selo Top Rated', 'Boas avaliações dão destaque e acesso a promoções.'],
];

const icon = (name, size = 40, stroke = 1.8) => renderToStaticMarkup(createElement(Icons[name], { size, strokeWidth: stroke }));
const heroUri = `data:image/svg+xml;base64,${fs.readFileSync(path.join(ROOT, 'client/public/img/hero.svg')).toString('base64')}`;

// Fontes da marca embutidas (DM Sans e Inter), para não depender da internet.
const FONTES = fs.readFileSync(path.join(here, 'fontes/fontes.txt'), 'utf8').trim().split('\n').map(linha => {
  const [familia, peso, arquivo, faixa] = linha.split('|');
  const dados = fs.readFileSync(path.join(here, 'fontes', arquivo)).toString('base64');
  return `@font-face{font-family:'${familia}';font-weight:${peso};font-style:normal;src:url(data:font/woff2;base64,${dados}) format('woff2');unicode-range:${faixa}}`;
}).join('');

const CSS = `
${FONTES}
:root{--p:#df572f;--p2:#b8431f;--ink:#262823;--cream:#fcfbf8;--sand:#f5f1e9;--dark:#1d1815;--olive:#83916d;--muted:#8a8473}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:var(--w);height:var(--h);overflow:hidden}
body{font-family:Inter,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
h1,h2,h3,.dm{font-family:'DM Sans',sans-serif;letter-spacing:-.03em}
.art{position:relative;width:var(--w);height:var(--h);overflow:hidden;display:flex;flex-direction:column}
.dark{background:radial-gradient(120% 80% at 70% 20%,#3a2a22 0%,var(--dark) 60%);color:#fff}
.cream{background:var(--cream)}
.sand{background:var(--sand)}
.paprika{background:linear-gradient(160deg,#e8623a 0%,var(--p) 45%,var(--p2) 100%);color:#fff}
.logo{display:inline-flex;align-items:center;gap:.32em;font-family:'DM Sans',sans-serif;font-weight:700;letter-spacing:-.045em;white-space:nowrap;line-height:1}
.logo .mark{color:var(--p);position:relative;display:inline-flex}
.logo .mark i{position:absolute;right:-.08em;top:.02em;width:.18em;height:.18em;border-radius:50%;background:var(--p)}
.logo .w{font-weight:400}.logo .d{color:var(--p)}
.on-paprika .logo .mark,.on-paprika .logo .d{color:#fff}.on-paprika .logo .mark i{background:#fff}
.eyebrow{font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--p)}
.paprika .eyebrow{color:#ffe1d4}
.chips{display:flex;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;border-radius:999px;font-weight:600;white-space:nowrap}
.dark .chip{background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.18);color:#fff}
.dark .chip svg{color:var(--p)}
.cream .chip,.sand .chip{background:#fff;border:1.5px solid #e6e0d3}
.cream .chip svg,.sand .chip svg{color:var(--p)}
.paprika .chip{background:rgba(255,255,255,.16);border:1.5px solid rgba(255,255,255,.35);color:#fff}
.cta{display:flex;align-items:center;justify-content:space-between;border-radius:22px;font-weight:700}
.cta.solid{background:var(--p);color:#fff}
.cta.white{background:#fff;color:var(--ink)}
.cta.white b{color:var(--p)}
.hl{color:var(--p)}
.paprika .hl{color:#ffe1d4}
.muted{color:var(--muted)}
.dark .muted{color:#cbbfb4}
.paprika .muted{color:#ffe7dd}
.hero{position:absolute;inset:0 0 auto 0;background:url(${heroUri}) center/cover}
.hero::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(29,24,21,.1) 0%,rgba(29,24,21,.55) 55%,var(--dark) 100%)}
.step{display:flex;align-items:flex-start;background:#fff;border:1.5px solid #e9e3d6;border-radius:28px}
.step .n{font-family:'DM Sans',sans-serif;font-weight:800;color:var(--p);line-height:1}
.badge{display:inline-flex;align-items:center;gap:.5em;border-radius:999px;font-weight:700}
.feat{display:flex;align-items:flex-start}
.feat .ic{flex-shrink:0;display:grid;place-items:center;border-radius:20px;background:#fbe7df;color:var(--p)}
.dark .feat .ic{background:rgba(223,87,47,.18)}
.dots{position:absolute;border-radius:50%;background:var(--p);opacity:.12}
`;

const logo = (px, extra = '') => `<span class="logo" style="font-size:${px}px;${extra}"><span class="mark">${icon('CookingPot', px * 1.05, 1.8)}<i></i></span><span>eventos<span class="w">conecta</span><span class="d">.</span></span></span>`;
const chips = (list, px, gap = 14) => `<div class="chips" style="gap:${gap}px">${list.map(([ic, t]) => `<span class="chip" style="font-size:${px}px;padding:${px * .55}px ${px * .9}px;gap:${px * .45}px">${icon(ic, px * 1.25, 2)}${t}</span>`).join('')}</div>`;
const page = (w, h, cls, body) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>:root{--w:${w}px;--h:${h}px}${CSS}</style></head><body><div class="art ${cls}">${body}</div></body></html>`;

// ---------- Peças ----------
const pecas = [];
const add = (arquivo, w, h, cls, body) => pecas.push({ arquivo, w, h, html: page(w, h, cls, body) });

// FEED (1080x1350) — Instagram e Facebook
add('feed/01-cliente-servicos.png', 1080, 1350, 'dark', `
  <div class="hero" style="height:640px"></div>
  <div style="position:relative;padding:70px 80px 0">${logo(46)}</div>
  <div style="position:relative;margin-top:auto;padding:0 80px 80px">
    <div class="eyebrow" style="font-size:24px">${REGIAO}</div>
    <h1 style="font-size:92px;line-height:.98;margin-top:22px;font-weight:700">Seu evento com os<br/><span class="hl">profissionais certos.</span></h1>
    <div style="margin-top:44px">${chips(SERVICOS, 28, 14)}</div>
    <div class="cta solid" style="margin-top:50px;padding:32px 40px;font-size:34px"><span>Peça orçamento grátis</span><span style="font-weight:500">${SITE}</span></div>
  </div>`);

add('feed/02-cliente-como-funciona.png', 1080, 1350, 'cream', `
  <div style="padding:80px 80px 0;display:flex;justify-content:space-between;align-items:center">${logo(44)}<span class="badge" style="background:#e9f0e2;color:#4f6a3a;font-size:24px;padding:14px 24px">${icon('Check', 26, 2.6)} Grátis para quem contrata</span></div>
  <div style="padding:70px 80px 0">
    <div class="eyebrow" style="font-size:24px">Como funciona</div>
    <h1 style="font-size:84px;line-height:1;margin-top:20px;font-weight:700">Contratar para o seu<br/>evento ficou <span class="hl">simples.</span></h1>
  </div>
  <div style="padding:60px 80px 0;display:flex;flex-direction:column;gap:24px">
    ${[['01', 'Conte o seu evento', 'Data, cidade, número de convidados e o que você precisa.'], ['02', 'Receba propostas', 'Profissionais da sua região enviam propostas. Compare fotos e avaliações.'], ['03', 'Feche com segurança', 'Receba o WhatsApp do profissional e o contrato em PDF.']].map(([n, t, d]) => `
      <div class="step" style="padding:34px 38px;gap:34px"><span class="n" style="font-size:64px">${n}</span><div><h3 style="font-size:40px;font-weight:700">${t}</h3><p class="muted" style="font-size:27px;line-height:1.4;margin-top:8px">${d}</p></div></div>`).join('')}
  </div>
  <div style="margin-top:auto;padding:0 80px 76px"><div class="cta solid" style="padding:30px 40px;font-size:32px"><span>Faça seu pedido</span><span style="font-weight:500">${SITE}</span></div></div>`);

add('feed/03-cliente-fim-de-semana.png', 1080, 1350, 'paprika on-paprika', `
  <div class="dots" style="width:620px;height:620px;right:-220px;top:-200px;background:#fff;opacity:.08"></div>
  <div style="position:relative;padding:80px 80px 0">${logo(46)}</div>
  <div style="position:relative;padding:120px 80px 0">
    <h1 style="font-size:104px;line-height:.98;font-weight:800">Precisa de garçom, barman ou chef para o fim de semana?</h1>
    <p style="font-size:36px;line-height:1.4;margin-top:40px;max-width:860px;color:#fff3ee">Peça orçamento grátis e receba propostas de profissionais de ${REGIAO}.</p>
    <div style="margin-top:56px">${chips(SERVICOS, 28, 14)}</div>
  </div>
  <div style="position:relative;margin-top:auto;padding:0 80px 80px"><div class="cta white" style="padding:32px 40px;font-size:34px"><span>Peça agora <b>→</b></span><span style="font-weight:500">${SITE}</span></div></div>`);

add('feed/04-profissional-zero-comissao.png', 1080, 1350, 'dark', `
  <div style="padding:80px 80px 0;display:flex;justify-content:space-between;align-items:center">${logo(44)}<span class="eyebrow" style="font-size:22px">Para profissionais</span></div>
  <div style="padding:110px 80px 0">
    <div class="dm" style="font-size:300px;line-height:.85;font-weight:800;color:var(--p);letter-spacing:-.06em">100%</div>
    <h1 style="font-size:76px;line-height:1.02;margin-top:26px;font-weight:700">do valor do serviço<br/>fica com você.</h1>
    <p class="muted" style="font-size:32px;line-height:1.45;margin-top:34px">Zero comissão. Você paga só uma assinatura<br/>mensal fixa e recebe direto no seu Pix.</p>
  </div>
  <div style="margin-top:auto;padding:0 80px 80px">
    <p style="font-size:25px;line-height:1.6;color:#e8ddd3">${PROFISSOES}</p>
    <div class="cta solid" style="margin-top:34px;padding:30px 40px;font-size:32px"><span>Cadastre-se</span><span style="font-weight:500">${SITE}</span></div>
  </div>`);

add('feed/05-profissional-ferramentas.png', 1080, 1350, 'sand', `
  <div style="padding:80px 80px 0">${logo(44)}</div>
  <div style="padding:70px 80px 0">
    <div class="eyebrow" style="font-size:24px">Trabalha com eventos?</div>
    <h1 style="font-size:80px;line-height:1;margin-top:20px;font-weight:700">Mais clientes, <span class="hl">menos correria.</span></h1>
  </div>
  <div style="padding:60px 80px 0;display:flex;flex-direction:column;gap:36px">
    ${[['Radar', 'Radar de pedidos', 'Pedidos de clientes da sua região com data e nº de convidados.'], ['Calculator', 'Calculadoras no Copilot', 'Ingredientes, porções, equipe, custos e lucro antes de propor.'], ['FileText', 'Contrato em PDF automático', 'Gerado quando o cliente aceita a sua proposta.'], ['Award', 'Selo Top Rated', 'Boas avaliações dão destaque ao seu perfil.']].map(([ic, t, d]) => `
      <div class="feat" style="gap:30px"><span class="ic" style="width:96px;height:96px">${icon(ic, 46, 1.9)}</span><div><h3 style="font-size:38px;font-weight:700">${t}</h3><p class="muted" style="font-size:27px;line-height:1.4;margin-top:6px">${d}</p></div></div>`).join('')}
  </div>
  <div style="margin-top:auto;padding:0 80px 76px"><div class="cta solid" style="padding:30px 40px;font-size:32px"><span>Zero comissão · cadastre-se</span><span style="font-weight:500">${SITE}</span></div></div>`);

// STORIES (1080x1920) — área segura: 250px no topo e 340px embaixo
add('stories/01-cliente.png', 1080, 1920, 'dark', `
  <div class="hero" style="height:1000px"></div>
  <div style="position:relative;padding:250px 80px 0">${logo(52)}</div>
  <div style="position:relative;margin-top:auto;padding:0 80px 340px">
    <div class="eyebrow" style="font-size:28px">${REGIAO}</div>
    <h1 style="font-size:110px;line-height:.98;margin-top:26px;font-weight:700">Vai fazer<br/>uma festa?</h1>
    <p class="muted" style="font-size:38px;line-height:1.4;margin-top:30px">Chef, garçom, barman, buffet e mais. Receba propostas grátis.</p>
    <div style="margin-top:44px">${chips(SERVICOS.slice(0, 5), 32, 14)}</div>
    <div class="cta solid" style="margin-top:54px;padding:36px 44px;font-size:38px;justify-content:center">${SITE}</div>
  </div>`);

add('stories/02-profissional.png', 1080, 1920, 'paprika on-paprika', `
  <div class="dots" style="width:800px;height:800px;left:-300px;top:-200px;background:#fff;opacity:.07"></div>
  <div style="position:relative;padding:250px 80px 0">${logo(52)}</div>
  <div style="position:relative;padding:150px 80px 0">
    <div class="eyebrow" style="font-size:28px">Para profissionais de eventos</div>
    <h1 style="font-size:116px;line-height:.98;margin-top:30px;font-weight:800">Faça freelas em eventos sem pagar comissão.</h1>
    <p style="font-size:40px;line-height:1.45;margin-top:44px;color:#fff3ee">Receba pedidos de clientes da sua região e fique com 100% do valor.</p>
    <div style="margin-top:60px">${chips(SERVICOS, 34, 16)}</div>
  </div>
  <div style="position:relative;margin-top:auto;padding:0 80px 340px"><div class="cta white" style="padding:36px 44px;font-size:38px;justify-content:center">Cadastre-se: <b style="margin-left:.35em">${SITE}</b></div></div>`);

add('stories/03-enquete.png', 1080, 1920, 'cream', `
  <div style="padding:250px 80px 0">${logo(52)}</div>
  <div style="padding:120px 80px 0">
    <h1 style="font-size:104px;line-height:1;font-weight:700">Na sua próxima festa, quem <span class="hl">não pode faltar?</span></h1>
  </div>
  <div style="margin:80px 80px 0;height:460px;border:4px dashed #e3d9c8;border-radius:40px"></div>
  <div style="margin-top:auto;padding:0 80px 340px;text-align:center"><p class="muted" style="font-size:34px">Chef, garçom, barman, buffet e mais em</p><p class="dm" style="font-size:46px;font-weight:700;margin-top:10px">${SITE}</p></div>`);

// WHATSAPP (1080x1080) — grupos e status
add('whatsapp/01-cliente.png', 1080, 1080, 'dark', `
  <div class="hero" style="height:480px"></div>
  <div style="position:relative;padding:64px 70px 0">${logo(42)}</div>
  <div style="position:relative;margin-top:auto;padding:0 70px 64px">
    <h1 style="font-size:72px;line-height:1;font-weight:700">Chef, garçom, barman e buffet <span class="hl">para o seu evento.</span></h1>
    <p class="muted" style="font-size:28px;margin-top:20px">Orçamento grátis · ${REGIAO}</p>
    <div style="margin-top:32px">${chips(SERVICOS, 24, 10)}</div>
    <div style="display:flex;gap:16px;margin-top:36px">
      <div class="cta solid" style="flex:1;padding:24px 30px;font-size:28px;justify-content:center">${icon('Globe', 30, 2)}&nbsp; ${SITE}</div>
      <div class="cta white" style="padding:24px 30px;font-size:28px">${icon('MessageCircle', 30, 2)}&nbsp; ${WHATSAPP}</div>
    </div>
  </div>`);

add('whatsapp/02-profissional.png', 1080, 1080, 'paprika on-paprika', `
  <div class="dots" style="width:560px;height:560px;right:-200px;top:-200px;background:#fff;opacity:.08"></div>
  <div style="position:relative;padding:64px 70px 0">${logo(42)}</div>
  <div style="position:relative;padding:70px 70px 0">
    <h1 style="font-size:80px;line-height:1;font-weight:800">Trabalha com eventos?</h1>
    <p style="font-size:36px;line-height:1.4;margin-top:26px;color:#fff3ee">Receba pedidos de clientes da sua região e fique com <b style="color:#fff">100% do valor</b>. Zero comissão.</p>
    <p style="font-size:24px;line-height:1.6;margin-top:30px;color:#ffe1d4">${PROFISSOES}</p>
  </div>
  <div style="position:relative;margin-top:auto;padding:0 70px 64px"><div class="cta white" style="padding:26px 34px;font-size:30px"><span>Cadastre-se grátis <b>→</b></span><span style="font-weight:500">${SITE}</span></div></div>`);

// ---------- NOVIDADES (só mão de obra, lista de compras, contrato com todos os valores, proposta editável) ----------
const contratoMock = (px) => `<div style="background:#fff;color:var(--ink);border-radius:${px}px;padding:${px * 1.4}px ${px * 1.6}px;box-shadow:0 30px 60px rgba(0,0,0,.25)">
  <div style="display:flex;justify-content:space-between;align-items:center"><span class="dm" style="font-weight:700;font-size:${px * 1.15}px">Contrato de prestação de serviços</span><span style="color:var(--p)">${icon('FileText', px * 1.6, 2)}</span></div>
  <p class="muted" style="font-size:${px * .7}px;margin-top:${px * .3}px;letter-spacing:.12em;text-transform:uppercase;font-weight:700">Cláusula 4 · Valor e forma de pagamento</p>
  ${[['Serviço (mão de obra)', 'R$ 1.800,00'], ['Lista de compras (12 itens)', 'R$ 50,00'], ['Valor total acordado', 'R$ 1.850,00']].map(([k, v], i) => `<div style="display:flex;justify-content:space-between;gap:20px;padding:${px * .7}px 0;border-top:${i ? '1.5px solid #eee8dc' : '0'};font-size:${px}px;${i === 2 ? 'font-weight:800;color:var(--p)' : ''}"><span>${k}</span><b>${v}</b></div>`).join('')}
  <p class="muted" style="font-size:${px * .62}px;margin-top:${px * .4}px">Exemplo ilustrativo</p></div>`;

add('feed/06-cliente-so-mao-de-obra.png', 1080, 1350, 'sand', `
  <div style="padding:80px 80px 0;display:flex;justify-content:space-between;align-items:center">${logo(44)}<span class="badge" style="background:#fbe7df;color:var(--p2);font-size:24px;padding:14px 24px">Novidade</span></div>
  <div style="padding:70px 80px 0">
    <div class="eyebrow" style="font-size:24px">Só mão de obra</div>
    <h1 style="font-size:84px;line-height:1;margin-top:20px;font-weight:700">Você compra os ingredientes. <span class="hl">O chef cozinha.</span></h1>
    <p class="muted" style="font-size:30px;line-height:1.45;margin-top:28px">Peça só a mão de obra e pague apenas pelo serviço.</p>
  </div>
  <div style="padding:56px 80px 0;display:flex;flex-direction:column;gap:30px">
    ${[['ClipboardList', 'Escolha “só mão de obra” no pedido', 'Chef, cozinheiro, garçom ou barman sem insumos no preço.'], ['FileText', 'Receba a lista de compras em PDF', 'Itens e quantidades calculados pelo profissional para o seu número de convidados.'], ['Check', 'Compre do seu jeito', 'Escolha as marcas e o mercado. A lista pode vir de cortesia ou com valor combinado na proposta.']].map(([ic, t, d]) => `
      <div class="feat" style="gap:28px"><span class="ic" style="width:92px;height:92px">${icon(ic, 44, 1.9)}</span><div><h3 style="font-size:36px;font-weight:700">${t}</h3><p class="muted" style="font-size:26px;line-height:1.4;margin-top:6px">${d}</p></div></div>`).join('')}
  </div>
  <div style="margin-top:auto;padding:0 80px 76px"><div class="cta solid" style="padding:30px 40px;font-size:32px"><span>Peça orçamento grátis</span><span style="font-weight:500">${SITE}</span></div></div>`);

add('feed/07-cliente-contrato-transparente.png', 1080, 1350, 'dark', `
  <div style="padding:80px 80px 0">${logo(44)}</div>
  <div style="padding:70px 80px 0">
    <div class="eyebrow" style="font-size:24px">Transparência</div>
    <h1 style="font-size:92px;line-height:.98;margin-top:22px;font-weight:700">Tudo no contrato.<br/><span class="hl">Sem surpresa.</span></h1>
    <p class="muted" style="font-size:30px;line-height:1.45;margin-top:28px">Cada valor aparece separado no contrato em PDF, gerado assim que você aceita a proposta.</p>
  </div>
  <div style="padding:60px 80px 0">${contratoMock(34)}</div>
  <div style="margin-top:auto;padding:0 80px 76px"><div class="cta solid" style="padding:30px 40px;font-size:32px"><span>Contrate com segurança</span><span style="font-weight:500">${SITE}</span></div></div>`);

add('feed/08-profissional-lista-de-compras.png', 1080, 1350, 'paprika on-paprika', `
  <div class="dots" style="width:620px;height:620px;right:-240px;top:-220px;background:#fff;opacity:.08"></div>
  <div style="position:relative;padding:80px 80px 0;display:flex;justify-content:space-between;align-items:center">${logo(44)}<span class="eyebrow" style="font-size:22px">Para profissionais</span></div>
  <div style="position:relative;padding:90px 80px 0">
    <h1 style="font-size:90px;line-height:.98;font-weight:800">A lista de compras do cliente agora vale dinheiro.</h1>
    <p style="font-size:34px;line-height:1.45;margin-top:34px;color:#fff3ee">Cobre pela lista dentro do orçamento ou ofereça de cortesia. Você decide.</p>
  </div>
  <div style="position:relative;padding:50px 80px 0;display:flex;flex-direction:column;gap:22px">
    ${['A calculadora monta itens e quantidades por convidado', 'O valor da lista entra no total da proposta', 'Serviço, lista e total aparecem separados no contrato', 'Você recebe direto do cliente, sem comissão'].map(t => `<div style="display:flex;gap:18px;align-items:center;font-size:31px;font-weight:600"><span style="display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.18)">${icon('Check', 30, 2.6)}</span>${t}</div>`).join('')}
  </div>
  <div style="position:relative;margin-top:auto;padding:0 80px 80px"><div class="cta white" style="padding:30px 40px;font-size:32px"><span>Cadastre-se <b>→</b></span><span style="font-weight:500">${SITE}</span></div></div>`);

add('stories/04-profissional-novidades.png', 1080, 1920, 'cream', `
  <div style="padding:250px 80px 0">${logo(52)}</div>
  <div style="padding:90px 80px 0">
    <span class="badge" style="background:#fbe7df;color:var(--p2);font-size:28px;padding:14px 26px">Novidades</span>
    <h1 style="font-size:100px;line-height:1;font-weight:800;margin-top:34px">Mais controle sobre <span class="hl">o seu orçamento.</span></h1>
  </div>
  <div style="padding:70px 80px 0;display:flex;flex-direction:column;gap:40px">
    ${[['PenLine', 'Edite a proposta', 'Achou caro ou barato? Ajuste o valor enquanto o cliente decide.'], ['ClipboardList', 'Lista de compras', 'Cobre pela lista no orçamento ou dê de cortesia.'], ['FileText', 'Tudo no contrato', 'Serviço, lista e total separados, automático.']].map(([ic, t, d]) => `
      <div class="feat" style="gap:30px"><span class="ic" style="width:120px;height:120px;border-radius:30px">${icon(ic, 58, 1.9)}</span><div><h3 style="font-size:46px;font-weight:700">${t}</h3><p class="muted" style="font-size:32px;line-height:1.4;margin-top:8px">${d}</p></div></div>`).join('')}
  </div>
  <div style="margin-top:auto;padding:0 80px 340px"><div class="cta solid" style="padding:36px 44px;font-size:38px;justify-content:center">Zero comissão · ${SITE}</div></div>`);

add('stories/05-cliente-so-mao-de-obra.png', 1080, 1920, 'dark', `
  <div class="hero" style="height:900px"></div>
  <div style="position:relative;padding:250px 80px 0">${logo(52)}</div>
  <div style="position:relative;margin-top:auto;padding:0 80px 340px">
    <div class="eyebrow" style="font-size:28px">Só mão de obra</div>
    <h1 style="font-size:104px;line-height:.98;margin-top:26px;font-weight:700">Você compra.<br/><span class="hl">O chef cozinha.</span></h1>
    <p class="muted" style="font-size:38px;line-height:1.4;margin-top:30px">Receba a lista de compras em PDF com as quantidades certas para os seus convidados.</p>
    <div style="margin-top:50px">${contratoMock(30)}</div>
    <div class="cta solid" style="margin-top:50px;padding:36px 44px;font-size:38px;justify-content:center">${SITE}</div>
  </div>`);

add('whatsapp/03-profissional-novidades.png', 1080, 1080, 'cream', `
  <div style="padding:64px 70px 0;display:flex;justify-content:space-between;align-items:center">${logo(42)}<span class="badge" style="background:#fbe7df;color:var(--p2);font-size:22px;padding:12px 22px">Novidades</span></div>
  <div style="padding:50px 70px 0">
    <h1 style="font-size:70px;line-height:1;font-weight:800">Profissional de eventos: <span class="hl">mais renda, mais controle.</span></h1>
  </div>
  <div style="padding:40px 70px 0;display:flex;flex-direction:column;gap:22px">
    ${[['ClipboardList', 'Cobre pela lista de compras ou dê de cortesia'], ['PenLine', 'Edite a proposta enquanto o cliente decide'], ['FileText', 'Contrato automático com todos os valores'], ['Wallet', 'Zero comissão: 100% do valor é seu']].map(([ic, t]) => `<div class="feat" style="gap:22px;align-items:center"><span class="ic" style="width:70px;height:70px;border-radius:18px">${icon(ic, 34, 1.9)}</span><h3 style="font-size:32px;font-weight:600">${t}</h3></div>`).join('')}
  </div>
  <div style="margin-top:auto;padding:0 70px 64px"><div class="cta solid" style="padding:26px 34px;font-size:30px"><span>Cadastre-se grátis</span><span style="font-weight:500">${SITE}</span></div></div>`);

// FACEBOOK — capa da página (1640x624; o centro aparece no celular)
add('facebook/capa-pagina.png', 1640, 624, 'dark', `
  <div class="hero" style="inset:0 0 0 auto;width:760px;height:624px"></div>
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,var(--dark) 45%,rgba(29,24,21,.2) 100%)"></div>
  <div style="position:relative;padding:0 0 0 250px;margin:auto 0">
    ${logo(46)}
    <h1 style="font-size:72px;line-height:1;margin-top:28px;font-weight:700">Profissionais para<br/><span class="hl">o seu evento.</span></h1>
    <p class="muted" style="font-size:28px;margin-top:20px">Chef · Garçom · Barman · Buffet</p><p style="font-size:28px;margin-top:8px;font-weight:600">${SITE}</p>
  </div>`);

// FOTO DE PERFIL (1080x1080) — Instagram, Facebook, WhatsApp e TikTok (aparece em círculo)
add('perfil/foto-perfil.png', 1080, 1080, 'paprika on-paprika', `
  <div style="margin:auto;text-align:center;color:#fff">${icon('CookingPot', 430, 1.6)}
    <div class="dm" style="font-size:96px;font-weight:700;letter-spacing:-.05em;margin-top:10px">eventos<span style="font-weight:400">conecta</span></div></div>`);
add('perfil/foto-perfil-escura.png', 1080, 1080, 'dark', `
  <div style="margin:auto;text-align:center">
    <span style="color:var(--p)">${icon('CookingPot', 430, 1.6)}</span>
    <div class="dm" style="font-size:96px;font-weight:700;letter-spacing:-.05em;margin-top:10px">eventos<span style="font-weight:400">conecta</span><span class="hl">.</span></div></div>`);

// ---------- ASSINATURA (material de venda para profissionais) ----------
const preco = (px, light = false) => `<div class="dm" style="display:flex;align-items:flex-start;line-height:.85;font-weight:800;letter-spacing:-.05em;${light ? 'color:#fff' : 'color:var(--p)'}"><span style="font-size:${px * .3}px;margin-top:${px * .12}px;margin-right:${px * .05}px">R$</span><span style="font-size:${px}px">${PRECO_REAIS}</span><span style="font-size:${px * .38}px;margin-top:${px * .1}px">,${PRECO_CENTS}</span><span style="font-size:${px * .2}px;align-self:flex-end;margin:0 0 ${px * .08}px ${px * .06}px;font-weight:600;letter-spacing:0">/mês</span></div>`;
const listaVantagens = (items, px, gap) => `<div style="display:flex;flex-direction:column;gap:${gap}px">${items.map(([ic, t, d]) => `<div class="feat" style="gap:${px * .7}px"><span class="ic" style="width:${px * 2.3}px;height:${px * 2.3}px;border-radius:${px * .55}px">${icon(ic, px * 1.1, 1.9)}</span><div><h3 style="font-size:${px}px;font-weight:700">${t}</h3>${d ? `<p class="muted" style="font-size:${px * .7}px;line-height:1.4;margin-top:4px">${d}</p>` : ''}</div></div>`).join('')}</div>`;
const comparativo = (px) => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:${px}px">
  <div style="border-radius:${px}px;padding:${px * 1.2}px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.15)"><p style="font-size:${px * .75}px;color:#cbbfb4;font-weight:600">Com comissão de 15%</p><p class="dm" style="font-size:${px * 1.8}px;font-weight:800;margin-top:${px * .4}px;color:#ff9b7d;white-space:nowrap">− R$ 300</p><p style="font-size:${px * .7}px;color:#cbbfb4;margin-top:${px * .3}px">em um evento de R$ 2.000</p></div>
  <div style="border-radius:${px}px;padding:${px * 1.2}px;background:var(--p);color:#fff"><p style="font-size:${px * .75}px;font-weight:600;color:#ffe1d4">No Eventos Conecta</p><p class="dm" style="font-size:${px * 1.8}px;font-weight:800;margin-top:${px * .4}px;white-space:nowrap">R$ 0</p><p style="font-size:${px * .7}px;margin-top:${px * .3}px;color:#ffe7dd">de comissão. Só ${PRECO}/mês</p></div></div>
  <p style="font-size:${px * .6}px;color:#a99d92;margin-top:${px * .5}px">Exemplo ilustrativo: 15% é uma comissão usada como referência; plataformas variam.</p>`;

add('assinatura/feed-01-preco.png', 1080, 1350, 'dark', `
  <div style="padding:80px 80px 0;display:flex;justify-content:space-between;align-items:center">${logo(44)}<span class="eyebrow" style="font-size:22px">Assinatura profissional</span></div>
  <div style="padding:100px 80px 0">
    <h1 style="font-size:78px;line-height:1.02;font-weight:700">Receba pedidos de clientes por</h1>
    <div style="margin-top:40px">${preco(250)}</div>
    <p style="font-size:38px;margin-top:30px;color:#e8ddd3">Menos de <b style="color:#fff">${PRECO_DIA} por dia</b>. Zero comissão sobre os seus serviços.</p>
  </div>
  <div style="padding:60px 80px 0">${chips([['Wallet', '100% do valor é seu'], ['Radar', 'Radar de pedidos'], ['FileText', 'Contrato automático'], ['Calculator', 'Calculadoras']], 28, 14)}</div>
  <div style="margin-top:auto;padding:0 80px 80px"><div class="cta solid" style="padding:32px 40px;font-size:34px"><span>Assine agora</span><span style="font-weight:500">${SITE}</span></div></div>`);

add('assinatura/feed-02-vantagens.png', 1080, 1350, 'sand', `
  <div style="padding:70px 80px 0;display:flex;justify-content:space-between;align-items:center">${logo(42)}<span class="badge" style="background:#fbe7df;color:var(--p2);font-size:24px;padding:12px 22px">${PRECO}/mês</span></div>
  <div style="padding:46px 80px 0"><h1 style="font-size:66px;line-height:1;font-weight:700">Tudo isso na sua <span class="hl">assinatura:</span></h1></div>
  <div style="padding:40px 80px 0">${listaVantagens(VANTAGENS.slice(0, 8).map(([ic, t]) => [ic, t, '']), 34, 20)}</div>
  <div style="margin-top:auto;padding:0 80px 70px"><div class="cta solid" style="padding:28px 40px;font-size:30px"><span>Zero comissão · assine</span><span style="font-weight:500">${SITE}</span></div></div>`);

add('assinatura/feed-03-comparativo.png', 1080, 1350, 'dark', `
  <div style="padding:80px 80px 0">${logo(44)}</div>
  <div style="padding:80px 80px 0">
    <div class="eyebrow" style="font-size:24px">Faça a conta</div>
    <h1 style="font-size:84px;line-height:1;margin-top:22px;font-weight:700">Comissão come o seu lucro. <span class="hl">Assinatura, não.</span></h1>
  </div>
  <div style="padding:60px 80px 0">${comparativo(40)}</div>
  <div style="padding:40px 80px 0"><p style="font-size:30px;line-height:1.45;color:#e8ddd3">Com um único evento, a assinatura já se paga. O resto do mês é lucro seu.</p></div>
  <div style="margin-top:auto;padding:0 80px 80px"><div class="cta solid" style="padding:32px 40px;font-size:34px"><span>Assine por ${PRECO}/mês</span><span style="font-weight:500">${SITE}</span></div></div>`);

add('assinatura/story-01-preco.png', 1080, 1920, 'paprika on-paprika', `
  <div class="dots" style="width:800px;height:800px;right:-320px;top:-200px;background:#fff;opacity:.07"></div>
  <div style="position:relative;padding:250px 80px 0">${logo(52)}</div>
  <div style="position:relative;padding:140px 80px 0">
    <div class="eyebrow" style="font-size:30px">Profissional de eventos</div>
    <h1 style="font-size:96px;line-height:1;font-weight:800;margin-top:30px">Clientes da sua região por</h1>
    <div style="margin-top:50px">${preco(280, true)}</div>
    <p style="font-size:44px;line-height:1.4;margin-top:40px;color:#fff3ee">Zero comissão. Menos de ${PRECO_DIA} por dia.</p>
  </div>
  <div style="position:relative;margin-top:auto;padding:0 80px 340px"><div class="cta white" style="padding:36px 44px;font-size:38px;justify-content:center">Assine: <b style="margin-left:.35em">${SITE}</b></div></div>`);

add('assinatura/story-02-vantagens.png', 1080, 1920, 'cream', `
  <div style="padding:250px 80px 0;display:flex;justify-content:space-between;align-items:center">${logo(50)}<span class="badge" style="background:#fbe7df;color:var(--p2);font-size:28px;padding:14px 24px">${PRECO}/mês</span></div>
  <div style="padding:70px 80px 0"><h1 style="font-size:84px;line-height:1;font-weight:800">O que você ganha <span class="hl">assinando:</span></h1></div>
  <div style="padding:60px 80px 0">${listaVantagens(VANTAGENS.slice(0, 5), 42, 34)}</div>
  <div style="margin-top:auto;padding:0 80px 340px"><div class="cta solid" style="padding:36px 44px;font-size:38px;justify-content:center">${SITE}</div></div>`);

add('assinatura/whatsapp-assinatura.png', 1080, 1080, 'dark', `
  <div style="padding:64px 70px 0;display:flex;justify-content:space-between;align-items:center">${logo(42)}<span class="eyebrow" style="font-size:20px">Assinatura profissional</span></div>
  <div style="padding:46px 70px 0;display:flex;gap:50px;align-items:flex-end">
    <div>${preco(190)}<p style="font-size:28px;color:#e8ddd3;margin-top:16px">Zero comissão · menos de ${PRECO_DIA}/dia</p></div>
  </div>
  <div style="padding:40px 70px 0;display:grid;grid-template-columns:1fr 1fr;gap:18px 30px">${VANTAGENS.slice(0, 8).map(([ic, t]) => `<div style="display:flex;gap:14px;align-items:center;font-size:26px;font-weight:600"><span style="color:var(--p)">${icon(ic, 30, 2)}</span>${t}</div>`).join('')}</div>
  <div style="margin-top:auto;padding:0 70px 64px"><div class="cta solid" style="padding:26px 34px;font-size:30px"><span>Assine agora</span><span style="font-weight:500">${SITE}</span></div></div>`);

// Folheto em PDF (A4) para mandar no WhatsApp ou imprimir.
const folheto = page(794, 1123, 'cream', `<style>.art > * { flex-shrink: 0; }</style>
  <div style="background:var(--dark);color:#fff;padding:44px 52px 40px;position:relative;overflow:hidden">
    <div class="dots" style="width:420px;height:420px;right:-140px;top:-160px;opacity:.25"></div>
    <div style="position:relative">${logo(30)}<div class="eyebrow" style="font-size:13px;margin-top:26px">Assinatura para profissionais de eventos</div>
    <h1 style="font-size:46px;line-height:1.02;font-weight:700;margin-top:12px">Mais clientes. <span class="hl">Zero comissão.</span></h1>
    <div style="display:flex;align-items:flex-end;gap:26px;margin-top:18px">${preco(92)}<p style="font-size:16px;color:#e8ddd3;line-height:1.5;margin-bottom:10px">Menos de ${PRECO_DIA} por dia.<br/>Renovação mensal por Pix. Sem fidelidade.</p></div></div>
  </div>
  <div style="padding:24px 52px 0"><h2 style="font-size:22px;font-weight:700">O que a assinatura libera</h2></div>
  <div style="padding:14px 52px 0;display:grid;grid-template-columns:1fr 1fr;gap:12px 26px">${VANTAGENS.map(([ic, t, d]) => `<div class="feat" style="gap:12px"><span class="ic" style="width:40px;height:40px;border-radius:11px">${icon(ic, 20, 2)}</span><div><h3 style="font-size:15px;font-weight:700">${t}</h3><p class="muted" style="font-size:12px;line-height:1.4;margin-top:2px">${d}</p></div></div>`).join('')}</div>
  <div style="margin:20px 52px 0;background:var(--dark);border-radius:16px;padding:16px 20px">${comparativo(15)}</div>
  <div style="padding:18px 52px 0;display:grid;grid-template-columns:repeat(3,1fr);gap:14px">${[['1', 'Cadastre-se', 'CPF ou CNPJ, fotos dos seus trabalhos e chave Pix.'], ['2', 'Aguarde a aprovação', 'A equipe confere o seu cadastro.'], ['3', 'Assine e receba pedidos', `${PRECO}/mês via Pix. Perfil no ar na hora.`]].map(([n, t, d]) => `<div class="step" style="padding:14px;gap:12px"><span class="n" style="font-size:30px">${n}</span><div><h3 style="font-size:14px;font-weight:700">${t}</h3><p class="muted" style="font-size:11.5px;line-height:1.4;margin-top:3px">${d}</p></div></div>`).join('')}</div>
  <div style="margin-top:auto;padding:0 52px 40px"><div class="cta solid" style="padding:18px 24px;font-size:18px;border-radius:14px"><span>Cadastre-se em ${SITE}/trabalhe-como</span><span style="font-weight:500">${WHATSAPP}</span></div><p class="muted" style="font-size:10.5px;margin-top:10px">${PROFISSOES}. ${REGIAO}. Valor da assinatura sujeito a alteração; confira no site.</p></div>`);

// ---------- Cenas dos vídeos (Reels / TikTok / Status) ----------
// Área segura: 220px no topo, 420px embaixo e 140px à direita (botões do app).
const cena = (cls, inner, hero = false) => page(1080, 1920, cls, `${hero ? '<div class="hero" style="height:1150px"></div>' : ''}<div style="position:relative;display:flex;flex-direction:column;justify-content:center;flex:1;padding:220px 140px 420px 80px">${inner}</div>`);
const videos = {
  'reels-tiktok/video-cliente.mp4': [
    cena('dark', `<div style="margin-top:auto">${logo(48)}<h1 style="font-size:150px;line-height:.95;font-weight:800;margin-top:40px">Vai fazer<br/>uma <span class="hl">festa?</span></h1></div>`, true),
    cena('cream', `<h1 style="font-size:120px;line-height:1;font-weight:800">Precisa de…</h1><div style="margin-top:70px">${chips(SERVICOS, 54, 22)}</div>`),
    cena('sand', `<div class="eyebrow" style="font-size:30px">Passo 1</div><h1 style="font-size:104px;line-height:1;font-weight:700;margin-top:24px">Conte o seu evento.</h1><div class="eyebrow" style="font-size:30px;margin-top:70px">Passo 2</div><h1 style="font-size:104px;line-height:1;font-weight:700;margin-top:24px"><span class="hl">Receba propostas</span> da sua região.</h1>`),
    cena('paprika on-paprika', `<h1 style="font-size:118px;line-height:.98;font-weight:800">Fechou? Contrato em PDF e WhatsApp do profissional.</h1><p style="font-size:44px;margin-top:44px;color:#fff3ee">Grátis para quem contrata.</p>`),
    cena('dark', `${logo(70)}<h1 style="font-size:96px;line-height:1;font-weight:700;margin-top:60px">Peça seu orçamento</h1><div class="cta solid" style="margin-top:50px;padding:40px 46px;font-size:46px;justify-content:center">${SITE}</div><p class="muted" style="font-size:34px;margin-top:30px">${REGIAO}</p>`),
  ],
  'reels-tiktok/video-lista-de-compras.mp4': [
    cena('dark', `<div style="margin-top:auto">${logo(48)}<h1 style="font-size:124px;line-height:.98;font-weight:800;margin-top:40px">Chef, você ainda faz a lista de compras <span class="hl">de graça?</span></h1></div>`, true),
    cena('cream', `<span class="feat"><span class="ic" style="width:150px;height:150px;border-radius:36px">${icon('Calculator', 76, 1.8)}</span></span><h1 style="font-size:100px;line-height:1;font-weight:700;margin-top:50px">A calculadora monta a lista com as <span class="hl">quantidades certas.</span></h1>`),
    cena('paprika on-paprika', `<h1 style="font-size:116px;line-height:.98;font-weight:800">Cobre pela lista no orçamento…</h1><p style="font-size:64px;font-weight:700;margin-top:50px;color:#ffe1d4">…ou dê de cortesia.</p>`),
    cena('dark', `<h1 style="font-size:96px;line-height:1;font-weight:700;margin-bottom:60px">Tudo aparece <span class="hl">no contrato.</span></h1>${contratoMock(36)}`),
    cena('dark', `${logo(70)}<h1 style="font-size:96px;line-height:1;font-weight:700;margin-top:60px">Zero comissão. Cadastre-se</h1><div class="cta solid" style="margin-top:50px;padding:40px 46px;font-size:46px;justify-content:center">${SITE}</div><p class="muted" style="font-size:34px;margin-top:30px">CPF ou CNPJ · ${REGIAO}</p>`),
  ],
  'assinatura/video-assinatura.mp4': [
    cena('dark', `<div style="margin-top:auto">${logo(48)}<h1 style="font-size:124px;line-height:.98;font-weight:800;margin-top:40px">Quanto a comissão <span class="hl">leva do seu evento?</span></h1></div>`, true),
    cena('dark', `<h1 style="font-size:90px;line-height:1;font-weight:700;margin-bottom:60px">Faça a conta:</h1>${comparativo(46)}`),
    cena('paprika on-paprika', `<p style="font-size:56px;font-weight:700;color:#ffe1d4">No Eventos Conecta:</p><div style="margin-top:30px">${preco(300, true)}</div><p style="font-size:52px;font-weight:700;margin-top:40px">e 100% do valor é seu.</p>`),
    cena('cream', `<h1 style="font-size:80px;line-height:1;font-weight:800;margin-bottom:50px">Na assinatura:</h1>${listaVantagens(VANTAGENS.slice(0, 5).map(([ic, t]) => [ic, t, '']), 52, 34)}`),
    cena('sand', `${listaVantagens(VANTAGENS.slice(5, 10).map(([ic, t]) => [ic, t, '']), 52, 34)}`),
    cena('dark', `${logo(70)}<h1 style="font-size:96px;line-height:1;font-weight:700;margin-top:60px">Assine por ${PRECO}/mês</h1><div class="cta solid" style="margin-top:50px;padding:40px 46px;font-size:46px;justify-content:center">${SITE}</div><p class="muted" style="font-size:34px;margin-top:30px">Menos de ${PRECO_DIA} por dia · ${REGIAO}</p>`),
  ],
  'reels-tiktok/video-profissional.mp4': [
    cena('dark', `<div style="margin-top:auto">${logo(48)}<h1 style="font-size:140px;line-height:.95;font-weight:800;margin-top:40px">Trabalha com <span class="hl">eventos?</span></h1></div>`, true),
    cena('cream', `<h1 style="font-size:84px;line-height:1.05;font-weight:700">Garçom · Chef<br/>Barman · Cozinheiro<br/>Auxiliar · Buffet<br/>Personal chef<br/><span class="hl">Limpeza · Jardinagem</span></h1>`),
    cena('sand', `<span class="feat"><span class="ic" style="width:150px;height:150px;border-radius:36px">${icon('Radar', 76, 1.8)}</span></span><h1 style="font-size:104px;line-height:1;font-weight:700;margin-top:50px">Receba pedidos de clientes <span class="hl">da sua região.</span></h1>`),
    cena('paprika on-paprika', `<div class="dm" style="font-size:300px;line-height:.85;font-weight:800;letter-spacing:-.06em">100%</div><h1 style="font-size:96px;line-height:1;font-weight:800;margin-top:30px">do valor é seu. Zero comissão.</h1>`),
    cena('dark', `${logo(70)}<h1 style="font-size:96px;line-height:1;font-weight:700;margin-top:60px">Cadastre-se</h1><div class="cta solid" style="margin-top:50px;padding:40px 46px;font-size:46px;justify-content:center">${SITE}</div><p class="muted" style="font-size:34px;margin-top:30px">CPF ou CNPJ · ${REGIAO}</p>`),
  ],
};

// ---------- Renderização ----------
const browser = await chromium.launch();
async function shot(html, w, h, file) {
  const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await pg.setContent(html, { waitUntil: 'networkidle' });
  await pg.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await pg.screenshot({ path: file });
  await pg.close();
}
for (const p of pecas) { await shot(p.html, p.w, p.h, path.join(OUT, p.arquivo)); console.log('ok', p.arquivo); }
{
  const pg = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await pg.setContent(folheto, { waitUntil: 'networkidle' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.pdf({ path: path.join(OUT, 'assinatura/folheto-assinatura.pdf'), width: '794px', height: '1123px', printBackground: true, pageRanges: '1' });
  await pg.screenshot({ path: path.join(OUT, 'assinatura/folheto-assinatura.png') });
  await pg.close();
  console.log('ok assinatura/folheto-assinatura.pdf');
}

const tmp = fs.mkdtempSync(path.join(OUT, '.cenas-'));
const SEG = 3.2, FADE = 0.5, FPS = 30;
for (const [arquivo, cenas] of Object.entries(videos)) {
  const frames = [];
  for (const [i, html] of cenas.entries()) { const f = path.join(tmp, `${path.basename(arquivo, '.mp4')}-${i}.png`); await shot(html, 1080, 1920, f); frames.push(f); }
  fs.mkdirSync(path.join(OUT, path.dirname(arquivo)), { recursive: true });
  // Capa (1ª cena) para usar como thumbnail do Reels/TikTok.
  fs.copyFileSync(frames[0], path.join(OUT, arquivo.replace('.mp4', '-capa.png')));
  const inputs = frames.flatMap(f => ['-i', f]);
  const zoom = frames.map((_, i) => `[${i}:v]scale=2160:3840,zoompan=z='min(zoom+0.0007,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(SEG * FPS)}:s=1080x1920:fps=${FPS},format=yuv420p,setsar=1[v${i}]`);
  let chain = '[v0]', parts = [...zoom];
  for (let i = 1; i < frames.length; i++) {
    const out = i === frames.length - 1 ? '[out]' : `[x${i}]`;
    parts.push(`${chain}[v${i}]xfade=transition=fade:duration=${FADE}:offset=${(i * (SEG - FADE)).toFixed(2)}${out}`);
    chain = out;
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', parts.join(';'), '-map', '[out]', '-r', String(FPS), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', path.join(OUT, arquivo)]);
  console.log('ok', arquivo);
}
fs.rmSync(tmp, { recursive: true, force: true });
await browser.close();
