# Produto escalavel - fechamento

> Objetivo: fechar a fase "Produto escalavel" sem iniciar "Experiencia / Interface".

## Escopo

- Separar contratos de dados restantes em arquivos de dominio, mantendo `src/types.ts` como barrel de compatibilidade.
- Reduzir pontos de acoplamento do shell da aplicacao sem alterar layout, textos ou experiencia.
- Preparar o build para crescimento com chunks previsiveis.
- Adicionar guardrails para impedir regressao arquitetural.
- Validar com lint, testes e build.

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

## Criterios de conclusao

- `src/types.ts` deixa de ser o arquivo fonte principal dos grandes contratos de produto.
- Aliases diretos para `@shared/types/player` e `@shared/types/session` funcionam.
- Build usa chunks nomeados para dependencias grandes.
- Checks passam sem depender de alteracoes visuais.
- Parar antes da fase "Experiencia / Interface".
