# Implantação

O passo a passo completo está em `MANUAL-PLATAFORMA.md`, seção 2 (Render + MySQL externo + primeiro acesso de administrador).

Resumo técnico:

- Docker: o `Dockerfile` instala dependências, compila e inicia `dist/index.js`, escutando em `0.0.0.0:$PORT`.
- Na inicialização, o servidor aplica as migrações de `drizzle/` (drizzle-orm migrator), cadastra as promoções padrão uma única vez e, se não houver administrador, imprime nos logs um código de configuração para `/admin`.
- `DATABASE_URL` é lida e convertida em configuração do mysql2; SSL é ligado automaticamente para TiDB Cloud, Aiven, PlanetScale, Railway, Azure, AWS e DigitalOcean (ajuste com `DATABASE_SSL`).
- Arquivos enviados (até 4,5 MB) ficam na tabela `gc_media` e são servidos em `/api/gastro/media/:id`, com cache longo para imagens públicas e acesso restrito para currículos.
- Textos editáveis ficam em `gc_site_content`; promoções em `gc_promotions`; benefícios em `gc_user_benefits`; cadastro completo em `gc_profile_details`.
- O login Manus só é ativado se `MANUS_OAUTH_API_URL` existir; fora do Manus a plataforma usa somente o login próprio.
