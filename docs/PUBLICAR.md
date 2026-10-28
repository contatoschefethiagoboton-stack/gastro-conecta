# Publicar esta versão (Fase 1)

Esta versão foi editada fora do Manus, num ambiente sem acesso à internet. Por isso as dependências não puderam ser instaladas e `pnpm check`, `pnpm test` e `pnpm build` ainda **não foram executados**. Rode esses três comandos antes de publicar.

## 1. Levar o código para o projeto

Opção A — GitHub (pasta local "GASTRO CONECTA", Git Bash):

```sh
cd ~/Desktop/"GASTRO CONECTA"
# copie aqui o conteúdo do zip atualizado, substituindo os arquivos
git add -A
git commit -m "Fase 1: WhatsApp, promoções sazonais e contato"
git push
```

Opção B — Manus: envie o zip atualizado no chat do projeto e peça para aplicar os arquivos alterados listados no fim deste documento.

## 2. Validar

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

Se `pnpm check` apontar erro, corrija antes de publicar (no Manus, cole a mensagem de erro no chat do projeto).

## 3. Variáveis de ambiente (secrets do projeto)

- `OWNER_OPEN_ID`: identificador Manus do proprietário (ver passo a passo do Super Admin). Sem ele, ninguém aprova fornecedores.
- `GASTRO_PUBLIC_ORIGIN`: endereço público definitivo com https (ex.: o domínio próprio). Usado em canonical, prévias de compartilhamento e dados estruturados.
- `DATABASE_URL` e variáveis `MANUS_*`: já fornecidas pela hospedagem Manus.

Nenhuma migração de banco nova nesta versão.

## 4. Publicar e conferir

1. Publique/republique.
2. Abra a home no celular: o botão verde do WhatsApp aparece no canto inferior esquerdo e o Copilot no direito.
3. Em outubro a dezembro deve aparecer a seção "Da temporada" com a campanha de confraternização.
4. Faça um orçamento de teste e use "Enviar resumo pelo WhatsApp".
5. Entre como proprietário e confira o painel administrativo.

## Arquivos alterados nesta versão

Novos: `shared/business.ts`, `shared/promotions.ts`, `client/src/components/WhatsAppButton.tsx`, `client/src/components/PromotionsSection.tsx`, `server/phase1.test.ts`, `docs/PUBLICAR.md`.

Alterados: `client/src/App.tsx`, `client/src/pages/Home.tsx`, `client/src/pages/Quote.tsx`, `client/src/components/SiteLayout.tsx`, `client/src/index.css`, `server/publicSeo.ts`, `server/publicSeo.test.ts`, `docs/MANUAL-PLATAFORMA.md`, `docs/MANUAL-PLATAFORMA.pdf`, `TODO.md`, `README.md`.
