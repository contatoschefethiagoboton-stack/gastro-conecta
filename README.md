# GastroConecta

Marketplace gastronômico responsivo com site público, PWA instalável e painéis de cliente, fornecedor, freelancer e administrador. A aplicação usa React, TypeScript, Express e MySQL/Drizzle.

## Desenvolvimento

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

## Verificação e produção

```sh
pnpm check
pnpm test
pnpm build
pnpm start
```

O `Dockerfile` permite implantação em container. O health check é `/api/health` e a porta respeita `PORT`, com padrão 3000. Nunca coloque credenciais em arquivos versionados.

Consulte `docs/IMPLANTACAO.md` para operação, PWA e dependências. O contrato REST está em `docs/api-contract.md`, a revisão técnica em `docs/REVISAO.md` e o estado das entregas em `TODO.md`.

O manual completo para usuários, fornecedores, freelancers, administração, segurança e implantação está em `docs/MANUAL-PLATAFORMA.md` e também em PDF em `docs/MANUAL-PLATAFORMA.pdf`.

Contato e campanhas: os dados de atendimento (WhatsApp, e-mail, site vitrine) ficam em `shared/business.ts` e as promoções sazonais em `shared/promotions.ts`. Antes de publicar, siga `docs/PUBLICAR.md`.

Esta versão não realiza cobranças, split, escrow, emissão fiscal, biometria ou assinatura digital. Essas integrações permanecem pendentes de credenciais e homologação. Portfólios demonstrativos são identificados, e o vínculo de Super Admin requer uma identidade de proprietário verificada; não existe senha padrão nem concessão ao primeiro cadastro.
