# Pagamento na inscrição da pelada

A vaga passa a se confirmar pelo pagamento. O organizador marca cada atleta como pago, a reserva é
ordenada por quem pagou primeiro, um prazo opcional derruba quem não pagou, e a lista só fecha para
o sorteio quando o pagamento está em dia.

## O problema

A fatia anterior deu tela à inscrição: o organizador abre a lista na segunda, os atletas se
inscrevem sozinhos, quem passa da capacidade entra na reserva. A ordem é estritamente a de chegada.

Na pelada real, a ordem de chegada não é o que decide quem joga — **o pagamento é**. Quem se
inscreve e não paga está ocupando a vaga de alguém que pagaria. Hoje isso se resolve no WhatsApp,
com o organizador cobrando um por um e refazendo a lista na mão antes do sorteio, que é exatamente o
trabalho que o app deveria tirar dele.

O caso que motivou esta fatia: **a pelada é quinta, a lista abre na segunda, e o organizador quer
dar até quarta ao meio-dia para o pessoal pagar.** Passado o prazo, quem não pagou perde a vaga para
quem pagou e estava na reserva.

## Decisões (2026-09-23)

1. **Pagamento é um segundo eixo, não um estado novo.** `status` responde "está dentro?",
   `queue_sequence` responde "chegou quando?", `paid_at` responde "quitou?". Três perguntas
   independentes, três colunas.
2. **Quem marca é só quem organiza.** Uma fonte de verdade, sem aviso do atleta para conferir
   depois. O atleta vê a própria situação e a chave PIX que a comunidade já guarda.
3. **O app não guarda valores.** Ele responde "essa lista está quitada?" e nada mais. Sem preço por
   pelada, sem total arrecadado, sem estorno. O dinheiro continua no PIX e no WhatsApp.
4. **Antes do prazo, a ordem de chegada manda.** Pagar não toma a vaga de ninguém; ordena a reserva.
5. **Passado o prazo, quem não pagou cai para o fim da reserva** e quem pagou sobe. Perder o prazo
   custa a vaga, não a pelada.
6. **O prazo é opcional.** Sem `payment_due_at`, nada é cortado: o pagamento só ordena a reserva e
   trava o sorteio.
7. **O corte roda no próximo comando**, não num serviço de relógio. Nada novo passa a rodar sozinho
   em produção.

### O que estas decisões reabrem

`OPEN-REG-004` (categorias de vaga protegida/reservada adiadas, FIFO estrito como base do V1) e
`OPEN-REG-005` (pagamento, cancelamento e estorno fora de escopo), ambas `DEFERRED` desde a
XS-W4-01. Esta fatia as reabre por decisão de produto, e a `XS-W4-01` registra em não-objetivos
justamente estes dois pontos — a spec daquela fatia continua correta para o que ela entregou; o que
muda é a decisão, não o histórico.

Estorno e cancelamento **continuam fora**. `OPEN-REG-005` é reaberta só na parte de pagamento.

## O que o banco passa a guardar

Em `registration_windows`:

- `payment_due_at timestamptz null` — o prazo. Nulo significa sem corte.
- `payment_deadline_applied_at timestamptz null` — torna o corte idempotente: aplicado uma vez para
  um dado `payment_due_at`, não reaplica.

Em `registration_entries`:

- `paid_at timestamptz null` — quando o organizador marcou. Desmarcar volta a nulo.
- `paid_marked_by_user_id uuid null references auth.users(id) on delete set null` — quem marcou.
- `payment_lapsed_at timestamptz null` — quando perdeu o prazo. É o que separa "ainda não pagou" de
  "perdeu a vaga por não ter pago".
- `reserve_rank bigint null` — o ajuste manual do organizador.

`queue_sequence` **não é reescrito por nada desta fatia**. Ele é o fato auditável de quem chegou
quando, e a ordem da reserva é derivada dele, não o substitui.

### Por que não das outras formas

- **Estados novos em `status`** (`CONFIRMED_PAID`, `WAITLISTED_PAID`) multiplicariam a máquina de
  estados por dois, quebrariam `registration_entries_status_check` e toda consulta que compara
  `status = 'CONFIRMED'`, incluindo `promote_waitlist_to_capacity`, `finalize_session_roster` e a
  cadeia do sorteio da XS-W6-08c.
- **Uma tabela `registration_payments` com histórico** só se paga se houver valores, parcelas ou
  estorno. Não há. Os comandos já deixam rastro em `app_private.command_receipts`.

## A ordem da reserva

Quatro faixas, nesta ordem:

1. quem o organizador fixou no topo — `reserve_rank` não nulo, crescente;
2. quem pagou — `paid_at` crescente;
3. quem ainda não pagou — `queue_sequence` crescente;
4. quem perdeu o prazo — `payment_lapsed_at` não nulo, `queue_sequence` crescente.

Isso produz o caso pedido: o terceiro a se inscrever, se paga primeiro, vira o primeiro da reserva.

A ordem vive em **uma função só**, `app_private.registration_reserve_order(p_window_id)`, usada pela
promoção e pela leitura do quadro. Duas implementações da mesma regra divergiriam no primeiro
ajuste.

### O ajuste manual

Uma ação: **subir ao topo da reserva**. Grava `reserve_rank` como `min(reserve_rank) - 1` entre as
entradas da janela, ou `0` quando nenhuma tem valor. Não renumera ninguém.

Reordenação livre, com arrastar e soltar, fica fora: o caso real é "o Fulano me pagou em dinheiro na
mão, sobe ele", e ordenação arbitrária exigiria renumerar a fila a cada gesto e decidir o que
acontece com a regra derivada depois disso.

## Marcar e desmarcar

`mark_registration_payment(p_command_id, p_window_id, p_player_id, p_paid)` faz três coisas quando
`p_paid` é verdadeiro: grava `paid_at` e quem marcou, **limpa `payment_lapsed_at`** — quem foi
rebaixado por engano volta a concorrer pela faixa dos pagos, não pela dos atrasados — e roda a
promoção, porque a entrada pode ter acabado de se tornar promovível.

Desmarcar grava `paid_at` nulo e **não rebaixa ninguém**. Um confirmado desmarcado continua
confirmado; o que acontece é que o sorteio volta a recusar até alguém resolver. Desmarcar é uma
correção do organizador, não uma punição ao atleta, e rebaixar automaticamente faria um erro de
digitação custar a vaga de alguém.

## O prazo

Quando `now() >= payment_due_at` e `payment_deadline_applied_at` é nulo ou anterior ao
`payment_due_at` corrente, o corte:

1. marca `payment_lapsed_at = now()` e rebaixa para `WAITLISTED` toda entrada `CONFIRMED` com
   `paid_at` nulo;
2. preenche as vagas abertas pela ordem da reserva, **promovendo apenas quem tem `paid_at`** —
   promover outro não-pagante recriaria o problema que o corte acabou de resolver;
3. grava `payment_deadline_applied_at = now()`.

O corte é **uma mutação lógica** junto do comando que o disparou: o `revision` da janela sobe uma
vez, como já manda `REG-INV-013`.

### Quem o executa

`app_private.apply_payment_deadline(p_window_id)`, chamada depois da trava da linha e antes da ação
pedida, em três comandos: **marcar pagamento**, o botão **aplicar agora**
(`apply_registration_payment_deadline`) e **travar a inscrição**.

Não em todos os comandos que tocam a janela, como uma versão anterior desta spec dizia. O motivo é
que a regra que importa depois do prazo — "só quem pagou sobe" — mora na promoção, e a promoção já é
chamada por sair, tirar e mudar capacidade. Levar o corte a esses comandos exigiria reescrever oito
funções de comando inteiras para ganhar um efeito que a promoção já produz. O corte roda onde muda
o resultado, e o quadro mostra o corte pendente enquanto ele não rodou.

O corte **só age enquanto a janela está `OPEN`**. Depois de fechada ou travada, quem cura a lista é
o organizador, pela mão — o prazo já fez o que tinha para fazer.

A leitura do quadro **calcula** o corte pendente sem escrever — ela é `stable` — e o devolve em
`pending_deadline_cut`, para a tela poder dizer quem sai e quem entra antes de acontecer.

### O pior caso

O organizador marca o prazo, todos pagam por PIX, e ele esquece de marcar. Ao meio-dia, no próximo
comando, os doze caem para a reserva e nenhum é promovível.

Três coisas seguram isso, e nenhuma delas é um caso especial no código:

- a tela avisa antes, com quantos faltam e quanto tempo resta;
- o corte se desfaz na prática: marcar como pago promove imediatamente para as vagas que o corte
  acabou de abrir, porque marcar pagamento também roda a promoção;
- `payment_lapsed_at` é limpo quando o organizador marca a entrada como paga, então quem foi
  rebaixado por engano volta a concorrer pela faixa 2, não pela 4.

É o ponto mais afiado do desenho e está registrado como tal.

## O sorteio

`lock_registration` passa a recusar com `23514` e `hint = 'REGISTRATION_UNPAID'` enquanto houver
entrada `CONFIRMED` sem `paid_at`, dizendo quantas faltam. Travar é o momento em que a lista para de
receber gente, e é o que a sua frase "a lista só fecha para o sorteio" descreve.

A regra vale para o sorteio transitivamente, porque `finalize_session_roster` já exige a janela
`LOCKED` desde a XS-W4-05: sem travar não há elenco, e sem pagamento em dia não há como travar. Pôr
a guarda em `lock` em vez de em `finalize` troca a reescrita de uma função de 204 linhas pela de uma
de 85, sem abrir buraco na regra.

A saída é sempre legal: marcar como pago — o que o organizador faz quando alguém paga em dinheiro na
quadra, ou quando decide que alguém joga de graça — ou tirar da lista. Marcar como pago significa
"está quitado comigo", não "o dinheiro entrou por PIX".

A cadeia autorizada de formação (`prepareAuthorizedTeamFormation`) já adota a janela aberta desde a
fatia anterior; ela passa a propagar esse erro com mensagem própria em vez do texto genérico.

## A tela

O que muda em `RegistrationBoardView`:

- **Atleta:** uma linha de situação do próprio pagamento no painel do topo — "pagamento em dia",
  "falta pagar, prazo quarta 12h", "você perdeu o prazo e está na reserva" — e, na lista, quem está
  quitado.
- **Organizador:** marcação por linha, o campo de prazo, o contador "11 de 12 pagos", o aviso do
  corte pendente com o botão "aplicar agora", e "subir ao topo" nas linhas da reserva.

A chave PIX já existe na comunidade e aparece para o atleta que ainda não pagou. Esta fatia não
cria cobrança nem integração de pagamento: ela mostra a chave que o grupo já usa.

Estados novos para a bancada em `preview/inscricao.tsx`: prazo definido e distante, prazo próximo
com pendências, prazo vencido com corte pendente, lista quitada pronta para o sorteio, e atleta que
perdeu o prazo.

## Erros

Em pt-BR, somando aos três da fatia anterior:

- travar com pendência: "Ainda falta gente pagar. Marque quem pagou ou tire quem não vai jogar." A contagem não entra na frase porque o quadro já mostra "11 de 12 pagos" ao lado; repetir o número no erro só criaria duas fontes para o mesmo fato.
- marcar pagamento sem ser organizador (`42501`): "Só quem organiza marca pagamento."
- prazo no passado ao definir (`23514`): "O prazo precisa ser depois de agora."

## Verificação

- **Banco, contra PostgreSQL real:** a ordem das quatro faixas; pagar na reserva sobe na fila; o
  corte rebaixa os não pagos e promove os pagos; o corte não promove quem não pagou; idempotência do
  corte; mudar o prazo permite um corte novo; marcar pagamento depois do corte promove de volta; o
  corte não age com a janela fechada; `lock` recusa com pendência e aceita quitado; autorização de
  marcar pagamento.
- **Casos de uso:** id de comando guardado antes da chamada, repetição sem duplicar, classificação
  dos erros novos.
- **Tela:** situação de pagamento do atleta nas três formas, marcação do organizador, aviso de corte
  pendente, contador de pagos, e "subir ao topo".

## Fora do escopo

Valores, preço por pelada, total arrecadado, estorno e cancelamento. Cobrança automática ou
integração com PIX de verdade — a chave continua sendo texto para copiar. Aviso de vaga liberada por
notificação (onda W10). Pagamento em sessão rápida. Histórico de pagamentos entre peladas, que é
assunto de mensalidade e não desta fatia.
