// Textos e imagens editáveis pelo painel de administração.
// Cada chave tem um valor padrão; o que o administrador salvar substitui o padrão.
export type ContentFieldType = 'text' | 'textarea' | 'image' | 'url' | 'boolean' | 'services' | 'demos';
/** hidden: chave aceita e salva, mas sem campo próprio no painel (ex.: capas antigas, hoje dentro do catálogo de serviços). */
export type ContentField = { key: string; group: string; label: string; type: ContentFieldType; default: string; hidden?: boolean };

export const contentFields: ContentField[] = [
 {
  "key": "contact.whatsapp",
  "group": "Contato e marca",
  "label": "WhatsApp da administração — Fale Conosco (só números, com 55 e DDD)",
  "type": "text",
  "default": "5519993984529"
 },
 {
  "key": "contact.whatsappDisplay",
  "group": "Contato e marca",
  "label": "WhatsApp da administração como aparece no site",
  "type": "text",
  "default": "(19) 99398-4529"
 },
 {
  "key": "contact.email",
  "group": "Contato e marca",
  "label": "E-mail de contato",
  "type": "text",
  "default": "thiagoboton22@gmail.com"
 },
 {
  "key": "contact.region",
  "group": "Contato e marca",
  "label": "Região de atendimento",
  "type": "text",
  "default": "Campinas e região"
 },
 {
  "key": "contact.instagram",
  "group": "Contato e marca",
  "label": "Instagram da plataforma (link, opcional)",
  "type": "url",
  "default": ""
 },
 {
  "key": "contact.facebook",
  "group": "Contato e marca",
  "label": "Facebook da plataforma (link, opcional)",
  "type": "url",
  "default": ""
 },
 {
  "key": "brand.company",
  "group": "Contato e marca",
  "label": "Nome no rodapé (razão social ou marca)",
  "type": "text",
  "default": "GastroConecta"
 },
 {
  "key": "whatsapp.enabled",
  "group": "Contato e marca",
  "label": "Mostrar botão flutuante “Fale Conosco”",
  "type": "boolean",
  "default": "true"
 },
 {
  "key": "growth.googleReviewUrl",
  "group": "Contato e marca",
  "label": "Link para avaliar a GastroConecta no Google (exibido após cada avaliação)",
  "type": "url",
  "default": ""
 },
 {
  "key": "home.eyebrow",
  "group": "Página inicial",
  "label": "Chamada acima do título",
  "type": "text",
  "default": "GASTRONOMIA QUE CONECTA"
 },
 {
  "key": "home.title",
  "group": "Página inicial",
  "label": "Título principal (use Enter para quebrar linha)",
  "type": "textarea",
  "default": "O ingrediente\ncerto para seus"
 },
 {
  "key": "home.titleHighlight",
  "group": "Página inicial",
  "label": "Final do título em destaque (laranja)",
  "type": "text",
  "default": "melhores momentos."
 },
 {
  "key": "home.subtitle",
  "group": "Página inicial",
  "label": "Texto abaixo do título",
  "type": "textarea",
  "default": "Encontre chefs, personal chefs, garçons, barmans, limpeza e jardinagem na sua região. Para clientes, é 100% grátis."
 },
 {
  "key": "home.ctaPrimary",
  "group": "Página inicial",
  "label": "Botão principal",
  "type": "text",
  "default": "Planeje seu evento"
 },
 {
  "key": "home.heroImage",
  "group": "Página inicial",
  "label": "Foto principal",
  "type": "image",
  "default": "/img/hero.svg"
 },
 {
  "key": "home.heroTag",
  "group": "Página inicial",
  "label": "Etiqueta sobre a foto",
  "type": "text",
  "default": "DA COZINHA PARA A SUA MESA"
 },
 {
  "key": "home.floatingTitle",
  "group": "Página inicial",
  "label": "Cartão sobre a foto — título",
  "type": "text",
  "default": "Mais que um serviço."
 },
 {
  "key": "home.floatingText",
  "group": "Página inicial",
  "label": "Cartão sobre a foto — texto",
  "type": "text",
  "default": "Uma experiência feita para você."
 },
 {
  "key": "home.note",
  "group": "Página inicial",
  "label": "Assinatura abaixo dos botões (Enter quebra linha)",
  "type": "textarea",
  "default": "Feito por quem vive a gastronomia.\nPensado para quem ama receber."
 },
 {
  "key": "home.searchCity",
  "group": "Página inicial",
  "label": "Cidade sugerida na busca",
  "type": "text",
  "default": "Campinas"
 },
 {
  "key": "home.promoTitle",
  "group": "Página inicial",
  "label": "Título da seção de promoções",
  "type": "text",
  "default": "Datas que pedem uma boa mesa."
 },
 {
  "key": "home.promoText",
  "group": "Página inicial",
  "label": "Texto ao lado do título de promoções",
  "type": "text",
  "default": "Agenda limitada nas datas mais procuradas."
 },
 {
  "key": "home.categoriesTitle",
  "group": "Página inicial",
  "label": "Título das categorias",
  "type": "text",
  "default": "Seu momento, do seu jeito."
 },
 {
  "key": "home.professionalsTitle",
  "group": "Página inicial",
  "label": "Título dos profissionais",
  "type": "text",
  "default": "Talento que dá gosto conhecer."
 },
 {
  "key": "home.howTitle",
  "group": "Página inicial",
  "label": "Título do 'como funciona' (Enter quebra linha)",
  "type": "textarea",
  "default": "Da ideia à mesa,\na gente conecta."
 },
 {
  "key": "home.howText",
  "group": "Página inicial",
  "label": "Texto do 'como funciona' (Enter quebra linha)",
  "type": "textarea",
  "default": "Você cuida da ocasião.\nNós aproximamos você dos talentos."
 },
 {
  "key": "home.bannerTitle",
  "group": "Página inicial",
  "label": "Faixa para profissionais — título (Enter quebra linha)",
  "type": "textarea",
  "default": "Você vive a gastronomia.\nA gente abre novas portas."
 },
 {
  "key": "home.bannerText",
  "group": "Página inicial",
  "label": "Faixa para profissionais — texto",
  "type": "textarea",
  "default": "Receba pedidos da sua região, use o Copilot para calcular ingredientes, equipe e custos e fique com 100% do valor negociado. Sem comissão: só uma assinatura mensal fixa."
 },
 {
  "key": "about.eyebrow",
  "group": "Quem somos",
  "label": "Chamada",
  "type": "text",
  "default": "DE CHEF PARA O MERCADO"
 },
 {
  "key": "about.title",
  "group": "Quem somos",
  "label": "Título (Enter quebra linha)",
  "type": "textarea",
  "default": "Quem vive a cozinha\nsabe o valor de uma"
 },
 {
  "key": "about.titleHighlight",
  "group": "Quem somos",
  "label": "Final do título em destaque",
  "type": "text",
  "default": "boa conexão."
 },
 {
  "key": "about.lead",
  "group": "Quem somos",
  "label": "Primeiro parágrafo (destaque)",
  "type": "textarea",
  "default": "O GastroConecta nasceu de uma ideia simples: aproximar quem ama receber de quem faz da gastronomia a sua profissão."
 },
 {
  "key": "about.body",
  "group": "Quem somos",
  "label": "Demais parágrafos (linha em branco separa parágrafos)",
  "type": "textarea",
  "default": "Criada por um Chef de Cozinha Profissional, a plataforma foi pensada a partir da realidade do setor. Do jantar especial às marmitas da semana, da equipe de salão à limpeza pós-evento, cada conexão precisa de clareza, respeito e valorização.\n\nAqui, clientes encontram profissionais de confiança sem pagar nada, e profissionais recebem 100% do valor do seu trabalho. A tecnologia aproxima. As pessoas fazem acontecer."
 },
 {
  "key": "about.image",
  "group": "Quem somos",
  "label": "Foto da página",
  "type": "image",
  "default": "/img/hero.svg"
 },
 {
  "key": "how.title",
  "group": "Como funciona",
  "label": "Título (Enter quebra linha)",
  "type": "textarea",
  "default": "Uma boa experiência\ncomeça com clareza."
 },
 {
  "key": "how.lead",
  "group": "Como funciona",
  "label": "Texto de abertura",
  "type": "textarea",
  "default": "Cada etapa em um só lugar. Você decide, os profissionais propõem."
 },
 {
  "key": "pros.title",
  "group": "Para profissionais",
  "label": "Título (Enter quebra linha)",
  "type": "textarea",
  "default": "Novas oportunidades.\nO mesmo amor"
 },
 {
  "key": "pros.titleHighlight",
  "group": "Para profissionais",
  "label": "Final do título em destaque",
  "type": "text",
  "default": "pela gastronomia."
 },
 {
  "key": "pros.lead",
  "group": "Para profissionais",
  "label": "Texto de abertura",
  "type": "textarea",
  "default": "Para chefs, personal chefs, cozinheiros, auxiliares, barmans, garçons, equipes de limpeza e jardineiros."
 },
 {
  "key": "pros.joinTitle",
  "group": "Para profissionais",
  "label": "Chamada para cadastro — título",
  "type": "text",
  "default": "Faça parte desde o começo."
 },
 {
  "key": "pros.joinText",
  "group": "Para profissionais",
  "label": "Chamada para cadastro — texto",
  "type": "textarea",
  "default": "Cadastre-se como profissional com CPF ou CNPJ (MEI ou Limitada). Todo cadastro passa pela validação da administração; depois, ative a assinatura mensal via Pix para aparecer no catálogo e enviar propostas."
 },
 {
  "key": "footer.tagline",
  "group": "Rodapé",
  "label": "Frase do rodapé (Enter quebra linha)",
  "type": "textarea",
  "default": "Boas conexões.\nExperiências à altura da sua mesa."
 },
 {
  "key": "footer.caption",
  "group": "Rodapé",
  "label": "Assinatura do rodapé",
  "type": "text",
  "default": "Criado por quem vive a gastronomia."
 },
 {
  "key": "catalog.showDemo",
  "group": "Catálogo",
  "label": "Mostrar portfólios demonstrativos (desligue quando tiver parceiros reais)",
  "type": "boolean",
  "default": "true"
 },
 {
  "key": "legal.terms",
  "group": "Textos legais",
  "label": "Termos da plataforma (## no início da linha = subtítulo)",
  "type": "textarea",
  "default": "## Intermediação e contratação\n\nO GastroConecta conecta clientes e profissionais (chefs, personal chefs, cozinheiros, auxiliares, barmans, garçons, limpeza e jardinagem). O serviço é prestado pelo profissional contratado, nas condições da proposta aceita e do contrato gerado pela plataforma. A GastroConecta não é parte do contrato entre cliente e profissional.\n\n## Planos e cobrança\n\nClientes não pagam nada. Profissionais pagam uma assinatura mensal fixa, cobrada via Pix pelo Mercado Pago, e recebem 100% do valor negociado com o cliente, sem comissão. A renovação automática é tentada 5 dias antes do vencimento; se falhar, o Pix manual fica disponível no painel. Sem pagamento até o vencimento, o perfil fica oculto do catálogo e o envio de propostas é bloqueado até a renovação.\n\n## Propostas, contratos e pagamentos\n\nAo aceitar uma proposta, o cliente recebe o WhatsApp do profissional e o contrato em PDF é gerado com os dados das duas partes, o escopo (só mão de obra ou serviço completo), data, horário, local, valor e condições de pagamento. O pagamento do serviço é feito diretamente ao profissional.\n\n## Avaliações e uso responsável\n\nDepois de cada serviço concluído, cliente e profissional avaliam um ao outro (nota de 1 a 5 e comentário). Se a avaliação ficar pendente por mais de 24 horas, novos pedidos, propostas e aceites ficam bloqueados até que ela seja feita. Não publique dados pessoais de terceiros ou conteúdos ofensivos.\n\n## Catálogo demonstrativo\n\nPortfólios identificados como ilustrativos, seus nomes, imagens e preços não representam profissionais contratáveis."
 },
 {
  "key": "legal.privacy",
  "group": "Textos legais",
  "label": "Segurança e privacidade (## no início da linha = subtítulo)",
  "type": "textarea",
  "default": "## Dados da sua conta\n\nSão utilizados nome, e-mail, cidade e informações fornecidas em perfis, pedidos, propostas e avaliações. A senha é armazenada em formato derivado criptograficamente, não em texto aberto. Você pode trocar a senha a qualquer momento no painel ou pedir um link em “Esqueci minha senha”.\n\n## Cadastro de profissionais\n\nProfissionais informam CPF ou CNPJ, nome ou razão social, telefone, endereço, logo, fotos de trabalhos, foto do rosto e dados bancários/Pix. O catálogo mostra apenas nome comercial, cidade, serviços, fotos de trabalhos e avaliações. Documento, endereço, rosto e banco/Pix são vistos apenas pelo titular, pela administração e, no contrato, pelo cliente que aceitou a proposta.\n\n## Dados do cliente para o contrato\n\nPara aceitar uma proposta, o cliente informa nome completo, CPF, endereço, telefone e foto do rosto. Esses dados entram no contrato em PDF e ficam visíveis ao profissional contratado e à administração.\n\n## Foto do rosto (antifraude)\n\nA foto do rosto serve para a administração conferir a identidade de quem usa a plataforma. É um arquivo privado, não aparece no site e não é usada para reconhecimento facial automático.\n\n## Pagamentos\n\nAs assinaturas dos profissionais são processadas pelo Mercado Pago; a GastroConecta não armazena dados de cartão. Os pagamentos dos serviços são feitos diretamente entre cliente e profissional.\n\n## Direitos e responsabilidades\n\nSolicitações de acesso, correção ou exclusão de dados podem ser feitas pelo Fale Conosco. A exclusão administrativa é lógica, mantendo registros de auditoria e contratos exigidos por lei."
 },
 {
  "key": "seo.homeTitle",
  "group": "SEO (Google)",
  "label": "Título da página inicial no Google",
  "type": "text",
  "default": "GastroConecta | Chefs e profissionais para o seu evento"
 },
 {
  "key": "seo.homeDescription",
  "group": "SEO (Google)",
  "label": "Descrição da página inicial no Google",
  "type": "textarea",
  "default": "Encontre chefs, personal chefs, garçons, barmans, limpeza e jardinagem na sua região. Cadastro gratuito para clientes e propostas personalizadas."
 },
 {
  "key": "services.catalog",
  "group": "Serviços e capas",
  "label": "Serviços oferecidos (cards da página inicial, cadastro do profissional e pedidos de orçamento)",
  "type": "services",
  "default": ""
 },
 {
  "key": "cover.cat.Gastronomia",
  "group": "Serviços e capas",
  "label": "Capa do card “Chefs e cozinha”",
  "type": "image",
  "default": "",
  "hidden": true
 },
 {
  "key": "cover.cat.personal",
  "group": "Serviços e capas",
  "label": "Capa do card “Personal chef”",
  "type": "image",
  "default": "",
  "hidden": true
 },
 {
  "key": "cover.cat.Bar & salão",
  "group": "Serviços e capas",
  "label": "Capa do card “Bar & salão”",
  "type": "image",
  "default": "",
  "hidden": true
 },
 {
  "key": "cover.cat.Limpeza",
  "group": "Serviços e capas",
  "label": "Capa do card “Limpeza”",
  "type": "image",
  "default": "",
  "hidden": true
 },
 {
  "key": "cover.cat.Jardinagem",
  "group": "Serviços e capas",
  "label": "Capa do card “Jardinagem”",
  "type": "image",
  "default": "",
  "hidden": true
 },
 {
  "key": "catalog.demos",
  "group": "Serviços e capas",
  "label": "Portfólios demonstrativos (exemplos ilustrativos na página inicial e no catálogo)",
  "type": "demos",
  "default": ""
 },
 {
  "key": "cover.demo.demo-chef",
  "group": "Serviços e capas",
  "label": "Capa do portfólio demonstrativo “Ateliê da Mesa”",
  "type": "image",
  "default": "",
  "hidden": true
 },
 {
  "key": "cover.demo.demo-buffet",
  "group": "Serviços e capas",
  "label": "Capa do portfólio demonstrativo “Essência Buffet”",
  "type": "image",
  "default": "",
  "hidden": true
 },
 {
  "key": "cover.demo.demo-brasa",
  "group": "Serviços e capas",
  "label": "Capa do portfólio demonstrativo “Casa & Brasa”",
  "type": "image",
  "default": "",
  "hidden": true
 }
];

export type SiteContent = Record<string, string>;

export const contentDefaults: SiteContent = Object.fromEntries(contentFields.map(field => [field.key, field.default]));
export const contentKeys = new Set(contentFields.map(field => field.key));
export const contentGroups = [...new Set(contentFields.map(field => field.group))];

export const MAX_CONTENT_LENGTH = 20000;

/** Junta valores salvos com os padrões, ignorando chaves desconhecidas. */
export function mergeContent(saved: Record<string, unknown>): SiteContent {
  const result: SiteContent = { ...contentDefaults };
  for (const [key, value] of Object.entries(saved)) if (contentKeys.has(key) && typeof value === 'string') result[key] = value;
  return result;
}

/** Divide texto em blocos: linhas com "## " viram subtítulos, linhas em branco separam parágrafos. */
export function textBlocks(text: string): Array<{ kind: 'h2' | 'p'; text: string }> {
  return String(text ?? '').split(/\n{2,}/).map(block => block.trim()).filter(Boolean).flatMap(block => {
    const lines = block.split('\n');
    const items: Array<{ kind: 'h2' | 'p'; text: string }> = [];
    let buffer: string[] = [];
    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (buffer.length) { items.push({ kind: 'p', text: buffer.join(' ') }); buffer = []; }
        items.push({ kind: 'h2', text: line.slice(3).trim() });
      } else buffer.push(line.trim());
    }
    if (buffer.length) items.push({ kind: 'p', text: buffer.join(' ') });
    return items;
  });
}
