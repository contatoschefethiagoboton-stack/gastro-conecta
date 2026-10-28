# GastroConecta

Marketplace gastronômico responsivo (celular, tablet e computador) com site público, PWA instalável, cadastro completo de parceiros e freelancers, painel de usuário e painel de administração. React, TypeScript, Express e MySQL.

Funciona de forma independente (ex.: Render): banco MySQL externo via `DATABASE_URL`, arquivos e imagens guardados no próprio banco, migrações automáticas na inicialização e acesso de administrador criado pelo código exibido nos logs.

## Colocar no ar

Siga `docs/MANUAL-PLATAFORMA.md` (também em PDF), seção 2. Resumo:

1. Crie um MySQL gratuito (TiDB Cloud ou Aiven) e copie a URL de conexão.
2. No Render, em Environment, defina `DATABASE_URL` (e `GASTRO_PUBLIC_ORIGIN`).
3. Faça o deploy. As tabelas são criadas sozinhas.
4. Copie o código do administrador nos Logs e crie o acesso em `/admin`.

## Desenvolvimento

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

## Verificação

```sh
pnpm check
pnpm test
pnpm build
```

Health check: `/api/health` (mostra também o estado do banco). Variáveis em `.env.example`. Nunca coloque credenciais em arquivos versionados.

Pagamentos são feitos direto entre as partes (diárias via Pix do contratante para o freelancer). Não há gateway, split, retenção ou emissão fiscal nesta versão.
