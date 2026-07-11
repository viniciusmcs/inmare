# Arquitetura e operação

## Limites de confiança

- O navegador acessa somente serializers públicos ou endpoints administrativos autenticados.
- O backend concentra regras de publicação, visibilidade, importação e auditoria.
- PostgreSQL mantém dados estruturados; Redis coordena Celery; arquivos validados são copiados para o storage sem alterar a origem.
- Importações começam como rascunho e exigem confirmação comercial explícita.

## Segurança

- JWT é mantido em cookies HttpOnly; logout adiciona o refresh token à blacklist.
- Login e leads possuem throttling. CORS, CSRF trusted origins, `X-Frame-Options` e `nosniff` são configuráveis por ambiente.
- ZIPs são verificados contra path traversal, excesso de arquivos, tamanho descompactado, arquivos grandes, formatos inesperados e taxa de compressão suspeita.
- A API pública usa serializer dedicado e nunca inclui endereço privado, comissão ou observações internas.

## Produção

- Use `DEBUG=false`, segredos externos, TLS, hosts e origens explícitos.
- Substitua o storage local por S3 compatível e execute os containers como usuário não privilegiado.
- Configure backups testados de PostgreSQL e storage, monitoramento, firewall e CDN/WAF.
- O proxy Nginx incluído é uma base de desenvolvimento e deve receber certificados e políticas operacionais da infraestrutura final.
