# Tela de inscrição da pelada

Dar interface à onda W4, que hoje roda inteira escondida atrás do botão de gerar times: janela de
inscrição, capacidade, confirmados e reserva. O organizador abre a inscrição dias antes; os atletas
se inscrevem sozinhos; o sorteio usa a lista que nasceu daí.

## O problema

A W4 está pronta no servidor desde 2026-09: `create_registration_window`, `open/close/lock`,
`join_registration`, `leave_registration`, `add/remove_registration_entry`,
`change_registration_capacity`, `finalize_session_roster` e, desde a XS-W6-08c, `reopen_registration`.
Nada disso tem tela.

A XS-W6-08c ligou esses comandos ao wizard, mas como uma cadeia invisível: ao gerar os times, o app
cria a janela, inscreve os selecionados, fecha, trava e finaliza o elenco em segundos. Ninguém vê
capacidade, ninguém vê reserva, e a inscrição não existe como momento — só como efeito colateral do
sorteio.

O caso que motivou esta fatia: **a pelada é quinta e o organizador quer abrir a inscrição na
segunda**, para as pessoas se organizarem. Hoje isso é impossível, porque a janela só nasce no
instante do sorteio.

## Decisões (2026-09-22)

1. **A inscrição pertence à sessão marcada**, não ao momento do sorteio. Ela vive enquanto a pelada
   está marcada.
2. **Organizador e atleta operam a mesma tela**: o atleta se inscreve e desiste sozinho; o
   organizador também inclui e tira quem precisar.
3. **Passar da capacidade entra na reserva**, e quem desiste libera a vaga para o primeiro da
   reserva. Nesta fatia a ordem é a de chegada, que é o que o servidor já faz.
4. **Portas de entrada:** a Agenda e um cartão da próxima pelada na página inicial, além da lista de
   sessões da comunidade.
5. **A lista mostra o que o app já mostra hoje** — nome, posição, overall dos atributos locais e
   presença recente. A avaliação versionada da comunidade continua visível só para quem avalia.
6. **Sem internet, ninguém se inscreve.** A tela explica; nada fica marcado localmente para subir
   depois.

## O que fica para a fatia seguinte

O modelo de produto é mais largo do que esta fatia: **a vaga se confirma pelo pagamento**. O
organizador marca cada atleta como pago, a reserva passa a ser ordenada por quem pagou primeiro (e
só depois por ordem de chegada), o organizador pode ajustar essa ordem, e a lista só fecha para o
sorteio quando o pagamento está em dia.

Nada disso existe no servidor hoje, e duas decisões de arquitetura registradas dizem o contrário:
`OPEN-REG-005` deixou pagamento fora do V1, e `OPEN-REG-004` fixou a ordem estritamente por chegada.
A fatia do pagamento reabre as duas — deliberadamente, por decisão de produto de 2026-09-22 — e terá
spec própria. Esta fatia entrega a base sobre a qual aquela vai operar, e a ordem da reserva que ela
mostra hoje vai mudar lá.

## Leitura: o que falta no servidor

`read_registration_window`, criada pela XS-W6-08c, não serve para esta tela:

- autoriza por `assert_target_session_write_authorized`, ou seja, só quem organiza — e o atleta
  precisa ler a própria inscrição;
- devolve só `confirmed_player_ids`, sem a reserva, sem a ordem e sem a origem de cada entrada.

Esta fatia acrescenta `read_registration_board(p_window_id)`, autorizada por
`app_private.current_user_can_read_target_session`, que já aceita membro ativo da comunidade. Ela
devolve:

```text
window_id, session_id, status, revision, capacity, opened_at, closed_at,
entries: [{ entry_id, player_id, status, queue_position, source, joined_at }]
```

`queue_position` é a posição na reserva, derivada de `queue_sequence` — 1 para o primeiro da fila.
Confirmados vêm com `queue_position` nulo. A ordem das entradas é: confirmados por `joined_at`,
depois reserva por `queue_sequence`.

`read_registration_window` continua como está, porque a cadeia do sorteio depende dela.

Também falta uma leitura por sessão: a tela abre a partir da sessão, e não da janela. A mesma
migration acrescenta `read_session_registration(p_session_id)`, que devolve o mesmo formato ou nada
quando a sessão ainda não tem janela.

## A tela

Uma área por sessão, em `/comunidades/:id/sessoes/:sessionId/inscricao`, com dois modos derivados da
permissão que o app já calcula para a comunidade.

**Organizador** vê o estado da janela e a capacidade, as duas listas — confirmados e reserva, na
ordem — e opera: abrir, fechar, reabrir, mudar a capacidade, incluir um atleta do elenco e tirar
alguém. Cada ação é um comando com id guardado antes do envio, como na cadeia da XS-W6-08c, então
repetir não duplica.

**Atleta membro** vê o estado, quantas vagas restam, as mesmas listas e a própria situação:
confirmado, na reserva com a posição, ou fora. Tem um botão só, que alterna entre se inscrever e
desistir.

Quem não é membro da comunidade não abre a tela: o servidor recusa a leitura, e o app manda para a
visão geral da comunidade.

**Antes de a janela existir**, a tela mostra o que falta e, para o organizador, o botão de abrir a
inscrição, com a capacidade sugerida pelas regras da comunidade. Abrir cria a Session target no
servidor se ela ainda não existir — hoje isso só acontece pelo sync ou pelo sorteio.

## As portas

- **Agenda:** cada pelada marcada leva à inscrição, em vez de levar à sessão sem contexto.
- **Página inicial:** um cartão da próxima pelada com o estado da inscrição — quantos confirmados,
  quantas vagas, e a situação de quem está olhando.
- **Sessões da comunidade:** a sessão marcada ganha o mesmo atalho.

## O sorteio adota a janela

`prepareAuthorizedTeamFormation` hoje cria a janela e inscreve a seleção do wizard. Passa a:

1. adotar a janela existente da sessão, quando existir;
2. **usar os confirmados como elenco**, em vez da seleção local — a seleção do wizard deixa de
   competir com a inscrição;
3. fechar e travar a janela ainda aberta, como já faz.

A etapa de atletas do wizard, numa sessão com inscrição aberta, passa a mostrar os confirmados e um
link para a inscrição, em vez da seleção livre. Sessão rápida e comunidade local seguem intocadas.

## Erros

As mensagens reaproveitam `classifyAuthorizedFormationFailure`, que a XS-W6-08c já usa, com três
acréscimos em pt-BR:

- `42501` ao se inscrever: "Você precisa ser membro ativo desta comunidade para se inscrever."
- janela fechada (`23514`): "A inscrição está fechada. Fale com quem organiza."
- `40001`: "A lista mudou enquanto você olhava. Atualize e tente de novo."

## Verificação

- **Banco:** uma suíte nova cobre a tela inteira contra PostgreSQL real — abrir, inscrever até
  encher, reserva na ordem, desistir e promover, organizador incluindo e tirando, mudar capacidade
  abaixo do confirmado (recusa), fechar, reabrir e finalizar; mais a autorização das duas leituras
  novas: membro lê, estranho e anônimo não.
- **Caso de uso:** id de comando guardado antes da chamada, repetição sem duplicar, classificação de
  erro.
- **Tela:** os dois modos, a posição na reserva, o botão que alterna, e o estado sem janela.
- **Rotas:** a área nova, as portas da Agenda e do painel.

## Fora do escopo

Pagamento e a ordem por pagamento (fatia seguinte). Aviso de vaga liberada por notificação ou
WhatsApp — é a onda W10; a lista de WhatsApp que já existe continua servindo para chamar o pessoal.
Inscrição em sessão rápida. Convidado sem conta continua entrando pela mão do organizador.
