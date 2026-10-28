# Manual completo da plataforma GastroConecta

**Versão do manual:** 1.1 (Fase 1: WhatsApp e promoções sazonais)  
**Versão de referência anterior:** `d68d6e2`  
**Endereço publicado:** https://gastrocon-hmxqrxzy.manus.space  
**Idioma:** Português do Brasil

---

## 1. Sobre este manual

Este manual explica como usar, administrar, operar e preparar o GastroConecta para uma operação comercial. Ele foi escrito a partir da versão efetivamente implementada e distingue claramente o que está disponível, o que é demonstrativo e o que ainda depende de configuração, homologação ou decisão empresarial.

O GastroConecta é um marketplace gastronômico que aproxima clientes de chefs particulares e buffets e conecta fornecedores a profissionais freelancers para trabalhos operacionais. A plataforma atua como infraestrutura tecnológica e de organização de relacionamentos. A existência de uma proposta, candidatura, contrato ou aceite não significa que um pagamento foi processado, que uma identidade foi verificada ou que existe vínculo trabalhista.

A versão mobile aprovada é um **PWA**, ou aplicativo web instalável. Não há APK, IPA ou publicação em lojas nesta versão.

### 1.1 O que está disponível

Estão disponíveis o site público, o atendimento pelo WhatsApp (botão flutuante, resumo do orçamento e contato no rodapé), as promoções sazonais automáticas na página inicial, o catálogo de profissionais, portfólios demonstrativos identificados, cadastro e login, orçamento em três passos, eventos, propostas, radar de leads, vagas de diária, candidaturas, aceite de freelancers, carteira sem recebimentos fictícios, planos em estado pendente, contratos em PDF como minutas, avaliações 360°, Copilot com IA no servidor, painel por perfil, PWA e documentação de implantação.

### 1.2 O que ainda não está operacional

Não estão habilitados pagamentos reais, checkout de cartão ou Pix, split, escrow, conciliação, estorno, emissão de NF, biometria/liveness, integração operacional com Meta ou Google, assinatura digital, selo de identidade verificada, antifraude completo por dispositivo/IP ou o vínculo final do Super Admin com a identidade do proprietário. Essas limitações são exibidas ou devem ser mantidas explícitas na operação.

---

## 2. Acesso à plataforma

Acesse a versão publicada em:

**https://gastrocon-hmxqrxzy.manus.space**

As principais páginas públicas são:

| Página | Endereço | Finalidade |
|---|---|---|
| Início | `/` | Apresentação, descoberta e entrada nos fluxos |
| Profissionais | `/profissionais` | Catálogo, busca e filtros |
| Perfil profissional | `/profissionais/:id` | Portfólio, especialidade e solicitação |
| Orçamento | `/orcamento` | Criação de evento em três etapas |
| Conta | `/conta` | Cadastro e login |
| Painel | `/painel` | Área privada conforme o perfil |
| Quem somos | `/sobre` | Origem, propósito e valores |
| Como funciona | `/como-funciona` | Explicação da jornada |
| Para profissionais | `/para-profissionais` | Entrada de fornecedores |
| Vagas | `/vagas` | Oportunidades e diárias |
| Segurança | `/seguranca` | Princípios de proteção e uso responsável |
| Termos | `/termos` | Regras gerais da plataforma |

As páginas públicas têm conteúdo inicial indexável. Conta, painel e orçamento autenticado não devem ser indexados em mecanismos de busca.

---

## 3. Cadastro, login e segurança de conta

### 3.1 Tipos de conta

O cadastro público oferece três tipos:

- **Cliente:** cria eventos, solicita orçamentos, recebe propostas, aceita uma proposta e avalia os participantes.
- **Fornecedor:** chef particular, buffet ou negócio gastronômico que atende eventos, recebe leads, envia propostas, publica vagas e administra sua operação.
- **Freelancer:** cozinheiro, ajudante, garçom ou barman que consulta vagas, candidata-se e acompanha trabalhos aceitos.

O administrador não é escolhido no cadastro. O Super Admin deve ser a identidade do proprietário autenticada pela integração Manus e configurada de forma explícita. O primeiro usuário cadastrado nunca recebe administração automaticamente.

### 3.2 Requisitos da senha

A senha própria precisa ter:

1. no mínimo 10 caracteres;
2. pelo menos uma letra maiúscula;
3. pelo menos uma letra minúscula;
4. pelo menos um número;
5. pelo menos um caractere especial.

Não compartilhe sua senha. A aplicação armazena o registro de senha com proteção criptográfica e utiliza sessão autenticada opaca. Um novo login pode invalidar a sessão anterior da mesma conta.

### 3.3 Cadastro

1. Acesse `/conta`.
2. Selecione **Criar conta**.
3. Informe nome completo, e-mail, cidade, tipo de participação e senha.
4. Leia os indicadores de força da senha.
5. Envie o formulário.
6. Após o cadastro, a plataforma encaminha você ao painel ou ao orçamento, conforme o fluxo de origem.

Fornecedores e freelancers podem nascer com status **pending**. Isso significa que a conta foi criada, mas ainda não está liberada para ações operacionais. Não interprete esse estado como aprovação, pagamento ou verificação de identidade.

### 3.4 Login

1. Acesse `/conta`.
2. Selecione **Entrar**.
3. Informe e-mail e senha.
4. Após a autenticação, acesse o painel.

Para o proprietário da operação, use **Entrar como proprietário**. Essa ação autentica a identidade Manus, mas não concede administração sozinha: a identidade precisa estar designada na configuração segura do projeto.

### 3.5 Sessão encerrada, suspensa ou bloqueada

Uma conta com status `suspended`, `blocked` ou `deleted` não deve executar ações privadas. Uma conta `pending` pode acessar funções de perfil, planos, avaliações e suporte, mas não deve enviar propostas, publicar vagas ou executar transações operacionais que exigem aprovação.

Para sair, use **Sair da conta** no painel. A plataforma remove a sessão local e encerra a sessão no servidor.

---

## 4. Jornada do cliente

### 4.1 Encontrar um profissional

1. Acesse **Profissionais**.
2. Pesquise por cidade, categoria ou tipo de serviço.
3. Use os filtros disponíveis.
4. Abra um perfil para consultar especialidade, cidade, descrição, tags e portfólio.
5. Verifique se o perfil está marcado como **demonstrativo**.

Perfis demonstrativos servem para mostrar a experiência visual da plataforma. Eles não representam fornecedores contratáveis, avaliações reais, preços definitivos, selos biométricos ou depoimentos comprovados.

### 4.2 Criar um orçamento em três etapas

O orçamento deve ser criado por uma conta autenticada.

**Etapa 1 — O evento**

Informe título, tipo de evento, data, cidade e local. A data deve ser válida e, para um novo evento, não pode estar no passado.

**Etapa 2 — Dimensão**

Informe quantidade de convidados, orçamento e descrição. Valores são enviados ao servidor em centavos inteiros para evitar erros de arredondamento.

**Etapa 3 — Preferência e intenção**

Escolha, quando aplicável, um profissional real disponível no catálogo e indique o estágio do pedido:

- **Alta intenção — 80 a 100:** data, cidade/local, convidados e orçamento completos;
- **Comparando — 50 a 79:** cliente avaliando alternativas ou propostas;
- **Pesquisa — 0 a 49:** dúvida inicial, sem informações suficientes.

Quando o profissional selecionado é um exemplo demonstrativo, o pedido não fica preso a uma conta fictícia: ele segue como oportunidade aberta, com indicação clara de que o exemplo não é contratável.

Ao concluir o formulário, o evento é persistido. Um pedido sem profissional preferido pode ser acessado por fornecedores elegíveis conforme as regras do radar.

### 4.3 Receber e aceitar propostas

O cliente consulta propostas no painel. Cada proposta pode mostrar fornecedor, evento, valor, mensagem e status.

Para aceitar:

1. Abra o painel.
2. Acesse a área de propostas/eventos.
3. Revise valor e mensagem.
4. Confirme o aceite.

O aceite reserva o evento e registra a relação operacional. **Não é cobrança, depósito, split, escrow ou confirmação de recebimento.** O checkout retorna indisponibilidade enquanto o gateway não estiver homologado.

### 4.4 Avaliar participantes

Depois que o evento for concluído, o painel apresenta as avaliações pendentes. O cliente pode avaliar fornecedores e freelancers vinculados ao evento.

A avaliação exige nota de 1 a 5 e feedback. As verificações ocorrem no servidor: o autor precisa ter participado do evento e o alvo precisa ser uma contraparte válida. A avaliação 360° pode incluir freelancers quando a vaga foi vinculada ao evento e teve candidatura aceita.

Após 24 horas da conclusão, avaliações pendentes podem bloquear novas ações transacionais do participante. Esse guard não deve impedir acesso à conta, suporte, privacidade ou correção de dados.

---

### 4.5 Atendimento pelo WhatsApp

O site oferece três caminhos para o cliente falar direto pelo WhatsApp de atendimento, sem precisar criar conta:

1. **Botão verde "Fale no WhatsApp"**, fixo no canto inferior esquerdo das páginas públicas. Ele não aparece em `/conta` e `/painel`, para não atrapalhar as áreas privadas.
2. **Na página de orçamento**, o quadro "Prefere conversar agora?" abre o WhatsApp com o resumo do que o cliente já preencheu (ocasião, data, cidade, convidados, orçamento e detalhes).
3. **Depois de enviar o pedido**, o botão "Enviar resumo pelo WhatsApp" manda o mesmo resumo junto com o número do pedido, para o atendimento localizar o evento no painel.

O rodapé também mostra WhatsApp, e-mail e o site vitrine chefcampinas.vip. O site não lê nem armazena conversas do WhatsApp; a mensagem só é enviada se o cliente confirmar no próprio aplicativo.

## 5. Jornada do fornecedor

### 5.1 Aprovação

O fornecedor deve aguardar a liberação administrativa. Enquanto estiver `pending`, pode revisar seu perfil, planos e suporte, mas não deve:

- enviar propostas;
- publicar vagas operacionais;
- iniciar ações comerciais que dependam de aprovação;
- apresentar a conta como verificada ou homologada.

A aprovação administrativa não confirma pagamento de assinatura. O plano pode aparecer como `pending_payment` sem cobrança real.

### 5.2 Completar o perfil

No painel, mantenha atualizados nome, cidade, bio e especialidade. O catálogo de profissionais reais mostra apenas dados públicos necessários, sem e-mail ou informações privadas.

Se não houver fotografia real cadastrada, a plataforma apresenta um marcador neutro. Nunca use uma imagem de banco ou de IA para sugerir que seja o rosto do profissional.

### 5.3 Radar de oportunidades

O radar mostra leads elegíveis com score de intenção:

| Faixa | Score | Interpretação |
|---|---:|---|
| Alta | 80–100 | Data, local, convidados e orçamento definidos |
| Média | 50–79 | Cliente comparando ou com parte dos dados |
| Pesquisa | 0–49 | Interesse inicial ou dúvida |

Use os filtros **Todos**, **Alta**, **Média** e **Pesquisa**, além do filtro por cidade.

O fornecedor deve avaliar o contexto antes de propor. Um score é uma priorização de produto, não uma garantia de conversão, orçamento, disponibilidade ou pagamento.

### 5.4 Enviar proposta

1. Abra um lead elegível.
2. Revise data, cidade, local, convidados e orçamento.
3. Informe o valor em reais no formulário.
4. Escreva uma mensagem clara sobre escopo e condições.
5. Envie a proposta.

O parser aceita formatos como `180.50` e `1.800,50`. Valores inválidos devem ser corrigidos; a plataforma não deve transformar erro em zero.

O fornecedor precisa estar ativo. O servidor valida posse, status e elegibilidade do evento antes de aceitar a proposta.

### 5.5 Publicar uma vaga de diária

1. Acesse **Vagas** ou a área de equipe do painel.
2. Informe título, função, data, cidade, horas e descrição.
3. Selecione a função: cozinheiro, ajudante, garçom ou barman.
4. Informe a diária.
5. Opcionalmente, vincule a vaga a um evento reservado seu.
6. Publique.

A tabela balizadora inicial é um parâmetro de produto e deve ser ajustada por função, duração, localidade e condições comerciais antes da operação real. O servidor valida data nova e impede publicação de vaga com data passada.

O vínculo opcional com evento é importante para que o freelancer participe da avaliação 360° daquele evento.

### 5.6 Avaliar candidaturas

1. Abra a área **Equipe / candidaturas**.
2. Consulte candidaturas pendentes.
3. Verifique o nome do freelancer e os dados da vaga.
4. Aceite uma candidatura quando houver decisão.

O aceite reserva a vaga. A plataforma não simula pagamento ou contratação trabalhista. O vínculo deve ser tratado conforme a legislação e os contratos revisados pelas partes.

### 5.7 Concluir evento ou vaga

O fornecedor pode concluir um evento reservado ou uma vaga reservada somente quando a data já tiver ocorrido e ele for participante autorizado.

A conclusão é uma mudança de estado operacional. Ela não gera recebimento, nota fiscal ou liberação financeira automaticamente.

### 5.8 Carteira

A carteira mostra somente registros realmente existentes. Não há recebimentos fictícios. Os cálculos previstos são:

- eventos: comissão configurável entre 8% e 12%, padrão de 10%;
- diárias: taxa de 10% acrescida ao contratante, preservando 100% da diária informada ao freelancer.

Os valores são calculados em centavos inteiros. Sem gateway homologado, a carteira não deve ser usada como prova de dinheiro disponível.

---

## 6. Jornada do freelancer

### 6.1 Perfil

O freelancer informa nome, cidade, bio e especialidade. O catálogo pode exibir o perfil quando ele estiver ativo, sem divulgar e-mail privado.

### 6.2 Encontrar vagas

Acesse **Vagas**, leia função, data, cidade, horas, diária e descrição. Confirme sua disponibilidade antes de candidatar-se.

### 6.3 Candidatar-se

1. Abra a vaga.
2. Revise todos os dados.
3. Envie a candidatura.
4. Acompanhe o status no painel.

O freelancer não paga taxa sobre a diária na regra de produto atual. A comissão de 10% é prevista para o contratante. Isso não substitui a definição contratual, fiscal ou trabalhista adequada para cada operação.

### 6.4 Candidatura aceita

Quando o fornecedor aceitar, a vaga passa a ser reservada. Se a vaga estiver vinculada a um evento, o freelancer passa a fazer parte da cadeia de avaliação 360° daquele evento.

### 6.5 Conclusão e avaliação

Após a data do trabalho, o fornecedor autorizado pode concluir a vaga. O freelancer deve avaliar e ser avaliado conforme os vínculos efetivamente registrados.

Uma pendência de avaliação pode restringir novas ações comerciais depois de 24 horas, mas não deve impedir acesso à conta, suporte ou direitos de privacidade.

---

## 7. Contratos e PDFs

A plataforma gera **minutas** a partir dos vínculos registrados. Uma minuta não é automaticamente assinatura digital, documento jurídico definitivo ou comprovante de pagamento.

### 7.1 Tipo A — plataforma e prestador

- exclusivo do fornecedor;
- não exige evento ou vaga;
- é criado pelo fornecedor autenticado;
- descreve a relação de uso da plataforma e prestação tecnológica.

### 7.2 Tipo B — cliente e fornecedor do evento

- exige evento reservado ou concluído;
- exige participante autorizado;
- reúne dados de evento, partes, valor e condições;
- não registra pagamento processado.

### 7.3 Tipo C — fornecedor e freelancer

- exige vaga vinculada;
- exige candidatura aceita;
- inclui função, data, diária e taxa prevista;
- é uma minuta operacional, não uma decisão sobre vínculo trabalhista.

### 7.4 Gerar e baixar

1. Abra **Contratos** no painel.
2. Selecione o tipo permitido para seu perfil.
3. Selecione o evento ou vaga quando solicitado.
4. Gere a minuta.
5. Baixe o PDF pelo botão correspondente.
6. Revise com as partes e, quando necessário, com assessoria jurídica.

As permissões são verificadas no servidor. Um usuário não deve conseguir gerar ou baixar contrato de evento, vaga ou conta que não lhe pertença.

---

## 8. Avaliações 360°

A avaliação 360° é baseada em vínculos reais. O sistema evita que uma conta avalie alguém sem relação registrada e limita a nota ao intervalo de 1 a 5.

O fluxo recomendado é:

1. participante autorizado conclui o evento ou vaga;
2. sistema identifica alvos de avaliação;
3. cada participante envia nota e feedback;
4. pendências aparecem no painel;
5. após 24 horas, pendências podem bloquear novas ações comerciais;
6. suporte, conta e privacidade permanecem acessíveis.

Não use avaliações para inserir dados sensíveis, acusações sem evidência, senhas, documentos pessoais ou informações não necessárias.

---

## 9. Copilot

O Copilot aparece como botão flutuante na plataforma e requer autenticação para carregar ou salvar histórico.

### 9.1 O que perguntar

Exemplos adequados:

- “Como estruturo uma proposta para este evento?”
- “Quais informações faltam para aumentar a intenção deste lead?”
- “Quais pontos devo revisar nesta minuta?”
- “Como organizar uma equipe de cozinha para uma diária?”
- “Quais funções devo considerar para este buffet?”

O Copilot recebe contexto de perfil e catálogo público necessário. Ele pode sugerir caminhos, mas não deve inventar profissionais, notas, pagamentos, homologações, identidade, disponibilidade ou garantias de resultado.

### 9.2 Limitações

O Copilot não substitui advogado, contador, consultor de segurança, especialista de LGPD ou autoridade trabalhista. Não envie senhas, chaves, documentos pessoais desnecessários ou dados financeiros completos.

A IA é chamada no servidor. Chaves não devem aparecer no frontend. O modelo verificado na infraestrutura desta versão é `gpt-5-mini`; não se deve anunciar GPT-4o sem configurar e validar uma credencial própria.

### 9.3 Erros e repetição

Se uma mensagem falhar, o painel informa o erro e oferece nova tentativa. A mensagem otimista é removida quando o envio não chega ao servidor, evitando duplicação visual.

---

## 10. Painel administrativo

O painel administrativo é exclusivo do proprietário autenticado e só deve ser liberado após configurar a identidade correta em ambiente seguro.

### 10.1 Visão geral

O administrador pode consultar indicadores de usuários, eventos, pendências e receita registrada. Receita registrada não deve ser apresentada como dinheiro liquidado quando o gateway não estiver ativo.

### 10.2 Usuários

As ações previstas incluem editar, suspender, bloquear e exclusão lógica. Status possíveis:

- `active`: conta liberada;
- `pending`: aguardando aprovação;
- `suspended`: temporariamente impedida;
- `blocked`: bloqueada;
- `deleted`: exclusão lógica.

O administrador não pode bloquear ou desativar a própria conta. A exclusão lógica não significa eliminação integral dos dados; pedidos de privacidade devem seguir um processo próprio de atendimento e retenção legal.

### 10.3 Aprovação e planos

Uma solicitação de plano pode ficar em `pending_payment`. O administrador deve confirmar pagamento somente depois de existir gateway, webhook, conciliação e evidência financeira reais.

A meta operacional de análise em 24 horas é um objetivo de processo, não uma confirmação automática.

### 10.4 VIP, desconto e destaque

Os campos de VIP, percentual de desconto e destaque podem organizar o catálogo e a operação. Eles não devem ser comunicados como benefício financeiro liquidado enquanto pagamentos e regras comerciais não estiverem homologados.

### 10.5 Cupons e cashback

Cupons e cashback podem ser cadastrados como configuração. Sem gateway e motor de liquidação, não representam crédito financeiro, reembolso ou dinheiro disponível.

### 10.6 Auditoria e relatórios

A auditoria registra ações administrativas e eventos importantes. O relatório PDF deve ser tratado como exportação operacional, não como prova de liquidação, nota fiscal ou auditoria contábil independente.

---

### 10.7 Promoções sazonais

A página inicial mostra a seção "Da temporada" com as campanhas válidas na data de hoje. Ela some sozinha quando não há campanha ativa. Cada cartão tem dois botões: falar no WhatsApp com uma mensagem já pronta e pedir pelo site, que abre o orçamento com a ocasião pré-selecionada.

Campanhas cadastradas por padrão:

| Campanha | Período (todo ano) | Ocasião no orçamento |
|---|---|---|
| Confraternização da empresa | 01/10 a 20/12 | Evento corporativo |
| Ceia de Natal e Ano-Novo em casa | 01/11 a 06/01 | Jantar em casa |
| Churrasco com churrasqueiro profissional | 07/01 a 15/03 | Confraternização |
| Dia das Mães | 15/04 a 12/05 | Jantar em casa |
| Dia dos Namorados | 20/05 a 12/06 | Jantar em casa |
| Boteco e arraiá em casa | 13/06 a 31/07 | Confraternização |
| Dia dos Pais | 25/07 a 14/08 | Confraternização |

**Como editar:** as campanhas ficam no arquivo `shared/promotions.ts`. Para mudar texto ou datas, altere os campos `title`, `text`, `start` e `end` (formato `MM-DD`). Para pausar sem apagar, use `active: false`. Depois de editar, publique novamente. Não coloque percentuais de desconto ou preços que não estejam realmente valendo.

**Dados de contato:** número de WhatsApp, e-mail, região de atendimento e endereço do site vitrine ficam em `shared/business.ts`. Alterar ali atualiza o botão, o rodapé, as promoções e os dados estruturados para o Google.

## 11. Segurança, privacidade e uso responsável

### 11.1 Proteções implementadas

A aplicação utiliza sessão cookie opaca, hash da sessão no banco, validação de posse, controles de papel, bloqueio de contas suspensas, rate limit em pontos sensíveis, proteção de origem nas mutações e consultas privadas por conta.

Mutação administrativa sem origem autorizada deve ser recusada. O mecanismo aceita a origem exata do host público ou o host encaminhado confiável conforme a configuração do proxy. O modo CLI explícito é uma exceção de operação técnica e não deve ser exposto ao navegador.

### 11.2 Boas práticas de operação

- use HTTPS;
- nunca compartilhe cookies ou tokens;
- não copie credenciais para tickets ou chat;
- conceda administração apenas à identidade do proprietário;
- revise logs sem expor senha, e-mail privado ou chave;
- mantenha backups e plano de incidente;
- aplique política de retenção e atendimento LGPD;
- não apresente demonstração como fornecedor real;
- não declare biometria, pagamento ou nota fiscal sem homologação.

### 11.3 Dados que não devem ser inventados

Não invente ratings, depoimentos, selos, fotos de pessoas reais, disponibilidade, pagamentos, recebimentos, aprovações, credenciais, verificação facial ou conexão com Instagram/Google.

---

## 12. Instalação como aplicativo (PWA)

### Android/Chrome

1. Abra a URL publicada em HTTPS.
2. Abra o menu do navegador.
3. Selecione **Instalar aplicativo** ou **Adicionar à tela inicial**.
4. Confirme.

### iPhone/Safari

1. Abra a URL no Safari.
2. Toque em **Compartilhar**.
3. Selecione **Adicionar à Tela de Início**.
4. Confirme o nome e adicione.

O service worker fornece uma tela offline, mas não armazena APIs, contas, pagamentos ou dados privados. Operações exigem conexão. O preview embutido pode não oferecer instalação, mesmo quando a versão publicada é elegível.

---

## 13. Integrações comerciais pendentes

### 13.1 Mercado Pago ou Asaas

Antes de cobrar, é necessário configurar conta empresarial, credenciais privadas, recebedores, split, webhooks autenticados e idempotentes, conciliação, estorno, antifraude e regra de liberação. A retenção em garantia precisa ser validada com o fornecedor do gateway e com assessoria jurídica.

### 13.2 Biometria e liveness

É necessário contratar um provedor, configurar SDK, verificar tokens no servidor, definir consentimento, base legal, finalidade e retenção. A versão atual não coleta biometria.

### 13.3 Meta e Google

As conexões de sessão não são credenciais de execução do site. Meta e Google exigem contas, permissões, consentimento e políticas próprias. Não importe leads, mensagens ou conteúdo privado sem autorização.

### 13.4 Emissão fiscal

É necessário definir regime tributário e integrar NFS-e ou serviço fiscal homologado. A regra de produto prevista separa a comissão da plataforma do valor total do serviço do fornecedor, mas a emissão efetiva depende de revisão contábil.

---

## 14. Implantação técnica

### 14.1 Requisitos

- Node.js compatível com o projeto;
- pnpm 10.18.0;
- banco MySQL gerenciado;
- `DATABASE_URL` configurado;
- variáveis Manus de autenticação e serviço;
- ambiente HTTPS em produção.

### 14.2 Desenvolvimento

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

O servidor atende na porta definida por `PORT`, padrão 3000. O endpoint de saúde é:

```text
/api/health
```

### 14.3 Validação antes de publicar

```bash
pnpm check
pnpm test
pnpm build
```

As migrações são versionadas em `drizzle/`. Não execute migrações destrutivas em banco compartilhado. Desenvolvimento, teste e publicação podem usar o mesmo banco gerenciado; qualquer escrita de teste pode afetar dados reais.

### 14.4 Container

O `Dockerfile` instala dependências, compila o frontend e o servidor e inicia `dist/index.js`. O processo deve escutar em `0.0.0.0` e respeitar `PORT`.

### 14.5 Variáveis de ambiente

Use `.env.example` como referência. Nunca faça commit de valores reais. As variáveis de infraestrutura Manus devem ser carregadas pelo ambiente da plataforma. `OWNER_OPEN_ID` deve receber somente o identificador verificado do proprietário, nunca um e-mail digitado livremente como prova de administração.

### 14.6 Conteúdo público e PWA

Mantenha `client/public/manus-routes.json` sincronizado com as páginas. Verifique manifesto, ícones, service worker, HTML inicial e metadados. O domínio público real deve ser configurado em `GASTRO_PUBLIC_ORIGIN` para canonical, sitemap e previews sociais.

---

## 15. Solução de problemas

### “Minha conta foi criada, mas não consigo enviar proposta”

Verifique se o tipo é fornecedor, se a conta está `active` e se a aprovação foi concluída. `pending` não é uma falha de senha e não deve ser contornado pelo frontend.

### “O pagamento não foi concluído”

A versão publicada não tem gateway homologado. Não tente interpretar `pending_payment` como cobrança. A administração deve configurar e validar o gateway antes de habilitar checkout.

### “Não consigo gerar o contrato C”

O contrato C exige vaga válida e candidatura com status aceito. Verifique também se você é a contraparte autorizada da vaga.

### “A data apareceu um dia antes”

As datas sem horário são tratadas como datas locais para evitar deslocamento de fuso. Se houver uma data inválida, revise o valor no evento ou vaga e confirme a configuração regional do navegador.

### “O Copilot não respondeu”

Confirme login, conexão e estado do serviço de IA. Tente novamente pelo botão exibido. Não cole chaves no chat. O histórico é por conta e não é aberto para visitantes.

### “Não consigo instalar o PWA”

Use a URL publicada em HTTPS, não apenas o preview embutido. Tente Chrome no Android ou Safari no iPhone e confirme se o navegador oferece a opção.

### “O administrador não aparece”

O Super Admin não é criado pelo cadastro. Configure a identidade Manus verificada do proprietário em ambiente seguro. Não transforme o primeiro usuário em administrador manualmente sem autorização.

### “Um perfil demonstrativo não responde”

Isso é esperado. Perfis demonstrativos ilustram a experiência e não são fornecedores reais. Use um profissional real ativo quando houver contas aprovadas no catálogo.

---

## 16. Checklist para operação comercial

Antes de abrir a plataforma ao público para contratar e receber dinheiro, confirme:

- identidade legal da empresa e responsável;
- termos, política de privacidade e LGPD revisados;
- canais de suporte e direitos do titular;
- política de cancelamento, reembolso e disputa;
- gateway com split, webhook, conciliação e estorno homologados;
- fluxo de emissão fiscal validado por contador;
- contratos revisados por advogado;
- regras de freelancers e prestadores revisadas;
- antifraude e controle de dispositivos implementados;
- biometria somente com consentimento e base legal;
- integrações Meta/Google autorizadas;
- domínio HTTPS, canonical e políticas de cookies;
- backups, monitoramento e plano de incidentes;
- contas de teste separadas de produção;
- catálogo demonstrativo removido ou mantido com identificação inequívoca;
- Super Admin vinculado à identidade correta;
- testes de isolamento entre cliente, fornecedor, freelancer e administrador;
- testes de webhook idempotente e recuperação de falhas.

---

## 17. Referências do projeto

- `README.md` — visão geral e comandos;
- `docs/IMPLANTACAO.md` — implantação e limitações;
- `docs/api-contract.md` — contrato REST;
- `docs/REVISAO.md` — revisão técnica e pendências;
- `TODO.md` — estado detalhado das entregas;
- `plan.md` — plano de produto, arquitetura e direção visual;
- `drizzle/` — schema e migrações;
- `client/` — interface e PWA;
- `server/` — autenticação, regras e rotas;
- `shared/` — catálogo e tipos compartilhados.

---

## 18. Aviso final

O GastroConecta está publicado como plataforma tecnológica e demonstração funcional de seus fluxos. A operação financeira, fiscal, biométrica, jurídica e trabalhista depende de configuração e homologação próprias. O uso em produção comercial deve preservar as limitações deste manual e não anunciar como disponível aquilo que o painel identifica como pendente.
