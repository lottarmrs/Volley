# Community Entry Discovery Boundary Design

Data: 2026-07-04
Projeto: Volley / Panelinha Team Balancer
Status: design aprovado em conversa, aguardando revisao do usuario antes do plano de implementacao

## Contexto

A fatia de Produto escalavel para comunidades, membros e RBAC local foi concluida e publicada
em `main`. O painel de membros agora passa por use cases e View Model, mas dois fluxos de entrada
em comunidade ainda conhecem diretamente os adapters Supabase:

- `src/components/community/JoinCommunityByCode.tsx` importa `membershipCloudService`.
- `src/components/community/CommunityDiscovery.tsx` importa `communityDiscoveryService`.

Isso mantem regra de aplicacao dentro da UI: normalizacao de codigo, mensagens de erro, preview,
pedido de entrada publica e atualizacao local de status pendente ficam misturados com JSX. A proxima
fatia deve fechar essa fronteira sem redesenhar os modais.

## Objetivos

- Remover imports diretos de Supabase dos componentes de entrada por codigo e descoberta publica.
- Manter layout, textos e comportamento visual atuais.
- Reusar os use cases existentes de comunidade sempre que possivel.
- Adicionar a query de aplicacao que falta para preview por codigo.
- Criar hooks React finos para orquestrar estado visual e `AppResult`.
- Cobrir a nova fronteira com testes pequenos, antes da implementacao.

## Nao objetivos

- Nao redesenhar `JoinCommunityByCode` ou `CommunityDiscovery`.
- Nao introduzir TanStack Query, SWR, XState, Dexie ou Zod nesta fatia.
- Nao mudar schema, migrations, RLS ou RPCs no Supabase.
- Nao alterar textos, classes visuais ou fluxo de modal alem do necessario para delegar comandos.
- Nao implementar offline/sync para entrada em comunidade nesta fatia.
- Nao resolver `updateRole` e `removeMember` diretos; isso fica para a fatia Supabase/RPC.

## Arquitetura proposta

### Application layer

`src/application/communityMembershipUseCases.ts` continua sendo a fronteira de produto para membros
e entrada em comunidades. Ele ja possui:

- `searchPublicCommunitiesQuery`
- `requestPublicCommunityJoinCommand`
- `requestCommunityJoinByCodeCommand`

Adicionar uma query explicita:

- `previewCommunityJoinByCodeQuery`

Essa query recebe `{ code: string }`, normaliza com `trim().toUpperCase()`, rejeita codigo vazio com
`productError('invalid_input', 'Informe o codigo da comunidade.')`, chama `gateway.findByCode(code)`
e retorna:

- `{ community: preview }` quando encontrar a comunidade;
- `productError('not_found', 'Codigo de convite invalido ou comunidade nao encontrada.')` quando
  o gateway retornar `null`;
- `technicalError('Nao foi possivel buscar a comunidade.', error)` quando o gateway falhar.

O tipo do preview deve permanecer equivalente ao que o service ja retorna:

- `id`
- `name`
- `description`
- `memberCount`
- `myStatus`

### Hooks React

Criar dois hooks pequenos em `src/hooks`:

- `useJoinCommunityByCode`
- `useCommunityDiscovery`

`useJoinCommunityByCode` deve expor:

- `code`
- `setCode`
- `preview`
- `loading`
- `error`
- `requested`
- `previewCommunity`
- `requestJoin`

O hook chama `previewCommunityJoinByCodeQuery` para buscar o preview e
`requestCommunityJoinByCodeCommand` para enviar o pedido. O componente segue decidindo quando mostrar
o card, o alerta e o estado de sucesso.

`useCommunityDiscovery` deve expor:

- `query`
- `setQuery`
- `results`
- `loading`
- `error`
- `actingId`
- `search`
- `requestJoin`

O hook chama `searchPublicCommunitiesQuery` para listar comunidades publicas e
`requestPublicCommunityJoinCommand` para pedir entrada. Depois de um pedido bem-sucedido, ele atualiza
o item local para `myStatus: 'pending'`, preservando o comportamento atual.

### Componentes

`JoinCommunityByCode.tsx` e `CommunityDiscovery.tsx` devem preservar a UI atual. A mudanca esperada e
somente trocar estado manual e chamadas de service por chamadas aos hooks.

Depois da fatia, esses componentes nao devem importar:

- `membershipCloudService`
- `communityDiscoveryService`
- `supabase`

### Supabase adapters

`membershipCloudService` e `communityDiscoveryService` continuam como adapters padrao dos gateways
da application layer. Nenhuma mudanca de Supabase e necessaria nesta fatia.

## Fluxos cobertos

### Entrada por codigo

1. Usuario digita codigo.
2. Hook normaliza codigo para preview via application layer.
3. Codigo vazio retorna erro de produto sem chamar gateway.
4. Codigo inexistente retorna erro de produto `not_found`.
5. Preview encontrado renderiza o mesmo card atual.
6. Usuario pede entrada.
7. Pedido bem-sucedido marca `requested = true` e mostra o mesmo estado de sucesso atual.

### Descoberta publica

1. Modal abre e busca comunidades publicas com query vazia.
2. Usuario pesquisa por nome.
3. Hook trimma a query por meio do use case existente.
4. Resultados renderizam como hoje.
5. Usuario pede entrada em uma comunidade.
6. Pedido bem-sucedido altera apenas aquela comunidade para `myStatus: 'pending'`.

## Tratamento de erros

- Erros de produto devem exibir `result.error.message`.
- Falhas tecnicas devem exibir mensagem amigavel da application layer.
- O estado anterior deve ser preservado quando uma acao falhar.
- `actingId` deve voltar para `null` mesmo quando o pedido publico falhar.
- `loading` deve voltar para `false` mesmo quando preview ou busca falharem.

## Testes

Adicionar testes unitarios para:

- `previewCommunityJoinByCodeQuery` normalizar codigo e chamar `gateway.findByCode`.
- `previewCommunityJoinByCodeQuery` rejeitar codigo vazio sem chamar gateway.
- `previewCommunityJoinByCodeQuery` retornar `not_found` quando gateway retornar `null`.
- `previewCommunityJoinByCodeQuery` retornar erro tecnico quando gateway lancar erro.
- Hooks manterem os estados principais, se o setup de testes React existente permitir fazer isso
  sem instalar biblioteca nova.

Adicionar um gate de verificacao por busca textual:

```powershell
rg -n "membershipCloudService|communityDiscoveryService|supabase\\.from|supabase\\.rpc" src\components\community\JoinCommunityByCode.tsx src\components\community\CommunityDiscovery.tsx
```

Resultado esperado: nenhum match.

## Decisoes de biblioteca

- TanStack Query/SWR: adiar. O escopo e remover acoplamento, nao criar estrategia de cache.
- Zod: adiar. Os payloads ja sao tipados e controlados pelos gateways existentes.
- XState: adiar. Os estados dos modais cabem em hooks simples.
- Testing Library para hooks: usar somente se ja estiver disponivel no projeto. Se nao estiver,
  testar a application layer agora e deixar testes de hook para quando houver infraestrutura
  existente.

## Gates de pronto

- `npm run lint` passa.
- `npm run test:unit` passa.
- `npm run test:ui` passa se JSX ou hooks React forem cobertos por suite UI.
- `npm run build` passa.
- `JoinCommunityByCode.tsx` nao importa services Supabase.
- `CommunityDiscovery.tsx` nao importa services Supabase.
- UI permanece visualmente equivalente a antes da fatia.

## Fora da fatia, mas recomendado em seguida

Depois desta fronteira, os proximos candidatos continuam:

- Supabase/RPC hardening para `updateRole` e `removeMember`.
- Offline/sync para ciclo de entrada e aprovacao de comunidade.
- Arquitetura de cache/query quando os fluxos cloud estiverem mais padronizados.
- Fase de Experiencia/UI com esqueumorfismo apenas depois da base de produto ficar estavel.
