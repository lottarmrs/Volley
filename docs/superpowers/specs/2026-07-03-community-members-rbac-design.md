# Community Members RBAC Design

Data: 2026-07-03
Projeto: Volley / Panelinha Team Balancer
Status: design aprovado em conversa, aguardando revisao do usuario antes do plano de implementacao

## Contexto

A etapa de Confiabilidade foi concluida e publicada em `main`. O proximo bloco macro e
Produto escalavel, com foco inicial em comunidades, membros e RBAC local.

O codigo atual ja possui uma base importante:

- `Community`, `CommunityMember`, `CommunityMemberRole` e `CommunityMemberStatus` em `src/types.ts`.
- Regras puras de permissao em `src/domain/communityPermissions.ts`.
- Hook de membros em `src/hooks/useCommunityMembers.ts`.
- UI operacional em `src/components/community/CommunityMembersPanel.tsx`.
- Descoberta publica em `src/components/community/CommunityDiscovery.tsx`.
- Adapters Supabase em `membershipCloudService` e `communityDiscoveryService`.
- Migrations com funcoes de convite, pedido de entrada, aprovacao/rejeicao e descoberta publica.

O problema e que a regra de produto ainda esta espalhada entre hook, componentes e
services Supabase. Algumas acoes sensiveis ja passam por RPC, mas outras ainda
usam `update`/`delete` direto em `community_members`. A primeira fatia deve criar
um contrato de produto claro antes de ampliar backend, cache ou UI.

## Objetivos

- Consolidar o contrato de membros e permissoes locais para comunidades.
- Criar uma camada de aplicacao para comandos/queries de membros.
- Criar um View Model para o painel de membros.
- Reduzir regra de produto dentro de React components.
- Manter UI e comportamento atuais, com menos acoplamento.
- Registrar explicitamente os limites de seguranca entre frontend, application layer e Supabase.

## Nao objetivos

- Nao redesenhar `CommunityMembersPanel`.
- Nao adotar TanStack Query, Zod, Dexie ou XState nesta fatia.
- Nao migrar persistencia local.
- Nao reescrever todos os fluxos de comunidade.
- Nao trocar o modelo de papeis existente.
- Nao aplicar schema no Supabase real nesta primeira fatia.

## Modelo de papeis

Os papeis locais sao:

- `owner`: controla tudo, pode deletar comunidade, limpar historico, editar regras, gerenciar membros, avaliar atletas e criar sessoes. Nao deve ser removido por fluxo comum e nao deve sair da comunidade pelo fluxo de sair.
- `admin`: gerencia membros, regras, perfis de atleta, avaliacoes e sessoes. Nao deleta comunidade nem limpa historico.
- `moderator`: opera a semana, cria sessoes e avalia atletas. Nao gerencia membros nem regras.
- `member`: participa e le a comunidade. Nao executa acoes administrativas.

Status de membro:

- `active`: concede leitura e permissoes conforme o papel.
- `pending`: pedido de entrada aguardando decisao; nao concede leitura operacional nem escrita.
- `invited`: convite ainda nao aceito; nao concede escrita.
- `rejected`: pedido recusado; nao concede escrita.

O papel global continua separado:

- `master`: acesso administrativo global de produto.
- `programmer`: leitura/suporte sem escrita de produto.
- `user`: depende de `CommunityMember` ativo.

## Arquitetura proposta

### Dominio

`src/domain/communityPermissions.ts` continua sendo a fonte pura para derivar permissoes.
Esta fatia pode ampliar testes, mas nao deve misturar IO no dominio.

### Aplicacao

Criar `src/application/communityMembershipUseCases.ts` para centralizar comandos e
queries de membros. A camada recebe gateways injetaveis, estado local necessario e
dados de auth, e retorna `AppResult`.

Contratos previstos:

- `fetchCommunityMembersQuery`
- `inviteCommunityMemberCommand`
- `changeCommunityMemberRoleCommand`
- `removeCommunityMemberCommand`
- `approveCommunityJoinRequestCommand`
- `rejectCommunityJoinRequestCommand`
- `generateCommunityJoinCodeCommand`
- `disableCommunityJoinCodeCommand`
- `leaveCommunityCommand`
- `searchPublicCommunitiesQuery`
- `requestPublicCommunityJoinCommand`
- `requestCommunityJoinByCodeCommand`

Esses comandos nao devem inventar autorizacao client-side como fonte final. Eles
podem bloquear acoes obviamente invalidas para UX melhor, mas o Supabase/RPC
continua sendo a autoridade para seguranca cloud.

### View Model

Criar `src/application/communityMembersViewModel.ts` para preparar o estado que a UI
precisa renderizar:

- membros ativos ordenados;
- pedidos pendentes;
- papel do usuario atual;
- `canManage`;
- `canLeave`;
- papeis atribuiveis para cada membro;
- labels e estados de acao;
- mensagem quando a nuvem ou comunidade sincronizada e requisito.

O componente `CommunityMembersPanel` deve consumir esse View Model e chamar callbacks
do hook, evitando recalcular regra de produto em JSX.

### Hook

`useCommunityMembers` deve continuar sendo a ponte React, mas deve delegar regras para
application/domain:

- fetch via query;
- mutations via commands;
- refresh apos mutacao;
- estado de loading/error/action busy.

Ele pode continuar usando `membershipCloudService` como gateway padrao.

### Supabase adapters

`membershipCloudService` e `communityDiscoveryService` permanecem adapters. Nesta fatia
eles nao precisam mudar de API externa alem de se adequarem aos gateways.

Risco observado: `updateRole` e `removeMember` ainda usam tabela diretamente. Isso fica
isolado atras da application layer nesta fatia. Uma fatia seguinte deve criar RPCs
dedicadas para alterar papel e remover membro, com testes de migration, se quisermos
fechar a brecha arquitetural de vez.

## Fluxos cobertos

### Gerenciar membros

Owner/admin ve lista de membros ativos, pedidos pendentes, convite por email e codigo
de convite. Pode:

- convidar por email;
- aprovar pedido;
- rejeitar pedido;
- alterar papel atribuivel;
- remover membro editavel;
- gerar novo codigo;
- desativar codigo.

### Participar como membro

Membro ativo ve comunidade e pode sair se nao for owner.

### Pedido de entrada

Usuario autenticado pode buscar comunidade publica ou entrar por codigo. O resultado
fica `pending` ate owner/admin aprovar.

### Estados bloqueados

Quando Supabase nao esta configurado ou a comunidade ainda nao tem `cloudId`, a UI mostra
estado bloqueado com orientacao clara, sem tentar executar comandos cloud.

## Tratamento de erros

- Erros de produto previsiveis devem retornar `productError`, por exemplo:
  - comunidade sem `cloudId` para acao cloud;
  - email vazio;
  - tentativa de remover owner;
  - tentativa de sair sendo owner.
- Falhas tecnicas de Supabase devem retornar erro recuperavel quando a UI puder tentar de novo.
- A UI deve exibir mensagem acionavel e manter o estado anterior.

## Testes

Testes unitarios devem cobrir:

- View Model para owner, admin, moderator, member, programmer e usuario sem membro ativo.
- Separacao entre membros ativos e pedidos pendentes.
- Bloqueio de remocao/alteracao de owner e do proprio usuario quando aplicavel.
- Comandos retornando `productError` para entrada invalida.
- Comandos chamando gateway correto para convite, role change, remove, approve/reject, join code e leave.
- Falha de gateway retornando erro tecnico/recoverable conforme o contrato de `AppResult`.

Testes UI nao sao obrigatorios nesta primeira fatia, pois nao ha redesign. Se o plano
tocar muito JSX no painel, adicionar um teste Vitest/Testing Library focado em renderizar
estado bloqueado e pedidos pendentes.

## Decisoes de biblioteca

- TanStack Query: adiar. O problema atual e fronteira de produto, nao cache.
- Zod: adiar. Ainda nao ha payload novo na fronteira; usar tipos existentes e testes.
- Dexie: adiar. Persistencia local nao muda nesta fatia.
- XState: adiar. O fluxo de membros cabe em estados simples de hook.

## Gates de pronto

- `npm run lint` passa.
- `npm run test:unit` passa.
- Testes novos de application/View Model passam.
- `npm run test:ui` passa se JSX for alterado de forma relevante.
- `npm run build` passa.
- Nenhum componente novo chama Supabase diretamente.
- `CommunityMembersPanel` fica mais declarativo, com regras movidas para application/View Model.
- Risco de `updateRole`/`removeMember` direto fica documentado para a proxima fatia Supabase/RPC.

## Fora da fatia, mas recomendado em seguida

Criar uma subfatia Supabase para substituir `updateRole` e `removeMember` diretos por RPCs:

- `set_community_member_role`
- `remove_community_member`

Essa subfatia deve incluir migration, testes de schema, grants, `SECURITY DEFINER` com
`search_path`, validacao de owner/admin e protecao contra remover ultimo owner.
