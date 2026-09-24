# Dividir o wizard: marcar a pelada ≠ sortear os times

> Levantado em **2026-09-24**, a partir de um defeito em produção: tentar criar
> uma sessão numa comunidade sem elenco montado termina em "para 3 times,
> selecione pelo menos 9 jogadores", sem saída.

## O problema, com a evidência

O wizard tem uma espinha só, e ela assume que **criar uma pelada é sortear os
times**. Isso era verdade quando o organizador montava tudo no dia. Deixou de
ser quando a inscrição passou a decidir quem joga.

Duas provas no código:

1. **`validateSessionSetup` (`src/domain/sessionSetup.ts:99`)** — o passo 0
   valida nome e data; o passo 1 exige 4 atletas; o passo 3 exige
   `teamCount × 3`. A costura entre "não precisa de atleta" e "precisa" cai
   exatamente entre o passo 0 e o passo 1.
2. **`prepareAuthorizedTeamFormation`
   (`src/application/authorizedTeamFormationUseCases.ts:181-238`)** — o sorteio
   parte de `playerCloudIds`, a seleção manual do wizard, e só **depois**
   reconcilia com `window.confirmedPlayerIds`: adiciona quem confirmou e não
   estava selecionado, tira quem estava selecionado e não confirmou.

A segunda é a inversão de fundo. Hoje a lista é uma correção aplicada por cima
da escolha de quem organiza. Deveria ser a fonte.

**Alívio já enviado (`048455d`):** a saída "Marcar pelada" agora aparece ao lado
dos dois erros que exigem atleta. Isso desentope a produção; não corrige a
estrutura, e esta spec é sobre a estrutura.

## Os dois trabalhos

|                     | Marcar a pelada        | Sortear os times            |
| ------------------- | ---------------------- | --------------------------- |
| Precisa de atletas? | Não                    | Sim                         |
| Quando              | Dias antes             | Na hora, com a lista fechada |
| Termina em          | Lista aberta + link    | Times na quadra             |

## Decisões tomadas

**Lista por padrão, mão como escape.** Marcar a pelada abre a lista
automaticamente. A seleção manual continua existindo como caminho de exceção.

**Consequência que o desenho precisa respeitar:** `openRegistration` recusa sem
`communityCloudId` (`registrationUseCases.ts:100`). Comunidade só local **não
consegue abrir lista nenhuma**. Então, sem nuvem, o caminho manual não pode ser
opção escondida — tem que ser o caminho automático, dizendo por quê. Escondê-lo
ali reproduziria o mesmo beco para quem está offline.

**O sorteio parte dos confirmados; o ajuste é exceção.** Quem organiza ainda
tira quem faltou e inclui quem chegou de última hora, mas sobre uma base pronta,
não montando do zero.

## O desenho

### Rota 1 — `/comunidades/:c/sessoes/nova` passa a ser só marcar

Passos: **dados** (nome, data, local) e **formato** (tipo, número de times,
vagas). Nenhum passo de atleta. Termina com a pelada na agenda do grupo e,
quando há nuvem, a lista aberta e o link para compartilhar.

Sem `cloudId`, a mesma tela termina oferecendo o caminho manual, com a frase que
explica: esta comunidade ainda não está na nuvem, então a lista não abre.

### Rota 2 — `/comunidades/:c/sessoes/:s/sortear`

Nasce da tela da inscrição, quando a lista fecha. Parte dos confirmados.
Mantém os passos de regras, prévia e times que já existem, e a seleção manual
vira "ajustar quem joga" — uma ação sobre a base, não a entrada dela.

### O caminho manual

É o wizard de hoje, preservado para a pelada avulsa e para a comunidade sem
nuvem. Não é uma terceira tela: é a rota 2 aceitando começar sem lista.

## As entradas, e onde cada uma aterrissa

Todas convergem hoje para `paths.sessaoNova`:

| Entrada                                      | Depois da divisão          |
| -------------------------------------------- | -------------------------- |
| `AppShell.tsx:371` ("marcar pelada")          | rota 1                     |
| `CommunityRankingArea.tsx:135`                | rota 1                     |
| cartão de rascunho (`globalRoutes.tsx:94`)    | rota 1, retomando o rascunho |
| `resolveNewSessionPath` (`appRoutes.ts:186`)  | rota 1                     |
| `pathForLegacyPage('session-wizard')`         | rota 1                     |
| tela da inscrição, lista fechada              | **rota 2** (nova)          |

Dividir o conteúdo de `/sessoes/nova` cobre as cinco primeiras de uma vez; o que
cada uma muda é só o destino, não a navegação.

## O que não muda

- `SessionWizard.tsx` continua sendo o mesmo componente grande. A divisão é de
  **fluxo**, não um reescrever; partir o arquivo é dívida separada
  (`CLAUDE.md`, "split candidate").
- Nenhum comando do servidor muda. `prepareAuthorizedTeamFormation` passa a
  receber os confirmados como entrada em vez de reconciliá-los por cima, mas os
  RPCs são os mesmos.
- A pelada avulsa sem comunidade (`/comecar`) não é tocada.

## Riscos

- **Rascunho em andamento.** Quem tiver um `activeSession` no meio do wizard
  quando a divisão subir precisa cair num estado coerente. `resolveWizardRoute`
  já trata adoção de rascunho; o desenho precisa de um teste para o rascunho
  com atletas já selecionados.
- **O sorteio autorizado é a única porta para `create_target_session` por
  tela.** Mexer na ordem dos comandos ali arrisca o caminho que a XS-W6-08c
  abriu. Os testes de `authorizedTeamFormationUseCases` são a rede.

## Decidido em 2026-09-24, fechando a spec

**As vagas viram campo próprio, com sugestão.** Ao marcar, o campo já vem
preenchido com `teamCount × 6` e quem organiza muda se quiser. A vaga é o que o
grupo vê e disputa — merece ser explícita, não derivada de uma conta escondida.
E desamarra a lista do número de times, que é decisão de sorteio e acontece
depois.

**Fechar a lista é um passo separado do sorteio.** Quem organiza fecha, confere
quem ficou, e só então sorteia. Custa um toque a mais num momento de pressa, e o
desenho precisa cobrir isso: a tela de sorteio, com a lista ainda aberta, não
pode simplesmente recusar — tem que oferecer o fechamento ali, com a conferência
à vista. Esquecer de fechar não pode virar a nova reclamação.

Consequência no código: `prepareAuthorizedTeamFormation` hoje fecha e trava a
janela sozinho quando a encontra `OPEN` (`authorizedTeamFormationUseCases.ts:192`).
Esse trecho sai do caminho automático e vira ação de tela.
