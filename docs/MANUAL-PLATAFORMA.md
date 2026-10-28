# Manual da plataforma GastroConecta

**Versão do manual:** 2.0 — versão independente (Render)
**Idioma:** Português do Brasil

---

## 1. O que mudou nesta versão

A plataforma agora roda sozinha, sem depender do Manus:

- **Banco de dados próprio (MySQL externo)**, ligado pela variável `DATABASE_URL`. O servidor cria e atualiza as tabelas sozinho a cada inicialização.
- **Fotos e documentos guardados no próprio banco**: foto de perfil, fotos de serviços, currículos, imagens do site e das promoções. Nada se perde quando o Render reinicia ou faz um novo deploy.
- **Cadastro completo e obrigatório** para profissionais parceiros e freelancers, com aprovação da administração.
- **Login da administração separado**, por um link discreto no rodapé ("Administração").
- **Painel de administração completo**: aprovar cadastros, editar textos e fotos do site, enviar imagens, criar promoções, dar bônus e benefícios, cupons, auditoria e troca de senha.
- **Layout ajustado para celular, tablet e computador**, incluindo cadastro e painel.
- Nenhuma ligação com outros sites: a plataforma é independente.

## 2. Colocar no ar no Render

![Passos para colocar no ar](img/fluxo-render.png)

### 2.1 Criar o banco de dados (grátis)

O Render não oferece MySQL, então o banco fica num serviço externo. A opção recomendada é o **TiDB Cloud** (compatível com MySQL, com plano gratuito):

1. Acesse **tidbcloud.com** e crie uma conta.
2. Crie um cluster no plano gratuito (Serverless/Starter). Escolha a região mais próxima da região do seu serviço no Render.
3. No cluster, clique em **Connect**. Gere uma senha e copie a **string de conexão** no formato `mysql://usuario:senha@host:4000/test`.
4. Se a senha tiver caracteres especiais como `@`, `#` ou `/`, eles precisam estar codificados (o próprio TiDB costuma entregar a URL pronta).

Alternativa: **Aiven** (MySQL gratuito). Copie a "Service URI" no formato `mysql://avnadmin:senha@host:porta/defaultdb?ssl-mode=REQUIRED`.

O sistema liga a conexão segura (SSL) automaticamente para TiDB, Aiven e outros provedores na nuvem.

### 2.2 Configurar o Render

No serviço **gastro-conecta** no Render, abra **Environment** e adicione:

| Variável | Obrigatória? | Valor |
|---|---|---|
| `DATABASE_URL` | Sim | A string de conexão do passo anterior |
| `GASTRO_PUBLIC_ORIGIN` | Recomendada | Endereço público, ex.: `https://gastro-conecta.onrender.com` ou seu domínio |
| `ADMIN_EMAIL` e `ADMIN_PASSWORD` | Opcional | Cria/atualiza o administrador sem usar o código (útil para recuperar a senha) |
| `OPENAI_API_KEY` | Opcional | Liga o Copilot (chat com IA). Sem ela, o botão do Copilot não aparece |
| `DATABASE_SSL` | Opcional | `off`, `require` ou `verify`, só se o provedor pedir algo diferente do automático |

Salve. O Render faz um novo deploy sozinho. Em **Settings → Health Check Path**, use `/api/health`.

Quando o deploy terminar, abra `https://SEU-ENDERECO/api/health`. O esperado é `"database":"ok"`.

### 2.3 Primeiro acesso de administrador

1. No Render, abra **Logs** do serviço. Logo após iniciar, aparece um bloco assim:
   `Código de configuração do admin: ABCDE-FGHJK`
2. No site, role até o rodapé e clique em **Administração** (ou acesse `/admin`).
3. Informe o código, seu nome, e-mail e uma senha forte. Pronto: você entra no painel.

O código só existe enquanto não houver administrador e muda a cada reinício. Depois de criado o acesso, a tela passa a mostrar só o login.

**Esqueceu a senha?** Defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` no Render e faça um novo deploy: o acesso é atualizado com essa senha.

## 3. Cadastros

![Fluxo de cadastro e aprovação](img/fluxo-cadastro.png)

### 3.1 Cliente

Cria a conta em **Entrar → Criar conta** escolhendo "Cliente". A conta fica ativa na hora e já pode pedir orçamentos.

### 3.2 Profissional parceiro (chef, buffet)

Depois de criar o acesso, o painel abre direto no **cadastro obrigatório**. São exigidos:

- foto de perfil (logo ou foto pessoal);
- **pelo menos 5 fotos dos serviços** (até 20);
- CNPJ (com verificação dos dígitos), razão social, nome fantasia (opcional) e nome completo do responsável;
- telefone, endereço completo (o CEP preenche a rua automaticamente);
- categoria (Chef particular ou Buffet), especialidade, apresentação e valor "a partir de" (opcional);
- pelo menos uma rede social (Instagram, Facebook, TikTok, YouTube ou LinkedIn) e site opcional.

No site aparecem só nome fantasia, cidade/UF, fotos, apresentação, redes sociais e site. CNPJ, endereço completo e telefone ficam visíveis apenas para a administração.

### 3.3 Freelancer (cozinheiro, ajudante, garçom, barman)

O cadastro obrigatório pede:

- **currículo** em PDF ou foto (até 4,5 MB);
- nome completo, CPF, data de nascimento (18 anos ou mais) e celular;
- endereço completo;
- funções e resumo da experiência;
- **conta bancária e chave Pix**: titular, CPF/CNPJ do titular, banco, agência, conta, tipo de conta, tipo e valor da chave Pix.

### 3.4 Aprovação

Parceiros e freelancers ficam **em análise** até a administração aprovar. Enquanto isso, podem editar o cadastro, mas não enviam propostas, não publicam vagas e não se candidatam. Cada um pode atualizar o cadastro depois em **Painel → Perfil**.

## 4. Pagamento direto via Pix

![Fluxo de pagamento da diária](img/fluxo-pix.png)

Quando o parceiro aceita a candidatura de um freelancer, o painel do parceiro (Equipe / candidaturas) passa a mostrar a **chave Pix**, os dados bancários e o contato do freelancer, com botão para copiar a chave. O parceiro paga a diária direto ao freelancer. Antes de aceitar, o parceiro já consegue abrir o currículo de quem se candidatou.

A plataforma não intermedeia o dinheiro: não há cobrança automática, split nem retenção nesta versão.

## 5. Painel de administração

Acesso: link **Administração** no rodapé, ou `/admin`. No celular e no tablet, o menu abre pelo botão no canto superior esquerdo.

### 5.1 Visão geral
Números de usuários, cadastros em análise e pedidos de evento, com atalhos para as tarefas mais comuns.

### 5.2 Usuários e aprovações
Pesquise por nome, e-mail ou cidade e filtre por tipo e situação. Ao abrir um usuário você vê o cadastro completo: documentos, endereço, fotos, currículo, redes sociais e dados de pagamento. Ações disponíveis:

- **Aprovar** (ou reativar), **Suspender**, **Bloquear** e **Excluir**;
- marcar **VIP**, **Destaque no catálogo** e **Desconto %**;
- **Conceder bônus ou benefício** direto daquele usuário.

A etiqueta "Cadastro incompleto" avisa quem ainda não terminou o cadastro obrigatório.

### 5.3 Textos do site
Todos os textos principais ficam editáveis, separados por página: contato e marca, página inicial, quem somos, como funciona, para profissionais, vagas, rodapé, catálogo, textos legais e SEO (Google). Também é possível trocar o número do WhatsApp, ligar/desligar o botão do WhatsApp e ocultar os portfólios demonstrativos.

- Nos campos de título, **Enter quebra a linha**.
- Nos textos legais, uma linha começando com `## ` vira subtítulo; uma linha em branco separa parágrafos.
- Campos de foto têm o botão **Enviar imagem**.
- O link **original** ao lado do campo devolve o texto padrão.
- Clique em **Salvar e publicar**: a mudança aparece para os visitantes em até 15 segundos.

### 5.4 Imagens
Biblioteca para enviar várias imagens de uma vez, copiar o link e apagar. As fotos são reduzidas automaticamente no próprio aparelho antes do envio, para ficarem leves.

### 5.5 Promoções
Crie, edite, ligue/desligue e apague as campanhas da página inicial. Cada promoção tem etiqueta, título, texto, botão, mensagem pronta do WhatsApp, ocasião que já vem marcada no orçamento, imagem opcional e período (dia/mês de início e fim, repetindo todo ano). A etiqueta "No ar agora" mostra o que está aparecendo hoje. As 7 campanhas sazonais padrão já vêm cadastradas.

### 5.6 Bônus e benefícios
Conceda a qualquer usuário: bônus, crédito, desconto, VIP, destaque ou outro benefício, com valor em reais, percentual, descrição e validade opcional. O usuário vê os benefícios ativos no topo do próprio painel. Benefícios de VIP, destaque e desconto também ligam essas marcas no perfil.

### 5.7 Cupons
Crie códigos com percentual de desconto e cashback, ative/desative e apague.

### 5.8 Auditoria
Lista das ações administrativas e eventos importantes, com relatório em PDF.

### 5.9 Minha senha
Troca da senha do administrador.

## 6. Jornadas principais (resumo)

- **Cliente:** pede orçamento em 3 passos (ou envia o resumo pelo WhatsApp), recebe propostas no painel e aceita a escolhida.
- **Parceiro aprovado:** vê os pedidos no radar com nota de intenção (0–100), envia propostas, publica vagas de diária e escolhe a equipe.
- **Freelancer aprovado:** vê as vagas, se candidata e acompanha o status.
- **Todos:** contratos em PDF (minutas para revisão) e avaliações 360° depois do evento.

## 7. Segurança e privacidade

| Dado | Quem vê |
|---|---|
| Nome fantasia, cidade/UF, fotos, apresentação, redes sociais | Público (catálogo) |
| CNPJ, razão social, endereço, telefone do parceiro | Titular e administração |
| CPF, endereço do freelancer | Titular e administração |
| Currículo do freelancer | Titular, administração e parceiros cujas vagas ele se candidatou |
| Chave Pix e dados bancários | Titular, administração e o parceiro que aceitou a candidatura |

Senhas são guardadas com criptografia (scrypt), sessões usam token seguro (uma por conta), há limite de tentativas no login e o tipo real de cada arquivo enviado é conferido (só imagens e PDF). Arquivos com currículo nunca ficam públicos.

## 8. Celular, tablet e computador

Todo o site, o cadastro e os dois painéis se adaptam a três faixas de tela: celular (até 600 px), tablet (até 1024 px) e computador. Botões e campos têm área de toque confortável. O site também pode ser instalado como aplicativo (PWA): no Android, menu do Chrome → **Instalar aplicativo**; no iPhone, Safari → **Compartilhar → Adicionar à Tela de Início**.

## 9. Solução de problemas

- **`/api/health` mostra `"database":"missing"`**: falta a variável `DATABASE_URL` no Render.
- **`"database":"error"`**: a URL está errada ou o banco recusou a conexão. Veja a mensagem nos Logs (procure por "Falha ao preparar o banco"). Confira usuário, senha, host e porta.
- **Não encontro o código do administrador**: ele só aparece se ainda não houver administrador. Reinicie o serviço (Manual Deploy) e olhe os Logs logo no início.
- **Primeira abertura do site demora**: no plano grátis o Render "adormece" o serviço após um período sem visitas. Planos pagos ficam sempre ligados.
- **Fotos não enviam**: o limite é 4,5 MB por arquivo; fotos maiores são reduzidas automaticamente, mas PDFs não.
- **Freelancer não consegue se candidatar**: o cadastro precisa estar completo e aprovado.

## 10. Limitações desta versão

- Não há cobrança online, split, retenção ou emissão de nota fiscal: pagamentos são combinados e feitos direto entre as partes.
- O Copilot só funciona com `OPENAI_API_KEY` configurada (pago por uso na OpenAI).
- Contratos em PDF são minutas e precisam de revisão jurídica.
