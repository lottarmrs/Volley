# Plano 4 — Offline operacional: posse da sessão e entrega confiável

Programa: `docs/superpowers/plans/2026-07-22-scalable-product-program.md`
Spec base: `docs/superpowers/specs/2026-07-22-scalable-product-restructure-design.md` (seção 11)

## 1. O que a exploração mudou

O plano foi escrito no programa como "construir operação offline". A exploração do
código mostrou que **a operação offline já existe** e que o buraco é outro.

Nenhum componente exige rede em tempo de uso. Jogadores, sessões, times, jogos e
registro de ponto leem e escrevem `localStorage`; `sessionLifecycleUseCases` é lógica
pura. O sync é uma ação separada, manual ou de partida.

Mais: **a fila durável que a seção 11.4 do spec base pede já existe**, em outra forma.
Toda entidade carrega `syncStatus: 'pending'` persistido, e `countPendingChanges`
soma isso nas 16 coleções para alimentar o badge de "Nuvem & Conta". Nada se perde
hoje — o cache local *é* a fila.

O que falta:

| Peça | Estado antes deste plano |
| --- | --- |
| Fila durável do pendente | Existe (`syncStatus` por entidade) |
| Contagem do pendente | Existe (`countPendingChanges`) |
| Detecção de rede | **Não existe** — nenhum `navigator.onLine` no projeto |
| Reenvio automático ao voltar a rede | **Não existe** |
| Visibilidade honesta do não entregue | Fraca — um número em badge com tooltip |
| Posse da sessão | **Não existe** |

Achados de apoio, todos verificados:

- `AppError` tem a variante `offline_unavailable` e **nenhum produtor** — falha de rede
  hoje cai em `technical`, indistinguível de "servidor recusou".
- `sessions.sync_version` e `community_players.sync_version` existem no banco e nunca
  são lidos nem incrementados pelo cliente. Não há controle de concorrência otimista.
- RLS de `sessions` e `point_events` permite escrita ao dono da sessão **e** a
  `owner`/`admin`/`moderator` da comunidade (default de
  `current_user_has_community_role`). Logo, o conflito de placar é entre **pessoas
  diferentes**, não entre dois aparelhos do mesmo dono.

## 2. Objetivo

Tornar confiável a operação com sinal instável, em duas frentes independentes:

1. **Autoridade** — impedir que duas pessoas produzam placares concorrentes da mesma
   sessão, e resolver o caso em que isso acontece mesmo assim.
2. **Entrega** — garantir que o que não subiu seja reenviado sozinho quando a rede
   voltar, e que a pessoa saiba, sem procurar, que algo ainda não está na nuvem.

## 3. Escopo

### 3.1 Dentro

- Posse de sessão por usuário, com reivindicação, transferência explícita e expiração
  por inatividade.
- Detecção de conflito no sync, preservando as duas versões, com decisão humana.
- Detecção de conectividade e classificação de erro de rede como
  `offline_unavailable`.
- Reenvio automático com backoff persistido, sem congelar em erro de rede.
- Visibilidade persistente do trabalho não entregue.

### 3.2 Fora, e por quê

**Partida a frio sem rede.** Hoje, quem abre o app do zero sem rede não entra: o
`AuthSessionProvider` chama `ensure_account_ready` (RPC) e, na falha, o estado vira
`recoverable_error`. O `AccountSnapshot` vive só em `useState`, nunca é persistido.
O usuário escolheu priorizar sinal instável sobre ausência de sinal, então isto fica
fora — **mas é uma limitação conhecida e registrada**, não um esquecimento. Quem
precisar operar sem sinal deve deixar o app aberto.

**Upload transacional por sessão.** Decidido: consistência eventual basta. Como a
carreira é regerada por sessão via trigger (apagar-e-inserir, idempotência verificada
em 2026-07-30), subir a parte que faltou corrige os números sozinho.

**Pacote offline por comunidade** (`Disponibilizar offline` da seção 11.2 do spec
base). O cache local já contém tudo do usuário; um recorte explícito por comunidade só
faz sentido junto da partição de cache por comunidade, que foi removida no Plano 3 por
não ter chave correta (`Player.communityIds` é lista). Fica para quando houver
requisito concreto de tamanho de cache.

**Navegação definitiva de sincronização.** O Plano 5 refaz a arquitetura de informação
(seção 12 do spec base, centrada em comunidade). Este plano não cria item de topo.

## 4. Decisões de arquitetura

| Decisão | Escolha | Alternativa recusada |
| --- | --- | --- |
| Fila de trabalho pendente | `syncStatus` por entidade, que já existe | Outbox por operação na nuvem — exige caminho de escrita por operação que o app não tem; foi construído e removido em 2026-07-30 por não ter consumidor |
| Autoridade da sessão | Por **usuário** | Por dispositivo — puniria o caso legítimo de trocar de aparelho no meio da sessão |
| Conflito de placar | Preserva as duas versões, decisão humana | Mesclagem automática por timestamp — relógio de celular é frágil e gera placar dobrado |
| Backoff em erro de rede | Intervalo cresce até um teto, **nunca desiste** | Congelar em 5 tentativas (seção 11.4 do spec base) — congelar um sync de payload inteiro significa que os dados nunca sobem |
| Navegação | Seção dentro de "Nuvem & Conta" | Item de topo próprio — duplicaria "Nuvem & Conta" e seria desmontado no Plano 5 |

## 5. Posse da sessão

### 5.1 Modelo

Três colunas em `public.sessions`:

```sql
controlled_by_user_id uuid references auth.users(id) on delete set null,
control_claimed_at    timestamptz,
control_device_id     text
```

`controlled_by_user_id` é a **autoridade**. Nulo significa sessão livre. É distinto de
`sessions.owner_id`, que continua sendo quem criou: um moderador pode assumir o
controle sem virar dono.

`control_device_id` é **informativo e nunca bloqueia**. Serve para avisar "você está
com esta sessão aberta em outro aparelho" quando o dono do controle é você mesmo. Um
UUID por instalação, em `localStorage` sob `vpg_device_id`.

`vpg_device_id` fica **fora de `STORAGE_KEYS`**. `clearLocalDomainCache` varre essa
lista na troca de conta, e o dispositivo não muda porque o usuário mudou — mesmo
tratamento de `LOCAL_CACHE_OWNER_KEY`. Se o id se perder na limpeza do navegador,
nada quebra: apenas o aviso de aparelho deixa de aparecer.

### 5.2 Expiração

A posse expira por **inatividade**, não desde a reivindicação: 10 minutos sem sinal de
vida liberam a sessão para reivindicação simples.

Medir desde a reivindicação criaria o pior cenário — o celular de quem está tocando a
sessão morre e ninguém mais marca ponto até o prazo acabar. Medir pela atividade
mantém a garantia enquanto alguém joga e devolve a sessão sozinha quando o aparelho
some.

### Corrigido em 2026-08-01: o sinal de vida é o heartbeat, não o `point_event`

A versão original media 30 minutos lendo `max(occurred_at)` de `public.point_events` —
a tabela da **nuvem**. Mas o registro de ponto neste app é puramente local e não existe
sync periódico durante a sessão. Enquanto ninguém sincroniza a nuvem não vê ponto
nenhum, o `coalesce` cai em `control_claimed_at`, e a posse expirava **por cronômetro**
mesmo com alguém marcando placar sem parar.

Com o ritmo real informado pelo operador — jogo de 10 a 15 minutos, próximo começando
em 1 a 2 — uma sessão de três jogos passa de 45 minutos. A posse expirava no meio, toda
vez.

O cliente agora bate um heartbeat a cada 2 minutos chamando `claim_session_ownership`,
que já atualiza `control_claimed_at`. A batida vira o sinal de vida real, independente
de sync. Dez minutos são cinco batidas perdidas: folga contra oscilação de rede, e um
aparelho que morreu devolve a quadra em menos de um jogo.

A regra de quando bater mora em `shouldHeartbeatSessionControl`, no use case, e não
dentro do efeito — para o teste exercitar o que o componente executa, em vez de uma
cópia que diverge sem ninguém notar.

**Sessão sem nenhum evento ainda.** Uma sessão recém-criada não tem `point_event`, e
"último evento" seria nulo. Nesse caso a referência é `control_claimed_at`. Formalmente,
o instante de inatividade é `coalesce(último point_event da sessão, control_claimed_at)`
— nunca nulo, porque `control_claimed_at` é preenchido junto com a posse.

**Sessão encerrada.** Reivindicar sessão com `status = 'finished'` é recusado: não há
placar a marcar. A posse de uma sessão encerrada não precisa ser liberada
explicitamente — ela expira sozinha pela inatividade e não bloqueia nada, já que a
reivindicação está fechada de qualquer forma.

### 5.3 RPCs

Ambas `security definer`, `search_path` fixado, `revoke` de `public`/`anon` antes do
`grant` a `authenticated`.

```
claim_session_ownership(p_session_id uuid, p_device_id text) returns sessions
```

Assume o controle se a sessão estiver livre, se já for sua, ou se a posse estiver
expirada. Recusa com `errcode 42501` se outra pessoa tem posse ativa. Exige o mesmo
direito de escrita que a RLS de `sessions` já concede.

```
transfer_session_ownership(p_session_id uuid, p_device_id text) returns sessions
```

Tomada explícita, permitida a quem já pode escrever a sessão, independente de
expiração. Sempre registra `control_claimed_at`.

### 5.4 Comportamento no cliente

**Com rede**, antes de liberar o registro de placar: reivindica. Se outra pessoa tem
posse ativa, a tela de sessão entra em modo leitura com um botão "assumir controle"
que pede confirmação **nomeando quem está com ela** — o nome vem de `profiles`, não um
id opaco.

**Sem rede**, marca normalmente e registra localmente que marcou sem confirmar posse.
O bloqueio não é tentado, porque não há como consultar.

## 6. Conflito

### 6.1 Detecção

No sync: existem `point_events` locais não sincronizados para uma sessão cujo
`controlled_by_user_id` na nuvem não é o usuário atual.

### 6.2 Resolução

Os eventos **não são mesclados**. Os locais em conflito são preservados intactos e
marcados como em conflito; a pessoa escolhe qual versão vale, com as duas contagens na
tela ("seu aparelho: 21 pontos / Ana: 19 pontos"). A versão descartada é soft-delete,
recuperável.

Enquanto houver conflito aberto para uma sessão, o sync **não sobe** os eventos dela —
mas continua subindo o resto normalmente. Um conflito numa sessão não pode travar a
entrega das outras.

## 7. Entrega confiável

### 7.1 Conectividade

Módulo próprio, três estados: `online`, `offline`, `desconhecido`.

`navigator.onLine` é **pista, não veredito** — responde `true` num wi-fi sem internet.
A autoridade é a requisição real:

- vai para `offline` quando `navigator.onLine === false` **ou** quando uma tentativa
  de sync falha com erro de rede;
- volta para `online` no evento `online` do browser **ou** numa requisição
  bem-sucedida.

O evento do browser serve para **antecipar a tentativa**, não para declarar o estado.

### 7.2 Classificação de erro

Falha de rede passa a produzir `offline_unavailable`, dando consumidor a uma variante
de `AppError` que hoje existe sem produtor. Isso separa "sem rede" de "servidor
recusou", que hoje caem os dois em `technical`.

### 7.3 Reenvio automático

Dois gatilhos: o evento `online` (com debounce curto, porque ele chega antes da rede
estar utilizável) e um tique periódico que respeita `nextAttemptAt`.

Reusa `useCloudSync.run` inteiro, o que traz de graça duas proteções já construídas:

- a trava de reentrância persistida com TTL impede reenvio concorrente com clique
  manual;
- a recusa de escrita enquanto o cache pertence a outra conta (adicionada em
  2026-07-30) impede reenviar dados da conta anterior.

### 7.4 Backoff

O estado de tentativa entra no `SyncIssueEntry` existente, que já tem `count`,
`firstSeenAt`, `lastSeenAt`, `status` e `kind` persistidos. Acrescenta-se
`nextAttemptAt`, derivado de `count`.

| Tipo de erro | Comportamento |
| --- | --- |
| `offline_unavailable`, `technical` | Reenvia indefinidamente, intervalo crescente até teto de 15 min (30s, 1m, 2m, 5m, 15m). Nunca desiste |
| `validation`, `authorization`, `conflict` | Para na hora e vira item acionável. Não se conserta com o tempo |

### 7.5 Visibilidade

Duas mudanças, ambas reusando o que existe:

**A palavra.** "3 pendentes" descreve uma fila. "3 alterações ainda não foram para a
nuvem" descreve uma perda possível. Mesma informação, consequência explícita.

**A persistência.** Enquanto houver pendente *e* estivermos offline ou com falha, o
aviso permanece na tela. Toast é para o que acabou de acontecer; isto é um estado que
continua verdadeiro.

O detalhe continua no `AccountSyncView`, que já lista as falhas do ledger.

## 8. Tratamento de erro

Nenhum descarte silencioso, em nenhum caminho:

- erro de rede vira estado visível e reenfileirado;
- erro estrutural vira item acionável no ledger, sem retry automático;
- conflito de posse vira decisão humana com as duas versões preservadas.

## 9. Exceção de UI

Registrada aqui e no doc do programa, como foi feito para a aba de linha do tempo no
Plano 3B. Escopo fechado em três itens, reusando componentes existentes:

1. Aviso de posse na tela de sessão, com "assumir controle" e confirmação nomeada.
2. Seção de conflitos **dentro de "Nuvem & Conta"**, com contagem no badge quando
   houver conflito aberto.
3. Indicador de pendente persistente e **clicável**, levando à seção acima.

Sem item de topo novo. A navegação definitiva de sincronização é decisão do Plano 5,
junto da arquitetura de informação centrada em comunidade.

## 10. Testes

**Funções puras** — backoff, classificação de erro, decisão de conectividade: teste
direto, é onde mora a lógica.

**Orquestração** — gatilhos de reenvio e debounce: teste de hook com timers falsos,
padrão que `useCloudSync.spec.tsx` já usa.

**Posse e conflito** — teste de comportamento em SQL contra o projeto real dentro de
`begin/rollback`, disciplina que em 2026-07-30 encontrou o vazamento de carreira entre
contas que os testes de schema não pegavam. Casos obrigatórios:

- reivindicar sessão livre;
- reivindicar sessão com posse ativa de outra pessoa (deve recusar);
- reivindicar sessão com posse expirada por inatividade (deve aceitar);
- reivindicar sessão recém-criada, sem nenhum `point_event` (a expiração cai em
  `control_claimed_at`, então deve recusar dentro dos 30 min);
- reivindicar sessão com `status = 'finished'` (deve recusar);
- transferência explícita com posse ativa alheia (deve aceitar e registrar);
- detecção de conflito com eventos locais não sincronizados.

Teste de schema não substitui: ele casa **texto** de SQL, não comportamento.

## 11. Gate de conclusão

- [x] As três colunas existem em produção e `controlled_by_user_id` referencia
      `auth.users` com `on delete set null`.
      — Verificado: `colunas=3` em `information_schema.columns`.
- [x] As duas RPCs são `security definer` com `search_path` fixado, revogadas de
      `public`/`anon` e concedidas a `authenticated`, verificado por
      `has_function_privilege`.
      — Verificado: `anon_pode_claim=false`, `auth_pode_claim=true`.
- [x] Reivindicar sessão de outra pessoa com posse ativa recusa; com posse expirada
      aceita. Verificado por execução, não por leitura.
      — Verificado em `begin/rollback` (Tarefa 7, Passo 4).
- [x] Conflito preserva as duas versões; nenhum evento é apagado sem soft-delete.
      — Verificado: `resolveConflictKeepingTheirs` faz soft-delete, teste em
      `sessionConflictResolution.test.ts`.
- [x] Conflito numa sessão não impede a entrega das demais.
      — Verificado: filtro no `syncService.ts` é por sessão, teste em
      `syncConflicts.test.ts` ("uma sessao em conflito nao contamina as outras").
- [x] Erro de rede nunca congela o reenvio; erro estrutural nunca dispara retry
      automático. Verificado por teste, com mutação.
      — Verificado: `syncBackoff.test.ts` + mutação na Tarefa 5, Passo 8.
- [x] `offline_unavailable` tem produtor e é distinguível de `technical`.
      — Verificado: `classifySyncError` em `syncBackoff.ts`, teste cobre os três casos.
- [x] `vpg_device_id` sobrevive a `clearLocalDomainCache`.
      — Verificado: `DEVICE_ID_KEY` fica fora de `STORAGE_KEYS`, teste em
      `localStorageRepository.spec.ts`.
- [x] Indicador de pendente é clicável e diz que os dados não foram para a nuvem.
      — Verificado: `buildPendingDeliveryNotice` + faixa clicável no `App.tsx`, teste em
      `appShellViewModel.test.ts`.
- [ ] `schema.sql` sincronizado com produção, conferido pelo procedimento de
      `docs/operations/schema-drift-check.md`.
- [x] Suíte verde, typecheck limpo, build limpo, `get_advisors` sem advertência nova.
      — Verificado: 600 testes `node:test` + 135 `vitest` passam, `tsc --noEmit`
      limpo, `vite build` limpo, `get_advisors` sem nova advertência (todas
      pré-existentes).

## 12. Limitação conhecida

Partida a frio sem rede continua bloqueada pelo portão de autenticação (seção 3.2).
Não é regressão deste plano — é o estado atual, agora documentado. Endereçá-la exige
persistir o `AccountSnapshot` e decidir por quanto tempo uma sessão em cache pode ser
considerada válida sem confirmação do servidor, o que é uma decisão de segurança
própria, não um detalhe de implementação.
