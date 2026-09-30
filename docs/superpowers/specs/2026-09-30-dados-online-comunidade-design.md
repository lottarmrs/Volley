# Dados online — parte 1: camada de dados e comunidade

Primeira de cinco partes do projeto "tempo real" (decidido em 2026-09-30): o app deixa o sync e
passa a ler e gravar direto no banco, com aviso de tempo real. Esta parte cria a camada de dados
online e migra comunidade, membros, elenco e regras.

## Decisões do projeto (2026-09-30)

1. **Tudo online.** O banco é a fonte da verdade; o tempo real só avisa "mudou, releia"
   (`ADR-RT-001`, "Realtime is not source of truth", `docs/architecture/adr/ADR-CATALOG.md`).
2. **Sem sinal:** só o placar ao vivo terá fila local (parte 3); o resto pede conexão.
3. **Sem conta:** ao fim do projeto (parte 5), só a pelada rápida no aparelho; comunidade,
   elenco, histórico e ligas exigem conta. Ao criar conta, nada é migrado.
4. **Partes, em ordem:** 1 camada de dados + comunidade/membros/elenco/regras (esta); 2 peladas e
   histórico; 3 pelada ao vivo com membros acompanhando; 4 ligas, presença, listas de WhatsApp e
   modelos; 5 remoção do `syncService` e do `localStorage` de dados de conta.

## Decisões desta parte (2026-09-30)

1. Camada de dados com **TanStack Query** (`@tanstack/react-query`) e uma ponte de tempo real.
2. **Tudo nasce online:** comunidade, atleta/convidado, regras e membros gravam direto no banco;
   sem conexão, a ação não acontece e a tela diz isso. Nada fica pendente no aparelho.
3. **Sem "último envio":** na troca, comunidades, atletas e regras guardados no `localStorage` de
   quem tem conta são apagados; o que estivesse pendente e não enviado se perde (risco aceito:
   6 contas em produção, sync rodando o tempo todo).
4. **As telas mudam:** comunidade, elenco (Pessoas, Convidados), membros e regras passam pelo
   `/impeccable shape` para desenhar carregando, erro, sem conexão e confirmação de gravação.

## Por quê

- Hoje comunidades (`useCommunities`), atletas (`usePlayers`) e regras (`useCommunityRules`) vivem
  no `localStorage` e sobem/descem pelo `syncService` (~2.000 linhas) +
  `operationalCloudService` (~900). Membros já são lidos da nuvem (`useCommunityMembers`).
- O sync usa as comunidades e os atletas locais para traduzir ids locais em ids da nuvem em todo o
  resto (`makeCloudIdLookup`, `syncService.ts` ~1199): peladas, times, ligas, regras.
- Em produção, em 2026-09-30, a publicação `supabase_realtime` existe e está **vazia**.

## Parte 1 — A camada de dados online

- **Dependência:** `@tanstack/react-query`. Um `QueryClient` no topo do app (em `src/main.tsx`,
  por dentro do `AuthSessionProvider`), com `refetchOnWindowFocus` ligado e sem novas tentativas
  automáticas para erro de permissão (`42501`).
- **Chaves de consulta** em `src/application/queryKeys.ts`:
  `['comunidades', userId]`, `['comunidade', communityId, 'membros']`,
  `['comunidade', communityId, 'elenco']`, `['comunidade', communityId, 'regras']`.
- **Ponte de tempo real** `useCommunityRealtime(communityCloudId)` em `src/hooks/`: um canal do
  Supabase por comunidade com `postgres_changes` em `communities`, `community_members`,
  `community_players`, `players` e `community_rules` (filtradas por `community_id` onde a tabela
  tem a coluna; `players` sem filtro de coluna e com a RLS limitando). Cada aviso invalida só a
  chave correspondente; ao reconectar (`SUBSCRIBED` depois de `CHANNEL_ERROR`/`TIMED_OUT`),
  invalida todas as chaves daquela comunidade. Os dados do aviso **nunca** vão direto para a tela.
- **Sem conexão:** consultas e gravações falham com um erro de produto
  (`offline_unavailable`, `src/application/appResult.ts`) e a mensagem
  "Sem conexão. Tente de novo quando o sinal voltar."; sem fila.

## Parte 2 — O que migra e como convive com o sync

- **Hooks com o mesmo contrato:** `useCommunities`, `usePlayers` e `useCommunityRules` continuam
  devolvendo o mesmo formato às telas. Por dentro:
  - **com conta e Supabase configurado:** leem pelas consultas da Parte 1 e gravam pelos serviços
    e RPCs existentes (`communityCloudService`, `playerCloudService`, `communityPlayerCloudService`,
    `communityRulesCloudService` e `membershipCloudService` para as RPCs de membros), com
    atualização imediata na tela e volta atrás se o servidor recusar;
  - **sem conta:** continuam no `localStorage`, como hoje (a redução a "pelada rápida" é da
    parte 5).
- **Ids estáveis:** o mapeamento de leitura continua devolvendo `id = local_id || id` e `cloudId`,
  como o sync faz (`playerCloudService.ts` ~36), para que peladas, times e ligas ainda locais
  apontem para os mesmos atletas e comunidades.
- **Convivência:** o `syncService` deixa de baixar e de subir comunidades, atletas e regras; para
  o que ainda não migrou, recebe essas entidades do cache da camada nova só para traduzir ids.
- **Na troca:** na primeira abertura do app novo com conta, `STORAGE_KEYS.communities`,
  `STORAGE_KEYS.players` e `STORAGE_KEYS.communityRules` são apagados do `localStorage`.

## Parte 3 — Servidor

Migration nova `20260930140000_dados_online_comunidade.sql`:

- cria a publicação `supabase_realtime` se não existir (o Postgres de teste não a tem);
- acrescenta `public.communities`, `public.community_members`, `public.community_players`,
  `public.players` e `public.community_rules` à publicação (idempotente: só as que ainda não
  estão);
- nenhuma mudança de RLS: o Supabase aplica a RLS de `select` aos avisos do canal.

## Parte 4 — Telas

- Antes de cada tela desta parte, `/impeccable shape`: visão geral e lista de comunidades,
  Pessoas, Gestão → Membros, Gestão → Convidados e Gestão → Regras. O shape decide carregando,
  erro, sem conexão e confirmação de gravação, no mundo visual que o app já tem.
- A bancada em `preview/` ganha esses estados para conferência no navegador.

## Testes

- Ponte de tempo real (unitário, canal simulado): aviso de uma tabela invalida só a chave dela;
  reconexão invalida todas as da comunidade; payload do aviso não é usado como dado.
- Hooks (specs com `QueryClient` de teste e serviços simulados): leitura; gravação com
  atualização imediata; volta atrás na recusa; "sem conexão"; sem conta segue no `localStorage`.
- Sync: não sobe nem baixa comunidades, atletas e regras; ainda traduz ids de peladas e ligas pelo
  cache.
- Troca: com conta, o `localStorage` perde as três chaves na primeira abertura; sem conta, nada
  muda.
- `src/test/db/dadosOnlineComunidade.dbtest.ts`: as cinco tabelas estão em `supabase_realtime`
  depois da migration.
- Specs dos estados de tela que o shape definir.

## Publicação

1. Migration (só acrescenta à publicação) primeiro.
2. App depois.
3. Conferência no ar com a conta do usuário: entrar, ver comunidades e elenco, editar um convidado
   e ver a mudança chegar em outra aba sem recarregar.

## Fora desta parte

- Peladas e histórico (parte 2); pelada ao vivo e membros acompanhando (parte 3); ligas, presença,
  listas de WhatsApp e modelos (parte 4); remoção do sync e redução do modo sem conta (parte 5).
- Atualizar o princípio "Funciona Sem Sinal" do `PRODUCT.md` → parte 3.
