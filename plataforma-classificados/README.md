# Belíssima VIP — plataforma de classificados adultos (+18)

Código-base de uma plataforma de classificados de **acompanhantes e massagistas** com:

- navegação 100% livre para clientes (sem cadastro), com aviso de conteúdo adulto;
- área do anunciante com cadastro sigiloso (nome, CPF, RG, telefone, CEP, endereço — **cifrados**);
- verificação de identidade +18 (documento × selfie × vídeo com código-desafio) e vídeo de verificação público;
- assinaturas quinzenais/mensais com PIX Automático, cartão recorrente e débito em conta;
- Pay-per-View com visualização única/tempo limitado e marca d'água forense;
- painel do gestor com métricas ao vivo, moderação, degustação, descontos, antifraude, auditoria e atendimento a autoridades;
- busca com filtros avançados e geolocalização por raio (PostGIS) com mapa interativo.

> ⚠️ Leia **[docs/COMPLIANCE.md](docs/COMPLIANCE.md)** antes de colocar no ar. Há riscos jurídicos e
> comerciais (gateways de pagamento, hospedagem, Código Penal) que precisam de validação com advogado.

## Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| API | Node.js 20 + TypeScript + **Fastify** + Zod | rápido, tipado, validação em toda entrada |
| Banco | **PostgreSQL 16 + PostGIS** | busca por raio com índice GiST, arrays com GIN, transações, JSONB |
| Cache/filas | **Redis** + BullMQ | cache de busca, rate limit distribuído, jobs (KYC, mídia, cobrança) |
| Front-end | **Next.js 14** (App Router) + React + Leaflet + Recharts | SSR das páginas de anúncio (SEO), mapa, gráficos |
| Mídia | S3 compatível (2 buckets) + CDN | upload direto do navegador, quarentena privada, CDN para aprovados |
| Deploy | **Docker** + **Render Blueprint** (`render.yaml`) + GitHub Actions | deploy contínuo a cada push |

Detalhes e diagramas em **[docs/ARQUITETURA.md](docs/ARQUITETURA.md)**.

## Estrutura de pastas

```
plataforma-classificados/
├── render.yaml                    # Blueprint do Render (API, worker, web, Postgres, Redis)
├── docker-compose.yml             # ambiente local completo (PostGIS, Redis, MinIO)
├── .env.example                   # todas as variáveis, comentadas
├── .github/workflows/ci.yml       # typecheck + testes + migração + build
├── docs/
│   ├── ARQUITETURA.md
│   └── COMPLIANCE.md
└── apps/
    ├── api/                       # API REST + worker (mesma imagem Docker)
    │   ├── Dockerfile
    │   ├── db/migrations/001_init.sql   # ESQUEMA COMPLETO
    │   ├── scripts/smoke-test.sh        # teste ponta a ponta via HTTP
    │   ├── test/unit.test.ts
    │   └── src/
    │       ├── server.ts          # bootstrap HTTP
    │       ├── worker.ts          # filas: kyc, media, billing, notifications
    │       ├── config/env.ts      # variáveis validadas com Zod
    │       ├── db/                # pool, transações, executor de migrações
    │       ├── lib/               # crypto (AES-GCM + blind index), storage S3, filas, auditoria
    │       ├── plugins/auth.ts    # JWT + papéis (advertiser/moderator/admin)
    │       ├── jobs/media.ts      # hash, dHash, varredura CSAM, prévia borrada
    │       └── modules/
    │           ├── taxonomy.ts    # categorias e filtros (fonte única)
    │           ├── auth/          # cadastro sigiloso e login
    │           ├── verification/  # fluxo +18 e adaptadores de KYC
    │           ├── ads/           # CRUD do anunciante, página pública, denúncia
    │           ├── search/        # busca geolocalizada
    │           ├── payments/      # assinaturas, gateways, webhooks
    │           ├── ppv/           # pay-per-view
    │           └── admin/         # métricas, moderação, ofertas, compliance
    └── web/                       # Next.js
        ├── Dockerfile
        ├── app/
        │   ├── page.tsx                     # busca + filtros + mapa
        │   ├── anuncio/[slug]/page.tsx      # anúncio (SSR)
        │   ├── conteudo/[token]/page.tsx    # link de acesso PPV
        │   ├── painel/verificacao/page.tsx  # verificação de identidade
        │   └── admin/page.tsx               # painel do gestor
        └── components/                      # AgeGate, Filtros, Mapa, VitrinePPV, VisualizadorPPV...
```

## Rodando localmente

```sh
cp .env.example .env
docker compose up --build        # web: http://localhost:3000 · api: http://localhost:4000
```

Sem Docker:

```sh
cd apps/api && npm install && npm run migrate:dev && npm run dev      # + npm run dev:worker
cd apps/web && npm install && npm run dev
```

Criar o primeiro administrador: cadastre-se normalmente e promova no banco
(`UPDATE users SET role = 'admin', status = 'active' WHERE email = '...'`). Crie **dois** admins —
a exportação de dados a autoridades exige aprovação de um segundo administrador.

## Testes

```sh
cd apps/api
npm run typecheck && npm test               # unitários: cripto, CPF, idade, desconto, token PPV, busca
./scripts/smoke-test.sh                     # ponta a ponta contra a API rodando (cadastro → anúncio →
                                            # moderação → busca → assinatura → webhook → PPV → painel)
```

## Deploy no Render

1. Crie um **repositório dedicado** com o conteúdo desta pasta na raiz (o `render.yaml` precisa estar na raiz).
2. Render → **New → Blueprint** → selecione o repositório. Serão criados: Postgres, Redis (Key Value),
   API (web), worker e front-end.
3. Preencha as variáveis marcadas `sync: false` (chaves de criptografia, S3, KYC, gateway).
   Gere as chaves com `openssl rand -hex 32` e **guarde uma cópia offline** — perder a
   `PII_ENCRYPTION_KEY` torna os dados sigilosos irrecuperáveis.
4. Aponte o webhook do gateway para `https://<api>/webhooks/payments`.
5. A cada push na `main`, o Render reconstrói as imagens e roda as migrações (`preDeployCommand`).
