# Avaliação da comunidade — uma área própria para quem avalia

Primeira de três partes decididas em 2026-09-25 (`docs/PERMISSOES.md`, seção E):

1. **Avaliação da comunidade** — esta spec.
2. Perfil do atleta em Pessoas: tocar num atleta abre a carta, não a edição; a edição de atleta sem
   conta vai para a Gestão.
3. Ficha preenchida pelo próprio atleta.

Ordem **1 → 3 → 2**: tirar a edição de Pessoas antes de a avaliação ter casa deixaria ninguém
avaliando, e antes de o atleta cuidar da própria ficha deixaria os dados dele sem dono.

## Por quê

- A avaliação versionada por fundamento está ativa em todas as comunidades desde XS-W6-08a, mas
  o formulário (`CommunityEvaluationEditor`) mora dentro da tela de edição do atleta, que a parte 2
  tira de Pessoas.
- Quem avalia, no servidor, é quem tem a responsabilidade `EVALUATOR`. Em produção, em
  2026-09-25, **ninguém tem `EVALUATOR`**: há 6 `ORGANIZER` de dono e 1 de admin, e nenhum
  avaliador. Nenhuma comunidade consegue avaliar.
- O cliente decide pelo cargo (`canEvaluatePlayer` = owner/admin) e nunca pergunta ao servidor;
  um avaliador designado que seja membro não teria como chegar à tela.

## Decisões tomadas com o usuário

1. **Dono e admin avaliam pelo cargo, e podem designar outros avaliadores.** Muda a regra
   GINV-CAP-002 ("cargo não dá capacidade operacional") para esta capacidade, que foi escrita na
   spec de 2026-09-06 (`community-evaluation-editor`) como "do not automatically grant evaluation
   capability from governance rank".
2. **Ninguém se avalia** — com uma exceção:
3. **Autoavaliação provisória.** Quem é o **único avaliador da comunidade** pode se avaliar. Essa
   nota vale **só enquanto ninguém mais tiver avaliado essa pessoa** naquela comunidade; a primeira
   nota de outra pessoa a tira da conta, sem apagá-la. Quando surge um segundo avaliador, o
   primeiro não pode mais alterar a própria nota, mas a que deu continua valendo até ser avaliado.
4. **Atleta sem conta pertence a uma comunidade só.** Não há convidado compartilhado. Em produção,
   0 dos 33 atletas sem conta estão em mais de uma comunidade.
5. **A média do grupo não aparece durante a avaliação**, para não ancorar a nota.

## Parte 1 — Servidor

Uma migration, `20260925130000_avaliacao_da_comunidade.sql`, com teste escrito antes. Cada função
é redefinida a partir da **última** definição, repetindo `security definer` e `search_path`.

### 1.1 Dono e admin avaliam pelo cargo

`public.community_capabilities` — última definição em
`20260905185744_versioned_player_evaluation_source.sql`. Os ramos `owner` e `admin` passam a
incluir `player.evaluate`; o ramo `EVALUATOR` continua. Nada é gravado: quem perde o cargo perde a
capacidade no mesmo instante. O comentário da função troca "never derived from owner or admin rank"
pela regra nova e sua data.

Consumidores que passam a valer sem mudança, todos por
`current_user_has_community_capability(…, 'player.evaluate')`: `record_player_evaluation`,
`record_community_player_evaluation`, `get_community_evaluation_editor`,
`get_community_player_skill_profile`.

### 1.2 A marca de autoavaliação

Nova coluna `player_evaluation_contributions.is_self_assessment boolean not null default false`,
gravada no momento da escrita. **Não é deduzida depois**: quando a conta de quem avaliou é apagada,
`evaluator_user_id` vira `null`, e uma dedução passaria a contar a autoavaliação como nota de outra
pessoa.

Uma contribuição é autoavaliação quando quem grava tem vínculo `ACTIVE` em `player_account_links`
com o atleta avaliado, ou é o `players.user_id` dele.

### 1.3 Quem pode gravar na própria ficha

`public.record_player_evaluation` — última definição em `20260906130635_skill_rubric_contract.sql`,
o ponto mais baixo, por onde passam os dois caminhos de escrita. Para uma autoavaliação:

- recusa com `42501` e `Only the sole evaluator of this Community can assess themselves` quando
  existe, na comunidade, outra pessoa com `player.evaluate` além de quem grava;
- caso contrário grava com `is_self_assessment = true`.

"Pessoas com `player.evaluate`" = membros ativos com cargo `owner` ou `admin` em
`community_memberships`, mais quem tem `EVALUATOR` não revogado. O reenvio de um comando já
registrado devolve o recibo, como hoje, sem reavaliar a regra.

### 1.4 A autoavaliação sai da conta quando há outra nota

`app_private.compute_community_player_skill_profile` — definição única em
`20260908031027_global_skill_profile.sql`. No CTE `contributions`, uma contribuição com
`is_self_assessment` só entra quando **não existe** contribuição efetiva sem a marca para o mesmo
atleta, comunidade e rubrica. O perfil global (`compute_global_player_skill_profile`) e o sorteio
(`capture_balance_input_snapshot`) leem essa função e herdam a regra.

### 1.5 A lista da tela

Nova `public.list_community_evaluation_roster(p_community_id uuid) returns jsonb`,
`stable security definer`, `search_path = ''`, executável só por `authenticated`.

- Sem `player.evaluate`: `42501`, `Not authorized to evaluate Players in this Community`.
- Devolve os atletas com vínculo vivo em `community_players`:
  `{player_id, name, nickname, position, has_account, my_last_evaluated_at: timestamptz|null,
  is_self: boolean}`.
- Quem pede **só aparece** quando pode se autoavaliar (1.3), com `is_self = true`.
- Não devolve nota de ninguém, nem quem mais avaliou.

### 1.6 Atleta sem conta numa comunidade só — movido para a parte 2

Decidido com o usuário em 2026-09-25, ao escrever o plano. O gatilho em `community_players`
quebraria dois fluxos que existem hoje: **duplicar com atletas** põe os mesmos atletas na comunidade
nova, e o **modal de convidado** reaproveita um atleta de outra comunidade
(`findDuplicatePlayerByProfile`). A parte 2 redesenha como nasce e quem edita o atleta sem conta, e
o gatilho entra lá junto com a correção desses dois fluxos. Em produção a regra já vale nos dados
(0 casos).

### Testes — `src/test/db/avaliacaoDaComunidade.dbtest.ts`

- dono e admin gravam sem `EVALUATOR`; membro não grava; membro com `EVALUATOR` grava;
- admin rebaixado a membro deixa de gravar na mesma hora;
- com dois avaliadores, a nota na própria ficha é recusada, por `record_player_evaluation` direto e
  por `record_community_player_evaluation`;
- o único avaliador se avalia, e a nota entra no perfil;
- outra pessoa avalia e a autoavaliação sai do perfil, sem ser apagada;
- depois de surgir um segundo avaliador, a própria nota não pode mais ser alterada e continua
  valendo até alguém avaliar;
- a autoavaliação de uma conta apagada continua marcada e continua saindo da conta;
- a lista recusa quem não avalia, não traz notas, e só inclui quem pede quando é autoavaliação;

Antes de escrever, ler o que protegem `communityEvaluationEditor`, `communitySkillProfile`,
`governanceCapabilities` e `playerEvaluationContributions`. Pelo menos uma afirma que o cargo não dá
avaliação e **vai quebrar de propósito**: a assertiva muda, e o commit diz qual e por quê.

## Parte 2 — Cliente

### 2.1 Saber o que o servidor permite

Hook `useCommunityCapabilities(community)`: chama `community_capabilities(cloudId, uid)` uma vez
por comunidade e conta, e devolve o conjunto de capacidades com `resolved`. Sem nuvem ou sem
`cloudId`, devolve vazio e `resolved = true`. Nesta fatia decide só a Avaliação; corrigir com ele o
desencontro de "Deixar organizar" (`PERMISSOES.md`, A1) fica para depois.

### 2.2 O item "Avaliação" no menu

`getShellNavigationItems` ganha `showEvaluation`, e o `AppShell` o passa como
`resolved && capacidades.has('player.evaluate')`. Rotas novas em `AppRouter`, dentro do
`AccountGate`: `avaliacao` e `avaliacao/:playerId`. Sem a capacidade, as duas redirecionam para a
Visão geral depois de resolvidas.

### 2.3 A lista

- Linha de progresso: "Você avaliou 8 de 14 atletas".
- Pendentes primeiro; depois avaliados, com a data da sua última nota.
- Cada linha: apelido ou nome, posição, selo "sem conta" quando for o caso.
- A própria ficha, quando `is_self`, no topo: "Você — autoavaliação provisória. Vale até alguém
  avaliar você." com o convite para designar alguém em Gestão → Membros (dono e admin).
- Vazio: "Ninguém no elenco ainda." Completo: "Todos avaliados — as notas podem ser revistas a
  qualquer momento."
- Falha: sem conexão, "A avaliação precisa de conexão."; comunidade sem nuvem, "Sincronize esta
  comunidade antes de avaliar."

### 2.4 O formulário

Reaproveita a lógica do `CommunityEvaluationEditor` — leitura da própria nota, ids do comando,
nova tentativa em falha de rede, conflito `40001` — sem a parte de designar avaliadores.

- Os 11 fundamentos da rubrica `v0-legacy-11`, de 0 a 10, preenchidos com a sua nota anterior;
  em branco quer dizer "não sei avaliar isso"; ao menos uma nota é exigida.
- Salvar volta à lista e sugere o próximo pendente.
- Não mostra a média do grupo.

### 2.5 Designar avaliadores em Gestão → Membros

Ao lado de "Deixar organizar", "Deixar avaliar" / "Tirar a avaliação", chamando
`set_community_evaluator`, visível para quem gerencia membros e nas mesmas linhas editáveis (o que
já exclui dono, a própria pessoa e — desde 2026-09-25 — outro admin para quem é admin). As linhas de
dono e admin mostram o selo "Avalia pelo cargo".

### 2.6 O que sai da edição do atleta

O bloco "Avaliar atleta nesta comunidade" sai de `PlayerEditView`; no lugar, um link para a
Avaliação daquele atleta, visível com `player.evaluate`. O resto da edição fica como está até a
parte 2.

### Testes

- unitários: o modelo da lista (ordem, progresso, autoavaliação no topo) e `showEvaluation`;
- UI (`.spec.tsx`): lista em cada estado, formulário, "Deixar avaliar" em Membros — os specs fixam
  as props, porque `tsc` aqui não pega prop desconhecida;
- bancada em `preview/` com lista e formulário em cada estado, vista no navegador.

Antes de escrever os componentes, `/impeccable shape` para a lista e o formulário. A forma de dar
a nota (número, passos ou deslizante) é decidida ali.

## Publicação

1. Migration em produção primeiro. É compatível com o app atual: o formulário antigo continua
   funcionando, e dono e admin passam a gravar por ele.
2. Conferir por leitura: `community_capabilities` de um dono e de um admin incluem
   `player.evaluate`; atributos das funções redefinidas; advisors de segurança.
3. Push do front, que publica na Vercel, só com o ok do usuário.

## Documentos, no mesmo commit

- `docs/PERMISSOES.md`: A3 resolvido.
- `docs/JORNADA.md`: uma etapa de avaliação, com as perguntas respondidas, incluindo o admin
  sozinho.
- `2026-09-06-community-evaluation-editor-design.md`: nota de que a regra do cargo mudou em
  2026-09-25, apontando para esta spec.

## Fora desta fatia

- Carta do atleta em Pessoas, remoção da edição de terceiros e edição de atleta sem conta na
  Gestão → parte 2.
- Gatilho "atleta sem conta numa comunidade só", com a correção de duplicar e do convidado → parte 2
  (ver 1.6).
- Ficha preenchida pelo próprio atleta → parte 3.
- O que o atleta vê da própria avaliação → parte 2.
- Destino da autoavaliação antiga (`self_evaluations`), que não entra no sorteio → aberto na
  JORNADA.
- Mostrar a média do grupo a quem avalia.
