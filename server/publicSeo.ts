import { demoProfessionals } from '../shared/catalog';
import { findCategory, serviceCatalogFrom } from '../shared/services';
import { loadProfessionals } from './gastro/catalog';
import { businessDefaults, whatsappLink } from '../shared/business';
import { getSiteContent } from './gastro/content';
const escape = (s:string) => s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const descriptions: Record<string,{title:string;description:string;heading:string;body:string}> = {
 '/':{title:'GastroConecta | Chefs, buffets e boas conexões',description:'Encontre chefs, personal chefs, garçons, barmans, limpeza e jardinagem na sua região. Cadastro gratuito para clientes e propostas personalizadas.',heading:'O ingrediente certo para seus melhores momentos.',body:'Encontre chefs, buffets e profissionais que transformam encontros em experiências inesquecíveis. Feito por quem vive a gastronomia. Pensado para quem ama receber.'},
 '/profissionais':{title:'Encontre profissionais | GastroConecta',description:'Explore chefs, personal chefs, cozinheiros, garçons, barmans, limpeza e jardinagem por cidade. Conheça portfólios e receba propostas.',heading:'Gente que transforma ocasiões em experiências.',body:'Explore estilos, conheça talentos e encontre o profissional certo para o seu evento. Portfólios demonstrativos são identificados e não representam fornecedores contratáveis.'},
 '/sobre':{title:'Criado por quem vive a gastronomia | GastroConecta',description:'Conheça o GastroConecta, criado por um chef profissional para aproximar clientes e profissionais com transparência e valorização.',heading:'Quem vive a cozinha sabe o valor de uma boa conexão.',body:'O GastroConecta nasceu de uma ideia simples: aproximar quem ama receber de quem faz da gastronomia a sua profissão. Criada por um Chef de Cozinha Profissional, a plataforma foi pensada a partir da realidade do setor. A tecnologia aproxima. As pessoas fazem acontecer.'},
 '/como-funciona':{title:'Como funciona | GastroConecta',description:'Conte sua ocasião, compare propostas e organize seu evento em um só lugar. Conheça cada etapa do GastroConecta.',heading:'Uma boa experiência começa com clareza.',body:'Conte sua ocasião em três passos com data, local, convidados e orçamento. Conheça e compare profissionais. Aceite a proposta, receba o WhatsApp do profissional e o contrato em PDF. Realize e avalie. O pagamento é feito direto ao profissional, sem comissão da plataforma.'},
 '/para-profissionais':{title:'Oportunidades para profissionais | GastroConecta',description:'Cadastre-se como profissional (CPF ou CNPJ). Chefs, personal chefs, cozinheiros, auxiliares, barmans, garçons, limpeza e jardinagem.',heading:'Novas oportunidades. Zero comissão.',body:'Para chefs, personal chefs, cozinheiros, auxiliares, barmans, garçons, equipes de limpeza e jardineiros. Radar de pedidos com score de intenção, Copilot com calculadoras de ingredientes, equipe e custos e controle financeiro. Você recebe 100% do valor negociado e paga só uma assinatura mensal fixa via Pix.'},
 '/seguranca':{title:'Segurança e privacidade | GastroConecta',description:'Saiba como o GastroConecta trata os dados de conta e quais integrações de segurança ainda dependem de homologação.',heading:'Segurança e privacidade',body:'Dados privados exigem autenticação e autorização. Senhas são derivadas criptograficamente. A foto do rosto enviada no cadastro é privada e usada só pela administração para conferir identidade. Pagamentos de assinatura são processados pelo Mercado Pago. Antes de operar comercialmente, a plataforma precisa de política LGPD definitiva, identificação do responsável e canal para direitos de privacidade.'},
 '/termos':{title:'Termos da plataforma | GastroConecta',description:'Conheça as regras de intermediação, propostas, assinatura, contratos e avaliações do GastroConecta.',heading:'Termos da plataforma',body:'O GastroConecta conecta clientes e profissionais. Clientes não pagam nada. Profissionais pagam uma assinatura mensal fixa e recebem 100% do valor negociado. Ao aceitar uma proposta, o contrato é gerado em PDF para as duas partes.'},
};
export async function applyPublicSeo(template:string, originalUrl:string) {
 const path = new URL(originalUrl,'http://internal.invalid').pathname;
 const privatePaths = ['/conta','/painel','/orcamento','/admin','/admin/painel'];
 const site = await getSiteContent();
 let page = descriptions[path];
 if(path==='/'&&page)page={...page,title:site['seo.homeTitle']||page.title,description:site['seo.homeDescription']||page.description};
 let status=200;
 let detail='';
 const professionalId = path.match(/^\/profissionais\/([^/]+)$/)?.[1];
 if(professionalId){
  const catalog=await loadProfessionals();
  const p=catalog.find(p=>p.id===professionalId);
  if(p){page={title:`${p.name} | GastroConecta`,description:p.description.slice(0,155),heading:p.name,body:p.description};detail=`<p>${escape(p.type)} · ${escape(p.city)} · ${escape(p.category)}</p>${p.demo?'<p>Portfólio demonstrativo. Valores e imagens ilustrativos; não representa fornecedor contratável.</p>':''}`;}
  else {status=404;page={title:'Profissional não encontrado | GastroConecta',description:'Este profissional não foi encontrado. Explore o catálogo GastroConecta.',heading:'Profissional não encontrado',body:'Explore o catálogo para encontrar sua próxima conexão.'};}
 }
 if(!page&&!privatePaths.includes(path)){status=404;page={title:'Página não encontrada | GastroConecta',description:'Esta conexão não foi encontrada. Volte ao início do GastroConecta.',heading:'Essa conexão não foi encontrada.',body:'Que tal começar pela página inicial?'};}
 if(!page){page={title:path==='/painel'?'Meu painel | GastroConecta':path==='/conta'?'Sua conta | GastroConecta':'Planeje seu evento | GastroConecta',description:'Acesse sua conta e organize sua experiência gastronômica.',heading:'GastroConecta',body:'Entre na sua conta para acessar os seus dados privados.'};}
 const noindex=privatePaths.includes(path)||status===404;
 let head=`<title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}"/><meta property="og:title" content="${escape(page.title)}"/><meta property="og:description" content="${escape(page.description)}"/><meta name="twitter:title" content="${escape(page.title)}"/><meta name="twitter:description" content="${escape(page.description)}"/>`;
 if(noindex)head+='<meta name="robots" content="noindex,nofollow"/>';
 const origin=process.env.GASTRO_PUBLIC_ORIGIN;
 if(origin&&/^https:\/\//.test(origin)){const canonical=new URL(path,origin).href;head+=`<link rel="canonical" href="${escape(canonical)}"/><meta property="og:url" content="${escape(canonical)}"/><meta property="og:image" content="${escape(new URL('/icon-512.png',origin).href)}"/><meta name="twitter:image" content="${escape(new URL('/icon-512.png',origin).href)}"/>`;}
 const region=site['contact.region']||businessDefaults.region;
 const waNumber=site['contact.whatsapp']||businessDefaults.whatsappNumber;
 const waDisplay=site['contact.whatsappDisplay']||businessDefaults.whatsappDisplay;
 if(path==='/'){const sameAs=[site['contact.instagram'],site['contact.facebook']].filter(v=>v&&/^https:\/\//.test(v));const ld:Record<string,unknown>={'@context':'https://schema.org','@type':'FoodEstablishment',name:businessDefaults.name,telephone:'+'+waNumber,email:site['contact.email']||businessDefaults.email,areaServed:region,servesCuisine:'Brasileira',...(sameAs.length?{sameAs}:{})};if(origin&&/^https:\/\//.test(origin))ld.url=new URL('/',origin).href;head+=`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g,'\\u003c')}</script>`;}
 const contact=path==='/'?`<p>Atendimento em ${escape(region)}. Fale Conosco pelo WhatsApp <a href="${escape(whatsappLink(undefined,waNumber))}">${escape(waDisplay)}</a>.</p>`:'';
 const cards=(path==='/'||path==='/profissionais')&&site['catalog.showDemo']!=='false'?demoProfessionals(site,id=>findCategory(serviceCatalogFrom(site),id)?.name).map(p=>`<article><h2><a href="/profissionais/${escape(p.id)}">${escape(p.name)}</a></h2><p>${escape(p.type)} · ${escape(p.city)}</p><p>${escape(p.description)}</p><p>Portfólio ilustrativo.</p></article>`).join(''):'';
 const body=`<main><h1>${escape(page.heading)}</h1><p>${escape(page.body)}</p>${detail}<nav><a href="/profissionais">Encontre um profissional</a> <a href="/orcamento">Planeje seu evento</a> <a href="/como-funciona">Como funciona</a> <a href="/sobre">Quem somos</a> <a href="/para-profissionais">Sou profissional</a></nav>${contact}<h2>Gastronomia que conecta pessoas</h2>${cards}</main>`;
 return {html:template.replace(/<title>[\s\S]*?<\/title>/,'').replace(/<meta (?:name="(?:description|twitter:title|twitter:description)"|property="(?:og:title|og:description)")[^>]*>/g,'').replace('</head>',head+'</head>').replace(/<div id="root">[\s\S]*?<\/div>/,`<div id="root">${body}</div>`),status};
}
