# GastroConecta

Marketplace responsivo (celular, tablet e computador) que conecta clientes a profissionais — chefs, personal chefs, cozinheiros, auxiliares, barmans, garçons, limpeza e jardinagem. Site público, PWA instalável, painéis de cliente e profissional e painel de administração. React, TypeScript, Express e MySQL.

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

## Modelo de negócio

- **Cliente:** 100% grátis. Publica pedidos (evento, marmitas/personal chef, limpeza, jardinagem), recebe propostas, aceita ("OK") ou recusa. Ao aceitar, recebe o WhatsApp do profissional e o contrato em PDF.
- **Profissional (categoria única):** cadastro com CPF ou CNPJ (MEI/Limitada), logo, foto do rosto, 3+ fotos de trabalhos e banco/Pix. Sem comissão: recebe 100% do valor. Paga assinatura mensal fixa (`GC_SUBSCRIPTION_PRICE_CENTS`) via Pix pelo Mercado Pago.
- **Cobrança:** Pix automático (preapproval do Mercado Pago) agendado para 5 dias antes do vencimento; se falhar, o Pix manual aparece no painel; vencida, o perfil fica oculto e propostas bloqueadas (o radar continua visível). A rotina roda de hora em hora no servidor.
- **Contratos:** gerados automaticamente no aceite, com dados das duas partes, escopo (só mão de obra ou serviço completo), data, horário, local, valor e condições de pagamento; download pelo cliente, profissional e administração (auditoria). Revise o modelo de cláusulas (`server/gastro/contracts.ts`) com um advogado antes de operar.
- **Avaliação 360°** obrigatória após cada serviço; pendência com mais de 24h bloqueia pedidos, propostas e aceites. Selo **Top Rated** com média ≥ 4,5 em 3+ avaliações.
- **Copilot do profissional:** calculadoras editáveis de ingredientes/porções, brigada, marmitas, limpeza e jardinagem, aviso de prejuízo, financeiro com despesas/notas, conversão e gráficos.
- **Fale Conosco:** todos os botões levam ao WhatsApp da administração (`contact.whatsapp` no painel).

Migração `0006_subscription_model`: contas de freelancer viram profissionais em análise, e cadastros antigos de profissionais precisam ser reenviados no novo formato (foto do rosto, banco/Pix). Vagas abertas antigas são canceladas.
