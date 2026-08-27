# Produto escalavel - fechamento

> Objetivo: fechar a fase "Produto escalavel" sem iniciar "Experiencia / Interface".

## Escopo

- Separar contratos de dados restantes em arquivos de dominio, mantendo `src/types.ts` como barrel de compatibilidade.
- Reduzir pontos de acoplamento do shell da aplicacao sem alterar layout, textos ou experiencia.
- Preparar o build para crescimento com chunks previsiveis.
- Adicionar guardrails para impedir regressao arquitetural.
- Usar os roadmaps `backend.pdf` e `system-design.pdf` como criterios transversais para toda a reestruturacao, nao apenas para Cloud Sync.
- Validar com lint, testes e build.

## Criterios transversais dos roadmaps

Os PDFs de backend e system design devem orientar todas as proximas fatias da fase "Produto escalavel". Eles nao significam reescrever o app para microservicos ou adicionar infraestrutura pesada agora; significam aplicar os principios certos no tamanho atual do Panelinha.

- HTTP/API boundaries: qualquer fronteira com Supabase ou servico externo deve ter contrato claro, tratamento de erro e resultado de produto.
- Auth/RBAC/security: papel global, papel local, policies, RPCs e dados sensiveis precisam continuar passando por commands/queries e testes de permissao.
- Database design: migrations, indices, constraints, RLS e dedupe devem ser tratados como parte do produto, nao como detalhe separado.
- Consistency/idempotency: operacoes de sync, reparo, import/export e dedupe precisam poder rodar mais de uma vez sem corromper dados.
- Async/retry/back pressure: falhas recuperaveis devem virar estado observavel; retries nao podem criar tempestade de sync nem apagar pendencias locais.
- Caching/local-first: cache local e dados cloud precisam ter dono, validade e regra de merge explicitos.
- Observability/health: areas criticas devem expor status, issues e sinais de recuperacao para a camada de produto.
- Modularity/DDD: telas e hooks devem encolher; regras de negocio devem migrar para application/domain/logic com testes.
- Testing/release gates: cada fatia deve ter teste de regressao adequado, typecheck, build e, quando tocar fluxo de usuario, teste de UI.

## Fora de escopo

- Mudancas visuais.
- Esqueumorfismo.
- Redesign de fluxos.
- Novas funcionalidades de produto.

## Fases de execucao

1. Guardrails de escalabilidade
   - Testar aliases de tipos por dominio.
   - Testar existencia de estrategia de chunks no Vite.

2. Contratos por dominio
   - Extrair tipos de jogador para `src/shared/types/player.ts`.
   - Extrair tipos de sessao/jogo/relatorio/balanceamento para `src/shared/types/session.ts`.
   - Manter `src/types.ts` exportando tudo para compatibilidade.

3. Build escalavel
   - Configurar `manualChunks` para separar React, Supabase, animacao/graficos e vendor.
   - Manter o comportamento runtime sem mudancas de UI.

4. Verificacao final
   - Rodar testes unitarios.
   - Rodar testes de UI.
   - Rodar typecheck.
   - Rodar build.

5. Roadmap alignment por area restante
   - App Views & Navigation: separar navegacao, shell e view models usando contratos claros de pagina/modulo.
   - Player transversal: reduzir acoplamento com um modulo de dominio/queries para atleta, vinculo, avaliacao e apresentacao.
   - Local Presence Management: manter seletores e mutacoes em application/domain, deixando hook como adaptador local-first.
   - Cloud Health & Sync: evoluir status, issues e payloads como fronteira confiavel e idempotente.

## Criterios de conclusao

- `src/types.ts` deixa de ser o arquivo fonte principal dos grandes contratos de produto.
- Aliases diretos para `@shared/types/player` e `@shared/types/session` funcionam.
- Build usa chunks nomeados para dependencias grandes.
- Checks passam sem depender de alteracoes visuais.
- Cada fatia restante explicita qual criterio dos roadmaps esta atendendo.
- Parar antes da fase "Experiencia / Interface".
