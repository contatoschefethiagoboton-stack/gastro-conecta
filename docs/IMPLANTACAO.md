# GastroConecta — código e implantação

O projeto reúne site público responsivo, aplicativo web instalável (PWA) e painéis de cliente, fornecedor, freelancer e administrador. O PWA é o formato mobile aprovado: não há APK/IPA nem publicação em lojas.

## Executar o código

A versão usa Node.js, pnpm 10.18.0, React 19, TypeScript, Tailwind, Express e banco MySQL gerenciado com Drizzle. Execute `corepack enable`, `pnpm install --frozen-lockfile`, configure o banco via `DATABASE_URL`, aplique as migrações com `pnpm db:migrate` e inicie com `pnpm dev`. Para produção, `pnpm build` e `pnpm start`; o Dockerfile realiza instalação e compilação para o container. O listener usa `PORT`, padrão 3000, em `0.0.0.0`. A saúde do serviço fica em `/api/health`.

Não execute migrações destrutivas em banco existente. O banco gerenciado deste projeto é compartilhado entre desenvolvimento e publicação. Dados devem permanecer no banco, não no disco temporário do container.

## Contas e acesso

O cadastro público permite apenas cliente, fornecedor e freelancer. O administrador é o proprietário autenticado pela integração Manus, nunca o primeiro usuário nem uma opção do formulário. Use “Entrar como proprietário” na conta. A plataforma verifica o identificador de proprietário fornecido pela infraestrutura. Nenhuma conta administrativa ou senha padrão é criada.

Fornecedores ficam sujeitos à liberação administrativa. Uma aprovação não equivale à confirmação de pagamento. Não aprove solicitações como pagas sem comprovação e processamento real. Senhas próprias exigem pelo menos dez caracteres, maiúsculas, minúsculas, número e caractere especial; sessões usam tokens opacos validados no banco. Novos logins invalidam a sessão própria anterior.

## Funcionamento da versão

O catálogo inicial contém portfólios demonstrativos identificados, nomes fictícios e preços ilustrativos. Eles não representam fornecedores contratáveis, avaliações comprovadas ou selos de verificação. Pedidos enviados por clientes autenticados são dados reais, gravados no banco; profissionais elegíveis poderão apresentar propostas. A aceitação de proposta organiza o evento, mas não registra cobrança, depósito ou escrow.

Os cálculos financeiros usam centavos. Comissão prevista de eventos entre 8% e 12%, com 10% padrão. Para diárias, a taxa de 10% é acrescida ao valor do contratante, preservando 100% da diária ao freelancer. A tabela balizadora é um parâmetro de produto e precisa ser calibrada por função, duração, localidade e condições comerciais antes de operação.

Os PDFs de contratos são minutas geradas de dados da plataforma. Exigem revisão jurídica, concordância e assinatura das partes. A avaliação pós-evento depende de registro real de conclusão e de vínculos dos participantes; restrições não devem impedir exercício de direitos de privacidade e suporte.

## App instalável

Acesse a plataforma por HTTPS. No Android/Chrome, use o menu “Instalar aplicativo” ou “Adicionar à tela inicial”, quando disponibilizado pelo navegador. No iPhone/Safari, use Compartilhar e “Adicionar à Tela de Início”. O service worker fornece uma tela offline e não armazena APIs, contas, pagamentos nem dados privados. Operações requerem internet. A elegibilidade de instalação depende do navegador e contexto (o preview embutido pode não oferecer instalação).

## Integrações comerciais pendentes

Gateway Mercado Pago/Asaas: conta empresarial, credenciais privadas, onboarding dos recebedores, política de split, eventos de webhook autenticados/idempotentes, conciliação, estorno e regras de liberação de recursos. Retenção em garantia não deve ser afirmada como disponível sem validar a modalidade contratual e técnica com o prestador. O checkout atual recusa cobranças com mensagem clara enquanto não houver homologação.

Biometria/liveness: contratar provedor, configurar SDK, validar tokens no servidor e resultado de prova de vida, definir bases legais/consentimento e retenção. Não há coleta biométrica nesta entrega.

Meta e Google: as conexões da sessão Manus não são credenciais de execução do site. A aplicação exige permissões e credenciais próprias, autorização dos profissionais e políticas dos provedores. Não importar leads pessoais ou conteúdo privado sem autorização. Os portfólios atuais não fingem conexão às redes sociais.

Copilot: o chat chama IA no servidor usando o serviço fornecido pela infraestrutura. Em uma implantação externa, configure as credenciais do serviço de IA escolhido no ambiente do servidor. O modelo OpenAI GPT-4o não é presumido disponível; o catálogo atual da infraestrutura suporta `gpt-5-mini`. Nunca exponha a chave no frontend ou no repositório.

Emissão fiscal: contratar e homologar integração de NFS-e e definir regime tributário. Plataforma deve faturar a intermediação, e fornecedor o serviço, sujeito à revisão contábil aplicável. Não há emissão fiscal operacional automática nesta entrega.

## Antes de operação comercial

Configure domínio e `GASTRO_PUBLIC_ORIGIN` com a URL HTTPS pública real para canonical, sitemap e previews sociais. As páginas públicas possuem conteúdo inicial HTML e metadados; contas e painel não devem ser indexados. Não use domínio inventado ou host interno.

Disponibilize identificação legal do responsável, política LGPD definitiva, canais de suporte/direitos, termos revisados, cancelamento/reembolso, gestão de disputa e antifraude. A exclusão lógica administrativa não é eliminação integral de dados e não substitui um processo de atendimento LGPD.

Implemente e homologue os gateways antes de coletar pagamentos; realize revisão de segurança, isolamento por conta e gestão de incidentes. Termos que descrevem intermediação não eliminam por si só obrigações consumeristas, trabalhistas ou fiscais.

Código de aplicação separado em `client/`, `server/`, `shared/` e `drizzle/`. O contrato de API documentado está em `docs/api-contract.md`; o plano e as entregas verificadas ficam em `plan.md` e `TODO.md`.

## Notas da versão entregue

O catálogo combina exemplos identificados com profissionais reais elegíveis. Perfis reais sem fotografia mostram um marcador neutro, não um retrato fictício. Imagens editoriais utilizam caminhos do armazenamento gerenciado `/manus-storage/`; para hospedar este código fora da infraestrutura do projeto, transfira essas imagens para seu próprio armazenamento e atualize `shared/catalog.ts`.

O ambiente atual não fornece `OWNER_OPEN_ID`. Por isso o Super Admin permanece fechado até o usuário designar uma identidade Manus autenticada. “Entrar como proprietário” autentica a identidade, mas não concede papel administrativo por si só. Não use e-mail digitado em cadastro local ou a primeira conta como prova de propriedade. O vínculo de proprietário pode ser definido por identificador verificado na configuração de servidor, seguindo a autorização explícita do responsável.

Fornecedores devem ser liberados antes de apresentar propostas ou publicar vagas. O vínculo entre um pedido e o profissional preferido, a escolha de uma candidatura e a conclusão de evento/vaga devem permanecer registrados no banco; aceitar uma proposta ou candidatura não significa que pagamento foi realizado.
