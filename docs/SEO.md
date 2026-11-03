# Eventos Conecta: domínio e SEO

## 1. Apontar eventosconecta.com.br para o Render

1. No Render, abra o serviço → **Settings → Custom Domains → Add**. Adicione `eventosconecta.com.br` e `www.eventosconecta.com.br`.
2. O Render mostra os registros DNS. No **registro.br** → domínio → **DNS → Editar zona**, crie exatamente os registros indicados:
   - `eventosconecta.com.br` → registro **A** (ou ALIAS) com o IP que o Render informar;
   - `www` → registro **CNAME** para o endereço `...onrender.com` do serviço.
3. Espere o Render marcar o domínio como **Verified** e emitir o certificado (HTTPS).
4. Em **Environment**, defina `GASTRO_PUBLIC_ORIGIN=https://eventosconecta.com.br` e faça o deploy.
   A partir daí, quem abrir o endereço `.onrender.com` ou o `www` é redirecionado (301) para o domínio oficial. O Google passa a ver um único site.

## 2. Google Search Console (obrigatório para aparecer rápido)

1. Acesse https://search.google.com/search-console e adicione a propriedade **Prefixo do URL** `https://eventosconecta.com.br/`.
2. Escolha verificação por **Tag HTML**. Copie só o código de `content="..."` e cole em **Painel → Textos do site → SEO (Google) → Código de verificação**. Salve e clique em **Verificar**.
3. Em **Sitemaps**, envie `sitemap.xml`.
4. Em **Inspeção de URL**, peça indexação da página inicial, de `/servicos` e de `/trabalhe-como`.

## 3. Páginas criadas para o Google

| Público | Endereço | Exemplo |
|---|---|---|
| Quem contrata | `/servicos/<serviço>/<cidade>` | `/servicos/garcom-para-evento/campinas-sp` |
| Profissionais | `/trabalhe-como/<profissão>/<cidade>` | `/trabalhe-como/garcom-freelancer/campinas-sp` |

São 9 serviços e 9 profissões, cada um por cidade (≈350 páginas no sitemap). As cidades ficam em
**Painel → Textos do site → SEO (Google) → Cidades**, uma por linha (`Cidade/UF`).
Cada página tem título e descrição próprios, perguntas frequentes, dados estruturados (Service, FAQPage,
BreadcrumbList), links para cidades vizinhas e os profissionais reais daquela cidade.

## 4. O que mais faz subir no Google (fora do código)

- **Perfil da Empresa no Google** (Google Meu Negócio) com o site e a região de Campinas.
- **Avaliações reais**: cada perfil com avaliações ganha estrelas no Google.
- **Profissionais cadastrados por cidade**: página com profissionais reais ranqueia muito melhor que página vazia.
- **Links de outros sites**: Instagram, Facebook, grupos de eventos, fornecedores parceiros e blogs locais apontando para o site.
- Paciência: páginas novas costumam levar de semanas a alguns meses para chegar ao topo.
