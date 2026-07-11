# In Mare Negócios Imobiliários

Plataforma imobiliária com site público, painel administrativo, API REST, importação idempotente de pastas e proteção explícita de dados privados.

## Subir localmente

1. Inicie o Docker Desktop.
2. Copie `.env.example` para `.env` e altere segredos.
3. Execute `docker compose up --build`.
4. Site: `http://localhost:5173`; proxy integrado: `http://localhost:8088`; API: `http://localhost:8000`; Swagger: `http://localhost:8000/api/docs/`; Mailpit: `http://localhost:8025`.

O comando inicial executa migrations, configura o administrador local e importa `../CASA NA MARINA` como rascunho.

Credenciais temporárias de desenvolvimento:

- Painel e Django Admin: usuário `admin`, senha `admin`.
- PostgreSQL: usuário `inmare`, senha `admin`.
- MinIO: usuário `admin`, senha `adminadmin` (o MinIO exige no mínimo 8 caracteres).

## Fluxos centrais

- A API pública retorna somente imóveis publicados, visíveis, não arquivados e disponíveis/reservados.
- A busca pública oferece filtros rápidos e avançados por localização, preço, dormitórios, suítes, código e texto.
- A listagem pública usa 20 imóveis por página, filtros avançados em modal, contagem de resultados e barra fixa durante a navegação.
- Favoritos são armazenados no navegador do visitante, sem exigir cadastro.
- Cada imóvel possui uma página completa em nova aba, com galeria, custos opcionais, localização aproximada no Google Maps e imóveis similares.
- Banners da Home, depoimentos, perguntas frequentes e redes sociais podem ser administrados em `Conteúdo e redes`.
- O site oferece lançamentos automáticos, imóveis similares, compartilhamento, impressão/ficha PDF e consentimento LGPD.
- Lançamentos priorizam imóveis dos últimos 7 dias, completam com os mais recentes quando necessário e exibem no máximo 10 imóveis.
- Os formulários de contato, procura personalizada e anúncio de imóvel alimentam a gestão de clientes com origem identificada.
- O WhatsApp institucional exibido no contato é lido da configuração estruturada `SiteSettings`.
- Publicação exige descrição, dados comerciais, revisão confirmada e imagem principal validada.
- Importações usam hash, nunca alteram a origem e sempre criam rascunhos.
- Endereço exato, comissão, telefone privado e observações internas nunca são serializados publicamente.
- O mapa público usa somente coordenadas aproximadas ou bairro/cidade; o endereço privado permanece restrito ao painel.

## Comandos

```bash
docker compose run --rm backend python manage.py makemigrations --check
docker compose run --rm backend pytest
docker compose run --rm frontend npm test
docker compose run --rm frontend npm run build
docker compose run --rm backend python manage.py seed_demo
```

## Produção

Use TLS, firewall, backups externos, monitoramento, CDN/Cloudflare e segredos gerenciados. Configure `DEBUG=false`, hosts/origens explícitos, cookies seguros e storage S3 compatível. O Nginx incluído é uma base e deve receber certificado e limites adequados à infraestrutura.

## Limitações atuais

- O endpoint administrativo aceita pasta montada ou ZIP protegido; a seleção visual da pasta ainda deve ser conectada ao botão do painel.
- Arquivos validados usam storage local do Django nesta entrega. A infraestrutura MinIO está disponível, mas a troca para S3/MinIO deve ser concluída antes de produção.
- O painel próprio cobre dashboard e listagem; edições avançadas ainda são realizadas pelo Django Admin/API.
- O mapa OpenStreetMap, bloqueio persistente após tentativas excessivas e rotação automática do refresh token devem ser concluídos antes de produção.
