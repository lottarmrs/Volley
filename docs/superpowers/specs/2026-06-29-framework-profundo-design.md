# Framework profundo - produto e arquitetura

Data: 2026-06-29  
Projeto: Volley / Panelinha Team Balancer  
Status: design aprovado em conversa, aguardando revisao do usuario antes do plano de implementacao

## Contexto

O projeto nasceu com forte impulso de frontend e depois recebeu backend, Supabase e sincronizacao em nuvem. A auditoria anterior encontrou bons fundamentos, mas tambem riscos que precisam ser tratados antes de expandir o produto:

- `npm run lint` falha por erros TypeScript em `syncService.ts`.
- `npm run lint:eslint -- --quiet` falha por um `prefer-const`.
- Falhas parciais de sync podem ser registradas apenas em `console.error`, sem virar estado de produto.
- Alguns caminhos de bulk upload podem omitir itens falhos do resultado e causar risco de perda local depois do merge.
- O README referencia uma migration que nao existe.
- Ha policy de `UPDATE` em Storage sem `WITH CHECK`.
- Ha bug de data local vs UTC em criacao de sessoes/torneios.
- O app ja tem testes relevantes, mas ainda falta uma definicao de gates para release.

A reforma deve ser profunda, mas sequenciada para proteger dados. A ordem aprovada e:

1. Confiabilidade primeiro.
2. Produto escalavel depois.
3. Experiencia/UI por ultimo.

Mesmo com UX por ultimo na ordem macro, cada fase deve validar ao menos um fluxo real de usuario para evitar regressao invisivel.

## Objetivos

Criar um framework interno para evoluir produto e arquitetura juntos:

- Separar UI, casos de uso, dominio, sync, storage local, storage cloud e Supabase.
- Reduzir regra de negocio escondida em componentes React.
- Tornar sync local-first previsivel, recuperavel e observavel.
- Definir um modelo de dominio capaz de suportar comunidades, papeis, atletas vinculados ou nao a contas, sessoes, jogos, rankings e auditoria.
- Adotar bibliotecas somente quando elas resolverem uma responsabilidade clara.
- Definir gates de verificacao antes de fechar cada fase.

## Nao objetivos

- Nao reescrever o produto inteiro de uma vez.
- Nao trocar bibliotecas por moda ou estetica.
- Nao migrar de Supabase sem uma razao operacional forte.
- Nao redesenhar UI antes de estabilizar contratos de dominio e dados.
- Nao usar `build` como substituto de typecheck.

## Abordagem escolhida

A abordagem escolhida e uma reforma de plataforma com protecao incremental:

- Usar uma arquitetura alvo mais limpa.
- Trabalhar por fases pequenas o bastante para verificar.
- Fechar cada fase com testes, typecheck, fluxo real e decisao documentada.
- Aceitar refatoracao profunda apenas quando ela reduz risco de dados, acoplamento ou ambiguidade de produto.
- Usar os roadmaps `backend.pdf` e `system-design.pdf` como criterios globais da reestruturacao completa do app, atravessando backend, dominio, sync, armazenamento local, navegacao, frontend e operacao.

### Como aplicar os roadmaps

Os roadmaps entram como filtros de decisao para cada fase, nao como uma lista para adicionar bibliotecas ou complexidade sem necessidade.

- Backend: contratos de dados, auth, seguranca, cache, APIs, migrations, testes, boundaries e evolucao para DDD.
- System design: consistencia, disponibilidade, idempotencia, filas/outbox quando necessario, retries, observabilidade, sharding/replicacao apenas como preparo conceitual, nao como implementacao imediata.
- Produto: cada melhoria tecnica precisa preservar ou melhorar uma jornada real do Panelinha.
- Frontend: a experiencia final deve nascer de View Models e estados confiaveis, nao de componentes tentando deduzir dados brutos.
- Operacao: toda decisao critica precisa ter gate de verificacao e caminho de rollback/migracao quando envolver dados.

## Arquitetura alvo

As camadas alvo sao:

```text
Produto / jornadas
  -> UI e View Models
  -> Aplicacao: commands, queries, validacoes e casos de uso
  -> Dominio: entidades, invariantes e regras de negocio
  -> Sync Engine: outbox, pull, push, merge, conflitos e retries
  -> Storage Adapters: local store e cloud store
  -> Supabase/Postgres: RLS, constraints, indices, RPCs e migrations
```

### Produto / jornadas

Representa o que o usuario tenta fazer:

- Criar conta e sincronizar.
- Criar ou entrar em comunidade.
- Organizar presenca semanal.
- Cadastrar ou avaliar atletas.
- Montar times.
- Rodar uma sessao ao vivo.
- Fechar resultados.
- Ver historico e ranking.

### UI e View Models

Componentes nao devem conhecer detalhes de Supabase, localStorage ou regras de merge.

Responsabilidades:

- Renderizar estados prontos para tela.
- Enviar intencoes para commands.
- Mostrar estados como `salvo`, `pendente`, `sincronizando`, `parcial`, `conflito` e `erro recuperavel`.
- Manter acessibilidade e navegacao previsivel.

### Aplicacao

Camada de casos de uso.

Responsabilidades:

- Commands: criar sessao, editar atleta, registrar ponto, convidar membro, sincronizar.
- Queries: dashboard, elenco, historico, status da nuvem, status de comunidade.
- Validacoes de entrada e permissao visual.
- Orquestracao entre dominio, repositorios e sync.

### Dominio

Camada de regras puras sempre que possivel.

Responsabilidades:

- Regras de comunidade.
- Regras de membros e papeis.
- Regras de atleta, vinculo, avaliacao e dedupe.
- Regras de presenca.
- Regras de sessao, times, jogos, pontos e fechamento.
- Calculo ou preparacao de estatisticas derivadas.

### Sync Engine

O primeiro modulo tecnico da reforma deve ser o Sync/Data Reliability Framework.

Responsabilidades:

- Outbox local.
- Pull e push.
- Merge.
- Resolucao ou marcacao de conflitos.
- Retry e backoff.
- Falhas parciais visiveis.
- Garantia de que item falho permanece local e pendente.
- Eventos/Issues que a UI consegue exibir.

### Storage Adapters

Interfaces independentes de tecnologia:

- `LocalStore`: persistencia local, snapshots, outbox, migration local.
- `CloudStore`: chamadas Supabase, mappers, upserts, RPCs e leitura autenticada.
- `Clock`: data local consistente.
- `IdGenerator`: ids previsiveis para testes.
- `Logger`: erros tecnicos e eventos auditaveis.

### Supabase/Postgres

Supabase continua sendo a camada cloud autoritativa quando o usuario escolhe nuvem.

Regras:

- Toda tabela exposta precisa de RLS.
- Policies devem expressar autorizacao real, nao apenas `TO authenticated`.
- Updates sensiveis devem ter `USING` e `WITH CHECK`.
- Colunas usadas em RLS e FKs devem ter indices adequados.
- RPCs `SECURITY DEFINER` devem ser excecao, com `search_path`, checagem de identidade e grants revisados.
- Migrations devem ser documentadas e verificaveis.
- Antes de implementar mudancas Supabase, consultar changelog/docs atuais.

## Modulos de produto

O framework deve organizar o produto nestes modulos:

1. Identidade, conta e perfil.
2. Comunidades, membros e papeis.
3. Atletas, vinculos e avaliacoes.
4. Presenca e organizacao semanal.
5. Sessoes, times, jogos e placar.
6. Historico, rankings e estatisticas.
7. WhatsApp, comunicacao e listas.
8. Nuvem, sync, backup e recuperacao.
9. Administracao, auditoria e seguranca.
10. Design system, navegacao e acessibilidade.

## Modelo de dominio

Entidades canonicas:

- `Profile`: conta autenticada, nome, email e role global.
- `Community`: espaco organizacional com regras, visibilidade e donos.
- `Membership`: usuario dentro de comunidade, papel local, permissoes e status.
- `Player`: atleta do elenco; pode existir sem conta.
- `PlayerLink`: proposta/aprovacao de vinculo entre conta e atleta.
- `Attendance`: presenca, fila, confirmacao, convidado e disponibilidade.
- `Session`: encontro jogavel, com snapshot das regras efetivas.
- `MatchEvent`: pontos, sets, resultados e relatorios operacionais.
- `Ranking/Stats`: projecoes derivadas e recalculaveis.
- `Audit/Sync`: mudancas, origem, dispositivo, pendencias e conflitos.

Regras de produto:

- Papel global nao substitui papel dentro da comunidade.
- Atleta pode ser local, comunitario ou vinculado a conta.
- Sessao deve guardar snapshot das regras usadas naquele dia.
- Ranking e estatisticas sao derivados, nao fonte primaria.
- Operacao offline nao deve depender de login imediato.
- Dados de perfil compartilhados, como email, precisam de decisao explicita de privacidade.

## Fases

### Fase 0 - Mapa e travas de qualidade

Objetivo: estabilizar o chao antes de refatorar.

Escopo:

- Corrigir typecheck.
- Corrigir erro ESLint bloqueante.
- Documentar migrations reais e corrigir README.
- Definir comandos obrigatorios de verificacao.
- Listar fluxos essenciais que nao podem quebrar.
- Registrar decisoes de arquitetura em docs.

Fluxos de validacao:

- Abrir dashboard.
- Criar sessao.
- Entrar em Nuvem & Conta.
- Executar testes unitarios e UI.

Gate:

- `npm run lint` passa.
- `npm run lint:eslint -- --quiet` passa.
- `npm run test:unit` passa.
- `npm run test:ui` passa.
- `npm run build` passa.

### Fase 1 - Confiabilidade de dados

Objetivo: transformar sync em um framework confiavel.

Escopo:

- Corrigir falhas silenciosas de bulk sync.
- Garantir que item falho continue local e pendente.
- Fazer `onIssue` ou equivalente cobrir falhas parciais.
- Corrigir bug de data local vs UTC.
- Revisar RLS/Storage policies com foco em `WITH CHECK`.
- Revisar README/migrations/provisionamento Supabase.
- Definir status de sync consumivel pela UI.

Interfaces:

- `SyncGateway`.
- `SyncIssue`.
- `SyncStatus`.
- `LocalRepository`.
- `CloudRepository`.
- `OutboxEntry`.

Bibliotecas candidatas:

- Zod para validar payloads, import/export e fronteiras cloud/local.
- Dexie para avaliar uma migracao futura de localStorage para IndexedDB.
- XState apenas se o fluxo de sync ficar dificil de representar com estados simples.

Gate:

- Testes de regressao para falha parcial.
- Testes de merge e dedupe continuam passando.
- Fluxo local-first funciona sem Supabase.
- Fluxo com Supabase mostra status parcial quando houver erro.
- Nenhuma falha parcial vira sucesso silencioso.

### Fase 2 - Modelo de dominio

Objetivo: dar nomes e fronteiras estaveis ao produto.

Escopo:

- Separar entidades canonicas e relacoes.
- Definir papel global vs papel local.
- Definir atleta sem conta, atleta vinculado e proposta de vinculo.
- Definir snapshot de regras de sessao.
- Definir quais dados sao fonte primaria e quais sao derivados.

Interfaces:

- `CommunityModule`.
- `RosterModule`.
- `AttendanceModule`.
- `SessionModule`.
- `StatsModule`.
- `AccountCloudModule`.

Gate:

- Documento de dominio revisado.
- Testes de regras puras para invariantes principais.
- Nenhum componente novo acessa Supabase diretamente.
- Novas regras passam por commands/queries.

### Fase 3 - Camada de aplicacao

Objetivo: tirar regra de negocio de componentes e centralizar casos de uso.

Escopo:

- Criar padrao de commands e queries.
- Criar View Models para telas principais.
- Substituir chamadas diretas de servico em componentes de maior risco.
- Padronizar erros de produto vs erros tecnicos.

Bibliotecas candidatas:

- TanStack Query para server/cloud state, cache, invalidacao e mutations, se o estado cloud ficar espalhado.
- Zod para inputs/outputs dos commands.
- Testing Library e Vitest para comportamento de hooks e componentes.

Gate:

- Pelo menos um fluxo critico convertido para command/query.
- Testes cobrindo sucesso, erro recuperavel e permissao negada.
- UI renderiza View Model, nao estrutura bruta de Supabase.

### Fase 4 - Produto escalavel

Objetivo: transformar a base em plataforma de comunidades.

Escopo:

- Comunidades e membros.
- Convites e visibilidade.
- Perfis e privacidade.
- Operacao semanal.
- Historico e rankings.
- Auditoria administrativa.
- Modulos coerentes de comunicacao/WhatsApp.

Gate:

- Fluxos de dono, organizador e atleta definidos.
- RBAC local e global revisado.
- Dados sensiveis com decisao de visibilidade.
- Ranking e historico derivados de eventos ou fontes primarias claras.

### Fase 5 - Experiencia e interface

Objetivo: redesenhar UX em cima de dominio e View Models estaveis.

Shell proposto:

- Home operacional.
- Comunidade.
- Elenco.
- Organizar.
- Ao vivo.
- Historico.
- Nuvem e conta.
- Administracao.

Principios:

- Fluxos de jogo devem ser rapidos, escaneaveis e resistentes a erro.
- Estados de sync precisam ser visiveis, sem assustar o usuario comum.
- Mobile prioriza acao semanal: confirmar, montar time, pontuar.
- Desktop pode ser mais denso para administracao e historico.
- Acessibilidade: botoes nomeados, foco, contraste e texto legivel.
- A direcao visual deve trabalhar com esqueuomorfismo funcional: elementos inspirados em objetos reais do volei e da organizacao de jogo, como quadra, placar, prancheta, cartoes, fichas de atleta e listas de chamada.
- O esqueuomorfismo deve ajudar orientacao, hierarquia e manipulacao direta, nao virar decoracao pesada ou nostalgia gratuita.

Direcao esqueuomorfica:

- `Ao vivo`: placar com presenca fisica, sets como painel de jogo e eventos com sensacao de mesa de controle.
- `Organizar`: prancheta/lista de chamada, fila de presenca e montagem de times com manipulacao clara.
- `Elenco`: fichas de atleta, atributos visuais e estados de disponibilidade como marcadores legiveis.
- `Historico`: sumulas, cartoes de partida e linha do tempo com aparencia de registro esportivo.
- `Nuvem e conta`: status de sync como painel de saude/backup, sem esconder erro tecnico em texto pequeno.
- `Administracao`: area mais contida e operacional, com menos textura e mais densidade.

Limites:

- Preservar performance e responsividade em mobile.
- Nao usar textura, sombra ou profundidade se piorar leitura.
- Manter contraste, foco visivel e nomes acessiveis.
- Preferir icones reais da biblioteca ja adotada quando eles comunicarem melhor que ornamentos.
- Validar visualmente com screenshots antes/depois nas telas principais.

Gate:

- Capturas desktop/mobile antes e depois.
- Playwright para fluxos reais de maior risco.
- Testes UI para hooks/componentes que carregam estado critico.
- Revisao de acessibilidade basica.
- Nenhum texto estoura container em mobile.
- A linguagem esqueuomorfica melhora compreensao do fluxo sem reduzir legibilidade, acessibilidade ou velocidade de acao.

## Bibliotecas candidatas

### Zod

Usar quando houver fronteira de dados:

- Import/export.
- Payload local/cloud.
- Resposta de Supabase antes de entrar no dominio.
- Inputs de commands.

Nao usar para substituir tipos TypeScript internos simples sem necessidade.

### TanStack Query

Usar se a app passar a ter server/cloud state espalhado:

- Cache de queries Supabase.
- Invalidacao apos mutations.
- Estados de loading/error/retry em leituras cloud.

Nao usar para estado puramente local de jogo ao vivo se isso deixar o fluxo mais opaco.

### Dexie

Avaliar para IndexedDB quando localStorage virar gargalo:

- Dados grandes.
- Outbox.
- Indices locais.
- Migrations locais.
- Recuperacao melhor.

Nao migrar antes de haver plano de backup, migracao e rollback.

### XState

Usar somente em fluxos com muitos estados e transicoes:

- Sync engine.
- Wizard complexo.
- Sessao ao vivo.

Nao usar para formularios ou estados triviais.

### Testing Library, Vitest e Playwright

Manter:

- Vitest/Testing Library para hooks e componentes.
- Node test runner para logica pura existente.
- Playwright como candidato para fluxos reais desktop/mobile e regressao visual.

## Definicao de pronto por fase

Uma fase so fecha quando:

- A melhoria arquitetural esta documentada.
- Um fluxo real do produto foi preservado ou melhorado.
- Risco de dados foi coberto por teste ou decisao explicita.
- Typecheck e testes relevantes passam.
- Supabase/RLS/migrations foram revisados quando aplicavel.
- Bibliotecas adotadas ou recusadas foram justificadas.
- A UI mostra estados importantes ao usuario, principalmente em sync.
- Mudancas de experiencia respeitam a direcao de esqueuomorfismo funcional aprovada para a interface.

## Riscos

- Reforma profunda demais pode travar entregas visiveis.
- Migrar persistencia local cedo demais pode criar risco de perda de dados.
- Adotar bibliotecas antes de estabilizar contratos pode aumentar complexidade.
- Supabase policies podem parecer corretas mas falhar em casos reais de RLS, grants ou Data API.
- UX pode mascarar falhas de dados se status parcial nao for parte do modelo.

Mitigacao:

- Trabalhar por fases verificaveis.
- Manter local-first funcionando sempre.
- Escrever regressao antes de corrigir bugs criticos.
- Testar fluxos reais depois de cada fase.
- Registrar decisoes e limites da fase.

## Fontes e referencias

- Auditoria local: `audit-output/2026-06-28-full-audit/REPORT.md`.
- Roadmap de backend fornecido pelo usuario: `C:/Users/Matheus Silva/Downloads/backend.pdf`.
- Roadmap de system design fornecido pelo usuario: `C:/Users/Matheus Silva/Downloads/system-design.pdf`.
- Supabase changelog oficial: https://supabase.com/changelog.md.
- Supabase security/RLS guidance: skill local `supabase`.
- Supabase Postgres best practices: skill local `supabase-postgres-best-practices`.
- TanStack Query docs: https://tanstack.com/query/latest/docs/framework/react/overview.
- Zod docs: https://zod.dev.
- Dexie docs: https://dexie.org/docs.
- XState docs: https://stately.ai/docs.
- Playwright docs: https://playwright.dev/docs/intro.
- Testing Library docs: https://testing-library.com/docs/react-testing-library/intro.

## Proximo passo

Depois da revisao e aprovacao deste documento pelo usuario, a proxima etapa e criar um plano de implementacao com `superpowers:writing-plans`, comecando pela Fase 0 e pela Fase 1.
