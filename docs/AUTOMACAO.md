# Eventos Conecta: SEO local, indexação e automação de crescimento

## 1. Arquitetura (resumo)

| Peça | Onde está | O que faz |
|---|---|---|
| Páginas de SEO | `shared/seo.ts` (regras), `server/publicSeo.ts` (HTML que o Google lê), `client/src/pages/SeoLanding.tsx` (página React) | Endereços locais, títulos, descrições, OpenGraph, canonical, JSON-LD |
| Sitemap e robots | `server/publicSeo.ts` → `/sitemap.xml`, `/robots.txt` | Gerados na hora a partir do catálogo de serviços, das cidades e dos perfis reais |
| Indexação rápida | `server/gastro/indexing.ts` | Google Indexing API + IndexNow, com fila, cota diária e registro |
| Robô das redes | `server/gastro/social.ts` + `shared/socialIntent.ts` | Webhook da Meta (Instagram, Messenger, WhatsApp), intenção, resposta com link |
| Matching | `shared/matching.ts` + `notifyMatchingProviders` em `server/gastro/routes.ts` | Ranqueia profissionais e avisa (painel, e-mail e WhatsApp) |
| Posts automáticos | `server/gastro/socialPosts.ts` | Rascunhos de boas-vindas e depoimentos; publicação no Facebook/Instagram |
| Painel | Administração → **Automação e Google** | Status, envios, simulador do robô, mensagens recebidas e posts |

A stack continua a mesma (Express + React + MySQL). O servidor monta o HTML de cada página pública com o conteúdo, os metadados e o JSON-LD, que é o que o Google indexa. O React assume a página em seguida.

## 2. Endereços (SEO local)

| Página | Exemplo |
|---|---|
| Cidade | `/sp/campinas` |
| Serviço na cidade | `/sp/campinas/personal-chef`, `/sp/campinas/buffet-para-festa`, `/sp/campinas/garcom-para-evento` |
| Profissional na cidade | `/sp/campinas/garcom-freelancer` (nome igual a um serviço ganha `trabalhe-como-`, ex.: `/sp/campinas/trabalhe-como-personal-chef`) |
| Serviço (geral) | `/servicos/personal-chef` |

- **Apelidos com 301:** `/sp/campinas/buffet-eventos` leva a `/sp/campinas/buffet-para-festa`. A lista fica em `SERVICE_ALIASES`, em `shared/seo.ts`.
- **Endereços antigos com 301:** `/servicos/x/campinas-sp` e `/trabalhe-como/x/campinas-sp` levam aos endereços novos.
- **Cidades:** Painel → Textos do site → SEO (Google) → Cidades.
- **Serviços:** são os do painel. Serviços novos ganham páginas automaticamente.

**Em cada página:**
- `<title>`, `description`, `canonical`, OpenGraph (`og:type`, `og:locale`, `og:site_name`, `og:url`, `og:image`) e Twitter;
- `geo.region` e `geo.placename` nas páginas de cidade;
- JSON-LD: `Service` (com `areaServed`), `FAQPage`, `BreadcrumbList`, e `ItemList` de `LocalBusiness` com `AggregateRating` para os profissionais reais da página. A nota só aparece quando há avaliações verdadeiras; portfólios demonstrativos ficam fora.

## 3. Indexação

### IndexNow (Bing, Yandex, Seznam, Naver): grátis, recomendado
1. Invente uma chave de 8 a 128 letras e números (ex.: `a7f3c9e1b2d4f6a8`).
2. No Render, adicione `INDEXNOW_KEY`. O site passa a servir `https://eventosconecta.com.br/<chave>.txt` sozinho.

### Google Indexing API
1. **console.cloud.google.com:** crie um projeto e ative a **Web Search Indexing API**.
2. Em **IAM → Contas de serviço**, crie uma conta e gere uma chave **JSON**.
3. No **Search Console** da propriedade `eventosconecta.com.br`, vá em Configurações → Usuários e permissões e adicione o e-mail da conta de serviço como **Proprietário**.
4. No Render, adicione `GOOGLE_INDEXING_CREDENTIALS` com o conteúdo do JSON (inteiro ou em base64).

> **Importante:** o Google diz oficialmente que essa API é para páginas de vagas (`JobPosting`) e transmissões ao vivo. Para outras páginas, ele aceita o aviso mas não garante a indexação. O caminho principal continua sendo o **sitemap** enviado no Search Console, que é atualizado sozinho. A cota padrão é de 200 avisos por dia; o site respeita e registra.

### Quando o site avisa
- **Avisa a página do perfil + páginas da cidade e dos serviços dele** quando:
  - um profissional é aprovado;
  - ganha período de teste;
  - paga a assinatura.
- **Serviço ou profissão nova no painel:** avisa a página geral e as páginas por cidade (no Google, só as 3 primeiras cidades, por causa da cota).
- **Conta excluída:** pede a remoção do perfil.
- **Envio manual:** Painel → Automação e Google → **Enviar páginas principais** ou **Enviar o site inteiro (IndexNow)**.

## 4. Robô do Instagram, Facebook e WhatsApp

### Como funciona
1. A Meta envia o comentário ou a mensagem para `https://eventosconecta.com.br/api/gastro/webhooks/meta`. O site confere a assinatura `X-Hub-Signature-256`.
2. As regras de `shared/socialIntent.ts` entendem:
   - **serviço** (garçom, barman, chef, buffet, personal chef, limpeza, jardinagem e serviços criados no painel);
   - **cidade** (as cidades do SEO);
   - **data** ("sábado", "amanhã", "dia 12", "12/12");
   - **convidados** ("80 pessoas");
   - se é **cliente** ou **profissional**.

   Se as regras não acharem o serviço e houver IA configurada (`OPENAI_API_KEY`, que pode ser a Groq, grátis), a IA completa.
3. **Cliente** recebe o link do orçamento já preenchido, por exemplo `/orcamento?servico=garcom-para-evento&cidade=Campinas, SP&data=2026-11-07&utm_source=instagram…`. **Profissional** recebe o link da página de cadastro da cidade dele.
4. **Comentários:**
   - o link vai **no privado** e a resposta pública diz "Te mandei o link no direct";
   - se o privado falhar, o link vai na resposta pública.
5. Conversa que não é pedido é **ignorada**. Cada pessoa recebe no máximo 1 resposta a cada 12 horas, e eventos repetidos da Meta não geram resposta dupla.
6. Tudo fica em **Painel → Automação e Google**, com um **simulador** para testar frases sem enviar nada.

### Configuração (Meta for Developers)
1. Crie um app do tipo **Business** em developers.facebook.com.
2. Adicione os produtos **Messenger**, **Instagram** (API com Login do Facebook) e **WhatsApp**.
3. Ligue o Instagram profissional à Página do Facebook (Meta Business Suite → Configurações).
4. Gere um **token permanente de usuário do sistema** (Business Settings → Usuários do sistema) com as permissões:
   - `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`, `pages_manage_engagement`, `pages_manage_posts`;
   - `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, `instagram_content_publish`.
5. Em **Webhooks**, cadastre:
   - **URL de callback:** `https://eventosconecta.com.br/api/gastro/webhooks/meta`
   - **Token de verificação:** o mesmo valor de `META_VERIFY_TOKEN`
   - **Assinaturas:**
     - Página: `messages`, `feed`
     - Instagram: `messages`, `comments`
     - WhatsApp: `messages`
6. No Render, adicione:
   - `META_APP_SECRET`
   - `META_VERIFY_TOKEN`
   - `META_PAGE_ACCESS_TOKEN`
   - `META_PAGE_ID`
   - `META_IG_USER_ID`

   O WhatsApp usa o token e o número já configurados em Painel → Notificações.
7. Para responder a qualquer pessoa (não só aos testadores do app), o app precisa passar pela **Revisão do App** da Meta com essas permissões.

**Regras da Meta:**
- **Mensagens privadas e WhatsApp:** só podem ser respondidos em até **24 horas** depois da última mensagem da pessoa. O robô responde na hora, então está dentro do prazo.
- **Comentários:** a resposta privada a um comentário vale **uma vez** por comentário, em até 7 dias.

## 5. Matching e WhatsApp

Quando um cliente publica um pedido, o site ranqueia os profissionais compatíveis em `shared/matching.ts`:

| Critério | Pontos |
|---|---|
| Profissão exata / mesma categoria / compatível | 40 / 30 / 20 |
| Mesma cidade / mesma região (cidades do SEO) | 35 / 15 |
| Nota média (até 5 × 4) | até 20 |
| Selo Top Rated / destaque | 10 / 5 |
| Propostas nos últimos 30 dias | até 10 |
| **Já tem serviço fechado na mesma data** | **fica de fora** |

- **Quem é avisado:** os 30 primeiros (`MATCH_NOTIFY_LIMIT`).
- **Por onde:** todos recebem o aviso no painel e por e-mail; os 10 primeiros (`MATCH_WHATSAPP_LIMIT`) também recebem o **WhatsApp** pelo modelo aprovado.
- **Histórico:** cada rodada fica registrada como `event.matched`, com os 5 primeiros e o motivo de cada um.

## 6. Posts automáticos

- **A cada 6 horas**, o site gera rascunhos de:
  - **boas-vindas** aos profissionais que entraram nos últimos 30 dias;
  - **depoimentos** com nota 4 ou mais e comentário, mostrando só o primeiro nome de quem avaliou.

  Cada rascunho leva a foto do profissional, o link rastreado (`utm_campaign`) e hashtags da cidade e dos serviços.
- **No painel**, você edita a legenda, publica com um clique ou descarta.
- **"Publicar automaticamente":** publica até **2 posts por dia**, começando pelos mais antigos.
- **Onde publica:** no Facebook, na Página com foto; no Instagram, só quando a foto é **JPEG**, que é uma exigência da API do Instagram.

## 7. Variáveis de ambiente (Render → Environment)

| Variável | Obrigatória para | Exemplo |
|---|---|---|
| `GASTRO_PUBLIC_ORIGIN` | links absolutos, canonical, redirecionamento 301 | `https://eventosconecta.com.br` |
| `INDEXNOW_KEY` | IndexNow | `a7f3c9e1b2d4f6a8` |
| `GOOGLE_INDEXING_CREDENTIALS` | Google Indexing API | JSON da conta de serviço |
| `META_APP_SECRET`, `META_VERIFY_TOKEN` | webhook da Meta | do app / texto inventado |
| `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID` | respostas e posts no Facebook/Instagram | token permanente / ID da página |
| `META_IG_USER_ID` | posts no Instagram | ID da conta profissional |
| `OPENAI_API_KEY` (+ `OPENAI_API_BASE`, `COPILOT_MODEL`) | IA opcional (pode ser Groq grátis) | `gsk_...` |
| `MATCH_NOTIFY_LIMIT`, `MATCH_WHATSAPP_LIMIT` | ajuste do matching | `30`, `10` |

Sem essas variáveis, cada parte só fica desligada: o restante do site funciona normalmente.

## Copilot vendedor (tempo integral)

O Copilot trabalha para fechar negócios. Em cada conversa ele tem um objetivo, calculado pela situação real da pessoa (`shared/copilotGoals.ts`):

| Quem | Objetivo | Próximo passo |
|---|---|---|
| Visitante sem conta | descobrir se quer contratar ou trabalhar | `/orcamento` já preenchido (serviço, cidade, data) ou `/conta?cadastro=profissional` |
| Cliente sem pedido | publicar o pedido | `/orcamento` |
| Cliente com propostas | escolher e aceitar (contrato em PDF) | `/painel?aba=requests` |
| Profissional com perfil incompleto | completar o perfil | `/painel?aba=profile` |
| Profissional sem assinatura | ativar a assinatura (mostra quantos pedidos já esperam) | `/painel?aba=subscription` |
| Profissional ativo | responder os pedidos do radar / reforçar propostas | `/painel?aba=radar` |

- **Balão proativo:** depois de 6 s o Copilot puxa a conversa com o próximo passo (uma vez por situação, por sessão). Desliga em *Textos do site → Contato e marca → "Copilot puxa conversa sozinho"*.
- **Funciona sem IA:** sem chave configurada (ou se a IA falhar), ele responde por regras e continua levando ao próximo passo. Com IA (ex.: Groq grátis), as respostas ficam mais naturais e usam a mesma meta.
- **Visitantes:** conversam sem conta; o histórico fica só no navegador (nada é gravado), com limite de 60 mensagens por dia por IP.
- Quem vê o Copilot continua sendo escolhido em *"Quem vê o Copilot"*.
