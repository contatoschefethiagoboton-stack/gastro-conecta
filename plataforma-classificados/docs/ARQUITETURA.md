# Arquitetura técnica

## 1. Visão geral

```
                    ┌──────────────── CDN (mídia pública aprovada) ◀────────────┐
                    │                                                           │
 Cliente (sem login)│      ┌───────────────┐   REST/JSON   ┌────────────────┐   │ cópia após
 Anunciante ────────┼────▶ │  web (Next.js) │ ────────────▶ │  api (Fastify) │───┤ aprovação
 Gestor             │      │  SSR + React   │               │  N instâncias  │   │
                    │      └───────────────┘               └──┬───┬───┬─────┘   │
                    │                                         │   │   │         │
                    │    upload direto (POST pré-assinado)    │   │   │   ┌─────┴──────────┐
                    └────────────────────────────────────────────────────▶│ bucket PRIVADO │
                                                              │   │   │   │ (quarentena,   │
                         ┌──────────────────┐                 │   │   │   │  KYC, PPV)     │
                         │ PostgreSQL+PostGIS│◀────────────────┘   │   │   └─────▲──────────┘
                         └────────▲─────────┘                     │   │         │
                                  │            ┌──────────┐       │   │         │
                                  └────────────│  worker  │◀──────┘   │         │
                                               │ (BullMQ) │───────────┼─────────┘
                         ┌──────────┐          └────┬─────┘           │
                         │  Redis   │◀──────────────┴─────────────────┘
                         └──────────┘   cache de busca · rate limit · filas · sessões PPV
   Externos: provedor KYC · scanner CSAM · gateway/PSP (webhooks → /webhooks/payments)
```

- **API sem estado** → escala horizontal (Render: 2 a 6 instâncias por CPU).
- **Worker separado** → tarefas lentas (KYC, varredura de mídia, cobrança) não travam requisições.
- **Arquivos nunca passam pela API no upload**: o navegador envia direto ao bucket privado com
  política pré-assinada (tamanho máximo e tipo MIME forçados pelo storage).

## 2. Modelo de dados (resumo de `001_init.sql`)

| Tabela | Conteúdo | Observações de segurança |
|---|---|---|
| `users` | login, papel, status | argon2id; sem PII além do e-mail |
| `advertiser_private_data` | nome, CPF, RG, telefone, CEP, endereço | **AES-256-GCM** por campo com AAD = `user_id`; `cpf_hash`/`phone_hash` (HMAC) para unicidade e antifraude |
| `profiles` | nome artístico, slug, verificado | `birth_date` interna; público vê só a idade |
| `identity_verifications` | documento, selfie, vídeo, scores | arquivos só no bucket privado; código-desafio anti-reuso |
| `advertisements` | anúncio, filtros (arrays de ENUM), contatos, região | `location` arredondada (~1 km); índices GiST/GIN; `tsvector` sem acentos |
| `ad_prices`, `ad_media` | preços, fotos/vídeos | mídia com SHA-256 + dHash + status de varredura |
| `plans`, `discounts`, `subscriptions`, `payments`, `webhook_events` | cobrança | 1 assinatura viva por anunciante (índice único parcial); webhooks idempotentes |
| `ppv_items`, `ppv_purchases`, `ppv_access_logs` | pay-per-view | e-mail do comprador cifrado; consumo atômico de visualizações |
| `admin_logs` | auditoria | **somente-inserção** + cadeia de hash SHA-256 (`admin_logs_verify()`) |
| `legal_requests`, `private_data_access_logs` | autoridades | quatro olhos (CHECK no banco); todo acesso a PII registrado |
| `reports`, `fraud_flags`, `auth_events` | denúncias, alertas, acessos | `auth_events` atende à guarda de 6 meses do Marco Civil |

## 3. Fluxos críticos

### 3.1 Verificação de identidade (+18)
1. `POST /me/verification/start` → gera **código-desafio** (`LUA-4821-2026-11-01`) e URLs de upload.
2. Navegador envia documento (frente/verso), selfie e vídeo ao bucket privado.
3. `POST /me/verification/submit` → valida que as chaves pertencem ao usuário → fila `kyc`.
4. Worker chama o provedor (face match, liveness, OCR, autenticidade, detecção do código).
5. Regras: **menor de idade = rejeição imediata + suspensão + alerta crítico**; CPF do documento ≠ CPF
   cadastrado = alerta; demais casos vão para **revisão humana obrigatória**.
6. Moderador aprova → perfil verificado, data de nascimento do documento passa a valer,
   vídeo publicado no anúncio.

### 3.2 Assinatura recorrente
```
POST /me/subscription ──▶ assinatura "incomplete" ──▶ gateway.createSubscription()
         │                                               │ PIX Automático: QR (autoriza + 1º ciclo)
         │                                               │ Cartão: token do navegador + 3-D Secure
         ▼                                               ▼ Débito: autorização bancária
 webhook payment.paid ──▶ active, período += 15/30 dias, anúncios visíveis até o fim do período
 webhook payment.failed ─▶ past_due (anúncio continua no ar durante a carência)
 worker a cada 10 min ───▶ expira degustações/inadimplentes e pausa anúncios (paused_billing)
```
- Webhook: assinatura HMAC sobre o corpo bruto → `webhook_events` (único por `event_id`) → processamento
  em transação. Falha retorna 500 para o PSP reenviar; sucesso repetido retorna `duplicate`.
- Cartão nunca toca o servidor (tokenização no navegador → PCI-DSS SAQ-A).

### 3.3 Pay-per-View
1. `POST /ppv/checkout` (e-mail + declaração +18) → cobrança PIX/cartão.
2. Webhook pago → acesso válido por N dias; link enviado por e-mail.
3. Token de acesso = `purchaseId.HMAC` (não armazenado, não falsificável).
4. `POST /ppv/access/:token/open` → **UPDATE atômico** consome 1 visualização e cria sessão no Redis
   com TTL = janela de visualização.
5. `GET /ppv/stream/:session` → foto entregue **uma vez**, com marca d'água forense do comprador;
   vídeo via proxy com Range que revalida a sessão a cada requisição. Tudo com `no-store`.
6. No navegador: Blob em memória, revogado ao fim do cronômetro; sem download/menu/PiP; desfoque ao
   perder o foco.

**Limite técnico honesto:** nenhuma tecnologia web impede captura de tela ou filmagem da tela com outro
aparelho, nem apaga arquivos do dispositivo do comprador por conta própria. O que se garante é que o
servidor nunca mais entrega o conteúdo e que um vazamento é **rastreável** pela marca d'água. Para vídeo
em escala, evolua para HLS cifrado com DRM (Widevine/FairPlay) e marca d'água forense invisível.

### 3.4 Busca geolocalizada
- `ST_DWithin(location, ponto, raio_m)` usa o índice GiST parcial (só anúncios ativos).
- Filtros de lista: `&&` (qualquer um: tipos de massagem, local, pagamento) e `@>` (todos: serviços,
  estrutura, público) — índices GIN.
- Faixa etária em forma indexável (`birth_date` entre datas).
- Paginação por cursor `(distância, id)` → custo constante em qualquer página.
- Cache Redis de 30 s por combinação de filtros + `Cache-Control` para a CDN.
- Busca textual em português **sem acentos** (`pt_unaccent`).

### 3.5 Painel administrativo
- Métricas: `GET /admin/metrics` (snapshot + série diária) e `GET /admin/metrics/stream` (SSE a cada 10 s).
- Moderação: filas de verificações, anúncios, mídias, PPV e denúncias (denúncias graves primeiro).
- Ofertas: degustação manual (padrão 10 dias), desconto por N ciclos ou permanente, cupons, troca de plano.
- Antifraude: telefone pessoal repetido, mesma mídia em contas diferentes (SHA-256 e dHash), muitas contas
  por IP, chargebacks, alertas automáticos (menor de idade, CSAM, CPF divergente).
- Auditoria: todas as ações em `admin_logs` encadeado; `GET /admin/logs/verify` detecta adulteração.

## 4. Mapa de endpoints

| Público (sem login) | Anunciante (JWT) | Gestor (moderator/admin) |
|---|---|---|
| `GET /taxonomy` | `POST /auth/register`, `/auth/login`, `GET /me` | `GET /admin/metrics`, `/admin/metrics/stream` |
| `GET /search` | `POST /me/verification/start`, `/submit` | `GET /admin/queue/:tipo` |
| `GET /ads/:slug` | `POST/PUT /me/ads`, `/submit`, `/pause` | `POST /admin/verifications/:id/decision` |
| `POST /ads/:id/report` | `POST /me/ads/:id/media`, `/me/media/:id/complete` | `POST /admin/ads/:id/status`, `PATCH /admin/ads/:id` |
| `GET /ads/:id/ppv` | `GET/POST /me/subscription`, `/cancel` | `POST /admin/media/:id/decision`, `DELETE /admin/media/:id` |
| `POST /ppv/checkout` | `POST /me/ppv/upload`, `/me/ppv/items` | `POST /admin/users/:id/trial`, `/status` |
| `GET /ppv/purchases/:id/status` | `GET /me/ppv/sales` | `POST /admin/subscriptions/:id/discount`, `/plan`, `/admin/coupons` |
| `POST /ppv/access/:token/open` | | `GET /admin/fraud/signals`, `/admin/users?q=` |
| `GET /ppv/stream/:session` | | `GET /admin/logs`, `/admin/logs/verify` |
| `POST /webhooks/payments` (HMAC) | | `POST /admin/legal-requests` (+ `/review`, `/export`) |

## 5. Escala

| Volume | Ajuste |
|---|---|
| até ~50 mil anúncios | configuração do `render.yaml` |
| tráfego alto de leitura | CDN (Cloudflare/Bunny) na frente do web e da API pública; réplica de leitura do Postgres para `/search` |
| mídia | transcodificação de vídeo (ffmpeg no worker ou serviço dedicado), imagens em AVIF/WebP |
| busca | particionar por país/estado ou mover a busca para OpenSearch se surgirem filtros facetados complexos |
| internacional | `country` já no anúncio; i18n no Next.js; moedas em `plans.currency`/`ad_prices.currency` |
