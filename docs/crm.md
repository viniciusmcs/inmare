# CRM imobiliário Inmare

## Escopo desta fase

O CRM é um módulo privado do painel React e usa a mesma API Django e o mesmo PostgreSQL da plataforma. As regras de negócio permanecem no backend e nenhuma informação do CRM é publicada pela API pública.

Entregas do núcleo:

- cadastro único de pessoas físicas e jurídicas, com detecção de duplicidade por CPF/CNPJ, telefone e e-mail;
- classificação de contatos como proprietário, comprador, vendedor, investidor ou parceiro;
- vínculo entre contato e imóvel cadastrado ou unidade externa ainda não cadastrada;
- funil de oportunidades;
- agenda de tarefas, follow-ups e visitas;
- linha do tempo auditável;
- propostas versionadas com entrada, financiamento, parcelas, reforços e dações;
- importação de CSV e PDF em quarentena;
- saneamento, revisão, identificação de duplicidades e confirmação transacional;
- conversão automática dos formulários públicos em contato e oportunidade do CRM.
- permissões por carteira, com perfis de administrador, gestor comercial e corretor;
- central de avisos internos para atribuições, tarefas próximas e tarefas atrasadas;
- relatórios por período, funil, origem, conversão, valores, motivos de perda e desempenho por corretor.

## Perfis e acesso

- **Administrador:** administra site, CRM, importações, equipe e acessos.
- **Gestor comercial:** enxerga todo o CRM e as importações, acompanha relatórios consolidados e pode distribuir a operação entre corretores; não administra o site.
- **Corretor:** enxerga somente contatos, oportunidades, tarefas, propostas, histórico, relatórios e avisos da própria carteira.

O isolamento é aplicado nas consultas e gravações da API. Ocultar uma opção na interface não é usado como mecanismo de segurança.

## Avisos e relatórios

Os avisos desta fase são exclusivamente internos ao painel. Eles são gerados quando uma tarefa ou oportunidade é atribuída e quando uma tarefa entra na janela de 24 horas ou fica atrasada. Não existe envio por WhatsApp nesta fase.

Os relatórios permitem filtrar até 367 dias e apresentam novos contatos, oportunidades, conversão, vendas ganhas e perdidas, pipeline, volume fechado, ciclo médio, visitas, propostas, tarefas atrasadas, origens, motivos de perda e desempenho individual. O corretor recebe somente seus números; gestores e administradores recebem a visão consolidada.

## Importação

O upload aceita CSV ou PDF de até 15 MB. O arquivo original é armazenado em `quarantine/crm-imports/` e não é modificado. O hash SHA-256 identifica arquivos repetidos para auditoria, mas o mesmo arquivo pode ser reenviado. Cada reenvio passa por uma nova revisão e os contatos já existentes são marcados como duplicados, sem novo cadastro.

Fluxo:

1. validar extensão, MIME/assinatura e tamanho do arquivo;
2. extrair os registros para `CRMImportRow`;
3. normalizar nome, CPF/CNPJ, telefone, e-mail, CEP e UF;
4. marcar cada linha como pronta, possível duplicidade ou erro;
5. permitir correção, vínculo com imóvel, descarte individual ou a ação “Ignorar todos os inválidos” durante a revisão;
6. bloquear a confirmação enquanto houver erro não revisado;
7. criar somente contatos novos e registrar os vínculos em uma transação atômica; duplicados não são atualizados nem contabilizados como importados;
8. preservar a origem e gerar eventos de auditoria.

O parser de PDF reconhece o formato do relatório Riviera fornecido pelo cliente. Para novas origens recorrentes, prefira CSV com cabeçalhos claros.

## Endpoints privados

Todos exigem usuário administrador:

- `/api/v1/admin/crm/contacts/`
- `/api/v1/admin/crm/property-links/`
- `/api/v1/admin/crm/opportunities/`
- `/api/v1/admin/crm/tasks/`
- `/api/v1/admin/crm/activities/`
- `/api/v1/admin/crm/proposals/`
- `/api/v1/admin/crm/imports/`
- `/api/v1/admin/crm/import-rows/`
- `/api/v1/admin/crm/notifications/`
- `/api/v1/admin/crm/reports/`

## Sequência futura acordada

1. estabilizar e validar o CRM com a rotina real da imobiliária;
2. implementar a publicação e o retorno de leads de OLX, ZAP, Viva Real, Imovelweb e Instagram;
3. implementar a captura da comunidade pelo WhatsApp/Evolution API/n8n, sempre criando material pré-aprovado para revisão humana no painel.

Os portais receberão imóveis, não a base de contatos do CRM. Leads retornados pelos portais serão deduplicados e vinculados ao anúncio, imóvel e corretor responsável.

## Implantação

Antes de subir a nova aplicação:

```bash
python manage.py migrate
python manage.py check
pytest
```

A dependência `pypdf` precisa estar presente na imagem do backend para leitura dos PDFs.
