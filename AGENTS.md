# AGENTS.md

## Regras de engenharia
- Leia o código existente antes de alterar.
- Faça mudanças pequenas, coesas e testáveis.
- Não altere arquivos fora do escopo nem os materiais originais em `../CASA NA MARINA` e `../imobiliaria-logo-imagens`.
- Não considere uma tarefa concluída sem testes, lint e análise de tipos aplicáveis.
- Mantenha regras de negócio no backend; views e serializers devem permanecer pequenos.
- Use transações atômicas, migrations, `Decimal`, timezone, constraints e índices.
- Evite N+1 com `select_related` e `prefetch_related`.

## Segurança e privacidade
- Nunca confie no frontend; valide e autorize no backend.
- Nunca exponha endereço exato, comissão, telefone privado ou observações internas na API pública.
- Não use SQL concatenado, `dangerouslySetInnerHTML`, tokens em localStorage ou segredos versionados.
- Trate uploads como maliciosos: valide extensão, MIME, assinatura, tamanho, hash e caminho.
- Importe sempre para quarentena e nunca modifique os arquivos de origem.
- Colete e registre apenas dados pessoais necessários.

## Qualidade
- Teste permissões, regras de publicação, separação público/privado e regressões.
- Não remova testes para fazer o pipeline passar.
- Atualize documentação e `.env.example` quando necessário.
