import { demoProfessionals, type Professional } from '../shared/catalog';
import { findCategory, serviceCatalogFrom } from '../shared/services';
import { loadProfessionals } from './gastro/catalog';
import { businessDefaults, whatsappLink } from '../shared/business';
import { getSiteContent } from './gastro/content';
import {
  DEFAULT_ORIGIN, JOBS_BASE, SERVICES_BASE, SITE_NAME, seoCatalogFrom,
  isSeoPath, matchProfessionals, nearbyCities, resolveSeoRoute, seoCitiesFrom, seoPaths,
  type Crumb, type Faq, type ResolvedSeoRoute, type SeoCatalog, type SeoCity,
} from '../shared/seo';

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const jsonLd = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

/** Endereço público do site (domínio próprio). */
export function siteOrigin(): string {
  const env = process.env.GASTRO_PUBLIC_ORIGIN?.trim().replace(/\/+$/, '');
  return env && /^https:\/\//.test(env) ? env : DEFAULT_ORIGIN;
}
const abs = (path: string) => new URL(path, siteOrigin()).href;

type StaticPage = { title: string; description: string; heading: string; body: string };
const descriptions: Record<string, StaticPage> = {
  '/': { title: `${SITE_NAME} | Chef, garçom, barman e buffet para eventos`, description: 'Contrate chef, personal chef, buffet, garçom, barman, limpeza e jardinagem para o seu evento. Grátis para quem contrata: receba propostas de profissionais da sua região.', heading: 'Profissionais para o seu evento, do chef ao garçom.', body: 'Encontre chefs, buffets, garçons, barmans e profissionais que transformam encontros em experiências inesquecíveis. Peça orçamento grátis, compare propostas e feche com contrato em PDF. Feito por quem vive a gastronomia.' },
  '/profissionais': { title: `Encontre profissionais para eventos | ${SITE_NAME}`, description: 'Explore chefs, personal chefs, cozinheiros, garçons, barmans, limpeza e jardinagem por cidade. Conheça portfólios, avaliações e receba propostas.', heading: 'Gente que transforma ocasiões em experiências.', body: 'Explore estilos, conheça talentos e encontre o profissional certo para o seu evento. Portfólios demonstrativos são identificados e não representam fornecedores contratáveis.' },
  '/sobre': { title: `Criado por quem vive a gastronomia | ${SITE_NAME}`, description: `Conheça o ${SITE_NAME}, criado por um chef profissional para aproximar clientes e profissionais de eventos com transparência e valorização.`, heading: 'Quem vive a cozinha sabe o valor de uma boa conexão.', body: `O ${SITE_NAME} nasceu de uma ideia simples: aproximar quem ama receber de quem faz dos eventos e da gastronomia a sua profissão. Criada por um Chef de Cozinha Profissional, a plataforma foi pensada a partir da realidade do setor. A tecnologia aproxima. As pessoas fazem acontecer.` },
  '/como-funciona': { title: `Como funciona | ${SITE_NAME}`, description: `Conte sua ocasião, compare propostas e organize seu evento em um só lugar. Conheça cada etapa do ${SITE_NAME}.`, heading: 'Uma boa experiência começa com clareza.', body: 'Conte sua ocasião em três passos com data, local, convidados e orçamento. Conheça e compare profissionais. Aceite a proposta, receba o WhatsApp do profissional e o contrato em PDF. Realize e avalie. O pagamento é feito direto ao profissional, sem comissão da plataforma.' },
  '/para-profissionais': { title: `Trabalhe com eventos sem pagar comissão | ${SITE_NAME}`, description: 'Cadastre-se como profissional (CPF ou CNPJ): chefs, personal chefs, cozinheiros, auxiliares, barmans, garçons, buffets, limpeza e jardinagem. Receba pedidos da sua região.', heading: 'Novas oportunidades. Zero comissão.', body: 'Para chefs, personal chefs, cozinheiros, auxiliares, barmans, garçons, buffets, equipes de limpeza e jardineiros. Radar de pedidos com score de intenção, Copilot com calculadoras de ingredientes, equipe e custos e controle financeiro. Você recebe 100% do valor negociado e paga só uma assinatura mensal fixa via Pix.' },
  '/seguranca': { title: `Segurança e privacidade | ${SITE_NAME}`, description: `Saiba como o ${SITE_NAME} trata os dados de conta e de pagamentos.`, heading: 'Segurança e privacidade', body: 'Dados privados exigem autenticação e autorização. Senhas são derivadas criptograficamente. A foto do rosto enviada no cadastro é privada e usada só pela administração para conferir identidade. Pagamentos de assinatura são processados pelo Mercado Pago.' },
  '/termos': { title: `Termos da plataforma | ${SITE_NAME}`, description: `Conheça as regras de intermediação, propostas, assinatura, contratos e avaliações do ${SITE_NAME}.`, heading: 'Termos da plataforma', body: `O ${SITE_NAME} conecta clientes e profissionais. Clientes não pagam nada. Profissionais pagam uma assinatura mensal fixa e recebem 100% do valor negociado. Ao aceitar uma proposta, o contrato é gerado em PDF para as duas partes.` },
};

const PRIVATE_PATHS = ['/conta', '/painel', '/orcamento', '/admin', '/admin/painel', '/redefinir-senha'];

const organization = () => ({ '@type': 'Organization', '@id': abs('/#organizacao'), name: SITE_NAME, url: abs('/'), logo: abs('/icon-512.png') });

function breadcrumbLd(crumbs: Crumb[]) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.path) })) };
}
function faqLd(faqs: Faq[]) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
}

const breadcrumbHtml = (crumbs: Crumb[]) => `<nav aria-label="Navegação estrutural"><ol>${crumbs.map(c => `<li><a href="${escape(c.path)}">${escape(c.name)}</a></li>`).join('')}</ol></nav>`;
const faqHtml = (faqs: Faq[]) => `<h2>Perguntas frequentes</h2>${faqs.map(([q, a]) => `<h3>${escape(q)}</h3><p>${escape(a)}</p>`).join('')}`;
const listHtml = (items: string[]) => `<ul>${items.map(i => `<li>${escape(i)}</li>`).join('')}</ul>`;
const proCard = (p: Professional) => `<article><h3><a href="/profissionais/${escape(p.id)}">${escape(p.name)}</a></h3><p>${escape(p.category)} · ${escape(p.city)}${p.rating?.count ? ` · nota ${p.rating.average.toFixed(1)} (${p.rating.count} avaliações)` : ''}</p><p>${escape(p.description.slice(0, 220))}</p></article>`;

async function seoRouteHtml(route: ResolvedSeoRoute, cities: SeoCity[], content: Record<string, string>, seo: SeoCatalog): Promise<{ body: string; ld: unknown[] }> {
  const { page } = route;
  const ld: unknown[] = [breadcrumbLd(page.crumbs), faqLd(page.faqs)];
  let main = '';
  if (route.kind === 'servicesHub') {
    main = `<h2>Serviços</h2>${seo.services.map(s => `<h3><a href="${SERVICES_BASE}/${s.slug}">${escape(s.name)}</a></h3><p>${escape(s.intro)}</p>`).join('')}<h2>Cidades atendidas</h2><ul>${cities.map(c => `<li>${escape(c.name)}/${escape(c.uf)}: ${seo.services.slice(0, 4).map(s => `<a href="${SERVICES_BASE}/${s.slug}/${c.slug}">${escape(s.name)}</a>`).join(', ')}</li>`).join('')}</ul>`;
  } else if (route.kind === 'jobsHub') {
    main = `<h2>Profissões</h2>${seo.professions.map(p => `<h3><a href="${JOBS_BASE}/${p.slug}">${escape(p.name)}</a></h3><p>${escape(p.intro)}</p>`).join('')}<p><a href="/conta?cadastro=profissional">Cadastrar como profissional</a></p>`;
  } else {
    const catalog = serviceCatalogFrom(content);
    const all = await loadProfessionals().catch(() => [] as Professional[]);
    if (route.kind === 'service') {
      const { service, city } = route;
      const labels = catalog.flatMap(c => c.services).filter(s => service.serviceIds.includes(s.id)).map(s => s.label);
      const pros = matchProfessionals(all, [service.categoryId], labels, city);
      const where = city ? ` em ${city.name}` : '';
      main = `${city ? `<p>${escape(service.intro)}</p>` : ''}<h2>Para quais ocasiões contratar ${escape(service.short)}${escape(where)}</h2>${listHtml(service.occasions)}<h2>O que o serviço costuma incluir</h2>${listHtml(service.includes)}<h2>Dicas para contratar bem</h2>${listHtml(service.tips)}`
        + `<h2>Profissionais${escape(where)}</h2>${pros.length ? pros.map(proCard).join('') : `<p>Publique o seu pedido e receba propostas de ${escape(service.plural)} que atendem ${escape(city ? city.name : 'a sua região')}.</p>`}`
        + `<p><a href="/orcamento">Pedir orçamento grátis</a> · <a href="/profissionais?tipo=${encodeURIComponent(service.categoryId)}${city ? `&amp;cidade=${encodeURIComponent(city.name)}` : ''}">Ver profissionais</a></p>`
        + (city ? `<h2>${escape(service.name)} em cidades próximas</h2><ul>${nearbyCities(cities, city).map(c => `<li><a href="${SERVICES_BASE}/${service.slug}/${c.slug}">${escape(service.name)} em ${escape(c.name)}</a></li>`).join('')}</ul><h2>Outros serviços em ${escape(city.name)}</h2><ul>${seo.services.filter(s => s.slug !== service.slug).map(s => `<li><a href="${SERVICES_BASE}/${s.slug}/${city.slug}">${escape(s.name)} em ${escape(city.name)}</a></li>`).join('')}</ul>`
          : `<h2>${escape(service.name)} por cidade</h2><ul>${cities.map(c => `<li><a href="${SERVICES_BASE}/${service.slug}/${c.slug}">${escape(service.name)} em ${escape(c.name)}</a></li>`).join('')}</ul>`);
      ld.push({ '@context': 'https://schema.org', '@type': 'Service', name: page.h1, serviceType: service.name, description: page.description, url: abs(page.path), provider: organization(), areaServed: city ? { '@type': 'City', name: `${city.name}, ${city.uf}` } : cities.map(c => ({ '@type': 'City', name: `${c.name}, ${c.uf}` })), offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL', description: 'Pedido de orçamento grátis para quem contrata' } });
    } else {
      const { profession, city } = route;
      const labels = catalog.flatMap(c => c.services).filter(s => profession.serviceIds.includes(s.id)).map(s => s.label);
      const categoryIds = catalog.filter(c => c.services.some(s => profession.serviceIds.includes(s.id))).map(c => c.id);
      const count = matchProfessionals(all, categoryIds, labels, city).length;
      main = `${city ? `<p>${escape(profession.intro)}</p>` : ''}<h2>Quem contrata ${escape(profession.plural)}${city ? ` em ${escape(city.name)}` : ''}</h2>${listHtml(profession.clients)}`
        + `<h2>Por que usar o ${SITE_NAME}</h2>${listHtml(['Zero comissão: você recebe 100% do valor direto no seu Pix', 'Radar de pedidos da sua região com score de intenção do cliente', 'Copilot com calculadoras de ingredientes, equipe, custos e lucro', 'Contrato em PDF gerado automaticamente a cada serviço fechado', 'Avaliações e selo Top Rated para ganhar destaque'])}`
        + (count ? `<p>${count} ${count === 1 ? 'profissional já atende' : 'profissionais já atendem'}${city ? ` em ${escape(city.name)}` : ''} pela plataforma.</p>` : '')
        + `<p><a href="/conta?cadastro=profissional">Cadastrar como ${escape(profession.role)}</a> · <a href="/para-profissionais">Como funciona para profissionais</a></p>`
        + (city ? `<h2>${escape(profession.name)} em cidades próximas</h2><ul>${nearbyCities(cities, city).map(c => `<li><a href="${JOBS_BASE}/${profession.slug}/${c.slug}">${escape(profession.name)} em ${escape(c.name)}</a></li>`).join('')}</ul>`
          : `<h2>${escape(profession.name)} por cidade</h2><ul>${cities.map(c => `<li><a href="${JOBS_BASE}/${profession.slug}/${c.slug}">${escape(profession.name)} em ${escape(c.name)}</a></li>`).join('')}</ul>`);
    }
  }
  const body = `<main>${breadcrumbHtml(page.crumbs)}<h1>${escape(page.h1)}</h1><p>${escape(page.lead)}</p>${main}${faqHtml(page.faqs)}</main>`;
  return { body, ld };
}

const NAV = `<nav><a href="/profissionais">Encontre um profissional</a> <a href="/orcamento">Planeje seu evento</a> <a href="${SERVICES_BASE}">Serviços para eventos</a> <a href="/como-funciona">Como funciona</a> <a href="/sobre">Quem somos</a> <a href="/para-profissionais">Sou profissional</a> <a href="${JOBS_BASE}">Freelas em eventos</a></nav>`;

export async function applyPublicSeo(template: string, originalUrl: string) {
  const path = new URL(originalUrl, 'http://internal.invalid').pathname.replace(/(.)\/+$/, '$1');
  const site = await getSiteContent();
  const cities = seoCitiesFrom(site);
  const seo = seoCatalogFrom(serviceCatalogFrom(site));
  let page: StaticPage | undefined = descriptions[path];
  if (path === '/' && page) page = { ...page, title: site['seo.homeTitle'] || page.title, description: site['seo.homeDescription'] || page.description };
  let status = 200;
  let detail = '';
  let customBody = '';
  let demoProfile = false;
  const ld: unknown[] = [];

  if (isSeoPath(path)) {
    const route = resolveSeoRoute(path, cities, seo);
    if (route) {
      const html = await seoRouteHtml(route, cities, site, seo);
      page = { title: route.page.title, description: route.page.description, heading: route.page.h1, body: route.page.lead };
      customBody = html.body;
      ld.push(...html.ld);
    }
  }

  const professionalId = path.match(/^\/profissionais\/([^/]+)$/)?.[1];
  if (professionalId) {
    const catalog = await loadProfessionals();
    const p = catalog.find(p => p.id === professionalId);
    if (p) {
      demoProfile = p.demo;
      page = { title: `${p.name}${p.city ? ` em ${p.city.split(',')[0]}` : ''} | ${p.category} | ${SITE_NAME}`, description: (p.description || `${p.category} em ${p.city}.`).slice(0, 155), heading: p.name, body: p.description };
      detail = `<p>${escape(p.type)} · ${escape(p.city)} · ${escape(p.category)}</p>${p.services?.length ? listHtml(p.services) : ''}${p.demo ? '<p>Portfólio demonstrativo. Valores e imagens ilustrativos; não representa fornecedor contratável.</p>' : ''}`;
      if (!p.demo) {
        const biz: Record<string, unknown> = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: p.name, description: p.description, url: abs(`/profissionais/${p.id}`), ...(p.image ? { image: abs(p.image) } : {}), ...(p.city ? { address: { '@type': 'PostalAddress', addressLocality: p.city.split(',')[0]?.trim(), addressRegion: p.city.split(',')[1]?.trim(), addressCountry: 'BR' } } : {}) };
        if (p.rating && p.rating.count > 0) biz.aggregateRating = { '@type': 'AggregateRating', ratingValue: p.rating.average, reviewCount: p.rating.count, bestRating: 5, worstRating: 1 };
        ld.push(biz, breadcrumbLd([{ name: 'Início', path: '/' }, { name: 'Profissionais', path: '/profissionais' }, { name: p.name, path: `/profissionais/${p.id}` }]));
      }
    } else {
      status = 404;
      page = { title: `Profissional não encontrado | ${SITE_NAME}`, description: `Este profissional não foi encontrado. Explore o catálogo ${SITE_NAME}.`, heading: 'Profissional não encontrado', body: 'Explore o catálogo para encontrar sua próxima conexão.' };
    }
  }
  const isPrivate = PRIVATE_PATHS.includes(path);
  if (!page && !isPrivate) { status = 404; page = { title: `Página não encontrada | ${SITE_NAME}`, description: `Esta página não foi encontrada. Volte ao início do ${SITE_NAME}.`, heading: 'Essa conexão não foi encontrada.', body: 'Que tal começar pela página inicial?' }; }
  if (!page) page = { title: path === '/painel' ? `Meu painel | ${SITE_NAME}` : path === '/conta' ? `Sua conta | ${SITE_NAME}` : `Planeje seu evento | ${SITE_NAME}`, description: 'Acesse sua conta e organize o seu evento.', heading: SITE_NAME, body: 'Entre na sua conta para acessar os seus dados privados.' };

  const noindex = isPrivate || status === 404 || demoProfile;
  let head = `<title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}"/><meta property="og:title" content="${escape(page.title)}"/><meta property="og:description" content="${escape(page.description)}"/><meta name="twitter:title" content="${escape(page.title)}"/><meta name="twitter:description" content="${escape(page.description)}"/>`;
  if (isPrivate) head += '<meta name="robots" content="noindex,nofollow"/>';
  else if (noindex) head += '<meta name="robots" content="noindex,follow"/>';
  else head += '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1"/>';
  if (status === 200) {
    const canonical = abs(path);
    head += `<link rel="canonical" href="${escape(canonical)}"/><meta property="og:url" content="${escape(canonical)}"/>`;
  }
  head += `<meta property="og:image" content="${escape(abs('/icon-512.png'))}"/><meta name="twitter:image" content="${escape(abs('/icon-512.png'))}"/>`;
  const verification = (site['seo.googleVerification'] || process.env.GOOGLE_SITE_VERIFICATION || '').trim();
  if (/^[\w-]{10,100}$/.test(verification)) head += `<meta name="google-site-verification" content="${escape(verification)}"/>`;

  const region = site['contact.region'] || businessDefaults.region;
  const waNumber = site['contact.whatsapp'] || businessDefaults.whatsappNumber;
  const waDisplay = site['contact.whatsappDisplay'] || businessDefaults.whatsappDisplay;
  if (path === '/') {
    const sameAs = [site['contact.instagram'], site['contact.facebook']].filter(v => v && /^https:\/\//.test(v));
    ld.push(
      { '@context': 'https://schema.org', ...organization(), telephone: '+' + waNumber, email: site['contact.email'] || businessDefaults.email, areaServed: region, description: page.description, ...(sameAs.length ? { sameAs } : {}) },
      { '@context': 'https://schema.org', '@type': 'WebSite', '@id': abs('/#site'), name: SITE_NAME, url: abs('/'), inLanguage: 'pt-BR', publisher: { '@id': abs('/#organizacao') } },
    );
  }
  for (const item of ld) head += jsonLd(item);

  const contact = path === '/' ? `<p>Atendimento em ${escape(region)}. Fale Conosco pelo WhatsApp <a href="${escape(whatsappLink(undefined, waNumber))}">${escape(waDisplay)}</a>.</p>` : '';
  const serviceLinks = path === '/' || path === '/profissionais'
    ? `<h2>Serviços para eventos</h2><ul>${seo.services.map(s => `<li><a href="${SERVICES_BASE}/${s.slug}">${escape(s.name)}</a></li>`).join('')}</ul><h2>Para profissionais</h2><ul>${seo.professions.map(p => `<li><a href="${JOBS_BASE}/${p.slug}">${escape(p.name)}</a></li>`).join('')}</ul>`
    : '';
  const cards = (path === '/' || path === '/profissionais') && site['catalog.showDemo'] !== 'false'
    ? demoProfessionals(site, id => findCategory(serviceCatalogFrom(site), id)?.name).map(p => `<article><h2><a href="/profissionais/${escape(p.id)}">${escape(p.name)}</a></h2><p>${escape(p.type)} · ${escape(p.city)}</p><p>${escape(p.description)}</p><p>Portfólio ilustrativo.</p></article>`).join('')
    : '';
  const body = customBody
    ? customBody.replace('</main>', `${NAV}</main>`)
    : `<main><h1>${escape(page.heading)}</h1><p>${escape(page.body)}</p>${detail}${NAV}${contact}${serviceLinks}${cards}</main>`;
  const html = template
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta (?:name="(?:description|robots|twitter:title|twitter:description)"|property="(?:og:title|og:description)")[^>]*>/g, '')
    .replace('</head>', head + '</head>')
    .replace(/<div id="root">[\s\S]*?<\/div>/, `<div id="root">${body}</div>`);
  return { html, status };
}

/** robots.txt: libera o site público e aponta o sitemap. */
export function robotsTxt(): string {
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /painel', 'Disallow: /conta', 'Disallow: /admin', 'Disallow: /redefinir-senha', '', `Sitemap: ${abs('/sitemap.xml')}`, ''].join('\n');
}

/** sitemap.xml com as páginas institucionais, de SEO e os perfis reais. */
export async function sitemapXml(): Promise<string> {
  const site = await getSiteContent();
  const cities = seoCitiesFrom(site);
  const pros = (await loadProfessionals().catch(() => [] as Professional[])).filter(p => !p.demo);
  const today = new Date().toISOString().slice(0, 10);
  const entries: Array<[string, string]> = [
    ['/', '1.0'], ['/profissionais', '0.9'], ['/como-funciona', '0.6'], ['/para-profissionais', '0.8'], ['/sobre', '0.5'], ['/termos', '0.2'], ['/seguranca', '0.2'],
    ...seoPaths(cities, seoCatalogFrom(serviceCatalogFrom(site))).map(p => [p, p.split('/').length > 3 ? '0.7' : '0.8'] as [string, string]),
    ...pros.map(p => [`/profissionais/${p.id}`, '0.6'] as [string, string]),
  ];
  const urls = entries.map(([path, priority]) => `<url><loc>${escape(abs(path))}</loc><lastmod>${today}</lastmod><priority>${priority}</priority></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}
