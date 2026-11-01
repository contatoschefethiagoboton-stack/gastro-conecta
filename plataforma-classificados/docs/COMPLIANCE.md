# Compliance, riscos e pontos para validar com advogado

Este documento não é parecer jurídico. Ele lista o que o código já faz e o que precisa ser
resolvido **antes** de lançar.

## 1. Riscos jurídicos (Brasil)

- **Prostituição de adultos não é crime no Brasil, mas lucrar com ela pode ser.** O Código Penal
  tipifica favorecimento da prostituição (art. 228), casa de prostituição (art. 229) e rufianismo —
  "tirar proveito da prostituição alheia, participando diretamente de seus lucros" (art. 230).
  Sites de classificados costumam se apoiar em cobrar **tarifa fixa de anúncio** (não participação no
  valor do programa). Mantenha esse modelo e **valide com advogado criminalista**, inclusive a lista de
  "Serviços e práticas" exibida nos filtros, que pode ser lida como favorecimento.
- **PPV** é venda de conteúdo adulto digital (modelo de plataformas de criadores), com outro enquadramento
  — mas exige consentimento e maioridade comprovados de **todas** as pessoas que aparecem.
- **Exploração sexual de menores e tráfico de pessoas**: tolerância zero (ECA arts. 240 e 241-A a 241-E;
  CP art. 149-A). Já implementado: verificação +18 com documento e vídeo, revisão humana, denúncia pública
  que pausa o anúncio automaticamente, varredura por hash e suspensão imediata. **Defina um procedimento
  escrito** de comunicação às autoridades (Polícia Federal / SaferNet; NCMEC se houver presença nos EUA) e
  preserve as evidências — o código não apaga material sinalizado.
- **Marco Civil da Internet**: guarda de registros de acesso por 6 meses (art. 15 → `auth_events`);
  dados cadastrais podem ser requisitados por autoridade competente (art. 10, §3º); conteúdo e registros
  exigem **ordem judicial** → fluxo `legal_requests` com escopo, anexo do ofício e aprovação de dois admins.
- **LGPD**: dados de vida sexual são **dados sensíveis** (art. 5º, II). Base legal, termos de uso, política
  de privacidade, RIPD (relatório de impacto), encarregado (DPO) e prazos de retenção precisam estar
  definidos. Implementado: cifragem por campo, índice cego, log de todo acesso a dado sigiloso, mínima
  exposição pública (região aproximada, nome artístico).
- **Operação internacional**: cada país tem regras próprias (ex.: FOSTA-SESTA nos EUA proíbe facilitar
  prostituição online; vários países exigem verificação de idade de **visitantes** de sites adultos — o
  Reino Unido e estados dos EUA, por exemplo). Restrinja países por geolocalização de IP até validar cada um.

## 2. Riscos comerciais

- **Gateways de pagamento**: Stripe, Mercado Pago, PagSeguro, Pagar.me e a maioria dos PSPs brasileiros
  **proíbem** acompanhantes e/ou conteúdo adulto nos termos de uso — integrar sem autorização leva a
  bloqueio de saldo. Busque processadores *high-risk* com política explícita para adulto (ex.: CCBill,
  Segpay, Epoch, Verotel para cartão) e confirme **por escrito** a aceitação com o PSP de PIX. O código usa
  uma interface de gateway (`payments/gateways/types.ts`) para trocar de provedor sem mexer no domínio.
- **PIX Automático**: as periodicidades são definidas pelo Banco Central; confirme com o PSP se o ciclo
  **quinzenal** é aceito. Por padrão a API recusa quinzenal via PIX Automático
  (`PIX_AUTOMATICO_ALLOWS_BIWEEKLY=false`) e oferece cartão ou plano mensal.
- **Débito em conta** depende de convênio bancário ou de PSP que o ofereça; muitos bancos o estão
  substituindo pelo PIX Automático.
- **Hospedagem, CDN, e-mail e mapas**: leia a política de uso aceitável de cada fornecedor (Render,
  storage, CDN, provedor de e-mail, tiles do mapa) **antes** de subir conteúdo explícito. Se a política de
  algum proibir, hospede a mídia num provedor que aceite conteúdo adulto e mantenha só a aplicação no Render.
- **App stores**: lojas de apps não aceitam esse conteúdo; mantenha a experiência mobile no navegador/PWA.

## 3. Controles já implementados

| Requisito | Onde |
|---|---|
| Dados sigilosos nunca públicos | `advertiser_private_data` cifrada; nenhuma rota pública a consulta |
| Verificação +18 com documento, selfie e vídeo | `modules/verification/*`, revisão humana obrigatória |
| Vídeo de verificação público com código-desafio | `admin/moderation.ts` publica após aprovação |
| Aviso de conteúdo adulto e selo RTA | `web/components/AgeGate.tsx`, `next.config.mjs` |
| Denúncia pública e pausa automática | `POST /ads/:id/report` |
| Varredura de mídia (CSAM) e duplicidade | `jobs/media.ts` (plugue PhotoDNA/Safer/Google Content Safety) |
| Auditoria inviolável | `admin_logs` com cadeia de hash + triggers somente-inserção |
| Atendimento a autoridades com quatro olhos | `admin/compliance.ts` + CHECK `ck_four_eyes` |
| Rate limit, anti-enumeração, argon2id | `server.ts`, `auth/routes.ts` |

## 4. Pendências antes do lançamento

- [ ] Parecer jurídico (penal, LGPD, consumidor) e termos de uso / política de privacidade.
- [ ] Contrato com PSP e adquirente que aceitem a categoria; integrar o adaptador real em `gateways/index.ts`.
- [ ] Contrato com provedor de KYC (idwall, unico, Serpro Datavalid, Veriff…) e scanner de CSAM.
- [ ] TOTP obrigatório para moderadores/admins (campo `mfa_secret_enc` já existe).
- [ ] Chaves de criptografia em KMS e plano de rotação (`key_version`).
- [ ] Termo de consentimento de imagem para cada pessoa que aparece em fotos/vídeos.
- [ ] Equipe de moderação com escala que cubra o volume e treinamento em sinais de tráfico/coação.
- [ ] Transcodificação de vídeo e varredura por quadros (ffmpeg) no worker.
