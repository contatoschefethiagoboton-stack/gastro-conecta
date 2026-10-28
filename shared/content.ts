// Textos e imagens editáveis pelo painel de administração.
// Cada chave tem um valor padrão; o que o administrador salvar substitui o padrão.
export type ContentFieldType = 'text' | 'textarea' | 'image' | 'url' | 'boolean';
export type ContentField = { key: string; group: string; label: string; type: ContentFieldType; default: string };

export const contentFields: ContentField[] = [
 {
  "key": "contact.whatsapp",
  "group": "Contato e marca",
  "label": "WhatsApp de atendimento (só números, com 55 e DDD)",
  "type": "text",
  "default": "5519993984529"
 },
 {
  "key": "contact.whatsappDisplay",
  "group": "Contato e marca",
  "label": "WhatsApp como aparece no site",
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
  "label": "Mostrar botão flutuante do WhatsApp",
  "type": "boolean",
  "default": "true"
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
  "default": "Encontre chefs, buffets e profissionais que transformam encontros em experiências inesquecíveis."
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
  "default": "Encontre oportunidades para seu negócio ou sua próxima diária. Uma comunidade que valoriza quem faz acontecer."
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
  "default": "Criada por um Chef de Cozinha Profissional, a plataforma foi pensada a partir da realidade do setor. Da organização de um jantar especial à montagem de uma equipe de evento, cada conexão precisa de clareza, respeito e valorização.\n\nAqui, clientes encontram chefs e buffets, fornecedores descobrem oportunidades e freelancers operacionais têm espaço para mostrar seu talento. A tecnologia aproxima. As pessoas fazem acontecer."
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
  "default": "Para chefs, buffets e os profissionais que fazem cada evento acontecer."
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
  "default": "Cadastre seu negócio como profissional parceiro ou seu talento como freelancer. Todos os cadastros passam por validação da administração antes de receber oportunidades."
 },
 {
  "key": "jobs.title",
  "group": "Vagas",
  "label": "Título (Enter quebra linha)",
  "type": "textarea",
  "default": "Sua próxima diária.\nSua próxima conexão."
 },
 {
  "key": "jobs.lead",
  "group": "Vagas",
  "label": "Texto de abertura",
  "type": "textarea",
  "default": "Oportunidades para cozinheiros, ajudantes, garçons e barmans."
 },
 {
  "key": "jobs.notice",
  "group": "Vagas",
  "label": "Aviso sobre pagamento",
  "type": "textarea",
  "default": "A regra é clara: 100% da diária para o freelancer, pago direto pelo contratante via Pix. A comissão de 10% é do contratante, não descontada do seu trabalho."
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
  "default": "## Intermediação e contratação\n\nO GastroConecta conecta clientes, fornecedores e freelancers. O serviço gastronômico é prestado pelo profissional contratado, e as condições devem ser estabelecidas em proposta e contrato. A natureza da relação e suas obrigações precisam ser avaliadas juridicamente; o uso da plataforma não elimina possíveis responsabilidades legais ou trabalhistas.\n\n## Comissões e emissão fiscal\n\nPara eventos, a comissão prevista é de 8% a 12% do valor bruto. Para diárias, a taxa de 10% é acrescida ao custo do contratante e o freelancer recebe o valor integral de referência. A plataforma deve emitir nota apenas de sua intermediação, enquanto o fornecedor é responsável pelo documento fiscal do serviço integral, sujeito à validação contábil e tributária aplicável.\n\n## Propostas, contratos e pagamentos\n\nA aceitação da proposta não confirma cobrança ou depósito. Contratos PDF gerados são minutas que exigem revisão e assinatura das partes. O gateway, o escrow, a biometria, a emissão fiscal e as integrações sociais não estão homologados nesta versão.\n\n## Avaliações e uso responsável\n\nParticipantes devem avaliar trabalhos concluídos com nota de 1 a 5 e feedback respeitoso. Após 24 horas da conclusão, ações transacionais podem ficar restritas até avaliações pendentes, preservando acesso à conta e suporte. Não publique dados pessoais de terceiros ou conteúdos ofensivos.\n\n## Catálogo demonstrativo\n\nPortfólios identificados como ilustrativos, seus nomes, imagens e preços não representam fornecedores contratáveis. Não são avaliações, selos antifraude ou resultados comprovados. Fornecedores reais dependerão de cadastro e liberação."
 },
 {
  "key": "legal.privacy",
  "group": "Textos legais",
  "label": "Segurança e privacidade (## no início da linha = subtítulo)",
  "type": "textarea",
  "default": "## Dados da sua conta\n\nSão utilizados nome, e-mail, cidade e informações fornecidas em perfis, pedidos, propostas, vagas e avaliações. A senha é armazenada em formato derivado criptograficamente, não em texto aberto. Dados privados exigem autenticação e autorização no servidor.\n\n## Cadastro de profissionais e freelancers\n\nProfissionais parceiros informam CNPJ, razão social, nome do responsável, telefone, endereço, redes sociais e fotos do trabalho. Freelancers informam dados pessoais, CPF, endereço, currículo e dados bancários e Pix. Esses dados servem para validar o cadastro e permitir o pagamento direto entre contratante e freelancer. Documentos e dados bancários ficam visíveis apenas para o titular, para a administração e, no caso do Pix e do currículo, para o contratante da vaga à qual o freelancer se candidatou.\n\n## Biometria e identidade\n\nO reconhecimento facial e a detecção de prova de vida não estão ativos. Não coletamos imagens biométricas nesta versão. A futura integração deverá informar finalidade, consentimento, fornecedor, retenção e condições de exclusão antes de qualquer coleta.\n\n## Pagamentos e privacidade financeira\n\nCartões e dados de pagamento não são coletados nesta versão. Split, Pix, parcelamento e retenção em garantia dependem da homologação de um prestador de pagamentos. Não há garantia financeira ativa.\n\n## Direitos e responsabilidades\n\nAntes da operação pública comercial, o responsável pela plataforma precisa disponibilizar sua identificação, canal para solicitações de acesso/correção/exclusão, bases legais, períodos de retenção e gestão de incidentes. A exclusão administrativa atual é lógica, mantendo auditoria e não constituindo eliminação integral LGPD.\n\n## Proteção de acesso\n\nUtilize uma senha única, com pelo menos dez caracteres, letras maiúsculas e minúsculas, números e caracteres especiais. Sessões próprias são limitadas a uma por conta. Suspensão ou bloqueio administrativo restringem ações privadas."
 },
 {
  "key": "seo.homeTitle",
  "group": "SEO (Google)",
  "label": "Título da página inicial no Google",
  "type": "text",
  "default": "GastroConecta | Chefs, buffets e boas conexões"
 },
 {
  "key": "seo.homeDescription",
  "group": "SEO (Google)",
  "label": "Descrição da página inicial no Google",
  "type": "textarea",
  "default": "Encontre chefs particulares, buffets e equipes freelance. Planeje seu evento e conecte-se a quem vive a gastronomia, com clareza em cada etapa."
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
