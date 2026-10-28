# GastroConecta — plano de implementação

## Produto e entrega

Construir um marketplace gastronômico responsivo com página pública, catálogo, perfis de profissionais, orçamento em três passos e painéis distintos de cliente, fornecedor, freelancer e administrador. A versão mobile proposta é um aplicativo web instalável (PWA) com as mesmas funções, não um binário React Native nem publicação em lojas. Essa escolha depende da aprovação do usuário.

A aplicação usa o starter instalado React + TypeScript + Tailwind, Express e tRPC, com banco relacional MySQL gerenciado (em lugar do PostgreSQL recomendado, não exigido). O servidor atende API e frontend na porta 3000; Dockerfile compila o código para publicação. Dados privados são protegidos por sessão validada e verificações de papel/posse no servidor. Catálogo ilustrativo pode ser exibido de forma explícita, sem fingir contas, verificações ou pagamentos reais.

## Módulos

Cadastro com senha forte e sessão, escolha de cliente/fornecedor/freelancer, painel de perfil e autenticação. Administrador restrito ao proprietário autenticado; registro público nunca concede admin. Catálogo com pesquisa, localização, categorias, favoritos e detalhes de portfólio. Solicitação em três etapas cria um evento persistente. Radar calcula score de intenção 0–100: 80–100 alta, 50–79 média, 0–49 pesquisa. Fornecedores enviam propostas, publicam vagas com diária mínima por função, acompanham carteira e planos quinzenal/mensal. Freelancers se candidatam e acompanham trabalhos; comissão de 10% é acrescida ao contratante para preservar diária integral.

Admin: pesquisa/edição/suspensão/bloqueio/exclusão lógica, validações manuais, benefícios VIP/descontos/destaque, cupons/cashback e auditoria exportável. Contratos PDF A, B e C gerados a partir dos dados com indicação de minuta e necessidade de revisão jurídica. Avaliações 360 com notas 1–5 e feedback; checagem por tempo no servidor bloqueia ações transacionais após 24h até avaliação, preservando suporte, conta e direitos de privacidade.

Copilot no chat usa IA no servidor; integrar OpenAI mediante chave própria se requerida, mantendo opção compatível com a IA fornecida pela infraestrutura. Quem Somos destaca a origem por chef profissional sem inventar nome, trajetória ou métricas.

## Integrações e limites de operação real

Mercado Pago/Asaas, reconhecimento facial/liveness, Meta e Google dependem de contas comerciais, credenciais, permissões e homologação. Checkout e estado das integrações devem informar claramente quando não configurados, sem criar Pix fictício, cobrar cartão, prometer escrow ou marcar identidade como verificada. Comissões de eventos configuráveis 8–12%; diárias 10% adicional ao contratante; cálculo em centavos. Emissão fiscal: plataforma somente comissão, fornecedor serviço total; emissão de NF requer integração fiscal homologada e revisão contábil. Contratos, tratamento biométrico LGPD e enquadramento trabalhista precisam de revisão profissional antes da operação. Não coletar biometria sem fornecedor e consentimento estabelecidos.

## Estrutura do projeto

- `client/src/pages`: descoberta, detalhe, orçamento, conta, painéis e institucional.
- `client/src/components`: identidade, navegação, cartões, formulários e Copilot.
- `client/src/lib`: API, formatação e utilidades.
- `server`: regras, routers, autenticação, autorização e integrações.
- `drizzle`: tabelas e migrações versionadas.
- `shared`: tipos, catálogo demonstrativo e regras financeiras compartilhadas.
- `client/public`: rotas, manifesto PWA, ícones e assets.
- `docs`: implantação, integrações pendentes e limites de homologação.

## Direção visual

Alternativas: editorial gastronômico contemporâneo (probabilidade 0,07); modernismo orgânico em oliva e areia (0,04); mercado urbano com tipografia brutalista (0,03). Selecionada: editorial gastronômico contemporâneo.

**Movimento:** editorial italiano contemporâneo, com personalidade acolhedora brasileira. **Princípios:** hierarquia forte, fotografia apetitosa, espaço generoso e transparência funcional. **Cor:** creme quente para acolher, carvão para confiança e laranja-páprica #DF572F como assinatura. **Layout:** hero assimétrico com texto à esquerda e fotografia à direita, busca transversal, trilhas horizontais de categorias e cards de profissionais. Painéis mais densos com navegação lateral e indicadores objetivos.

**Elementos de assinatura:** símbolo de panela com conexões; etiquetas arredondadas discretas; sublinhados orgânicos em títulos. **Interações:** controles claros, filtros imediatos e estados de carregamento/erro honestos. **Animações:** entrada leve de 250ms, hover de 180ms, sem animações que bloqueiem conteúdo, respeitando redução de movimento. **Tipografia:** DM Sans para títulos/ações, Inter para corpo; títulos grandes com peso 600–700 e entrelinha compacta.

**Essência:** conectar quem ama receber a quem vive da gastronomia com relações transparentes. Personalidade: humana, criteriosa, próxima. **Voz:** direta e convidativa, sem exageros. Exemplos: “Seu próximo encontro começa com uma boa conexão.” e “Encontre o profissional certo para a sua mesa.” **Marca:** Gastro em peso forte, Conecta leve, ícone de panela e arco de conexão em páprica.
