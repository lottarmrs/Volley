# Dividir o wizard — plano de implementação ✅ concluído em 2026-09-24

> **Spec:** [2026-09-24-dividir-o-wizard-design.md](../specs/2026-09-24-dividir-o-wizard-design.md)
>
> **Objetivo:** marcar a pelada deixa de exigir atletas. Quem joga passa a vir da
> lista, e o sorteio vira um momento separado, depois de a lista fechar.

## Restrições globais

- pt-BR em toda a interface, incluindo mensagens de erro.
- Nada de comando novo no servidor. Os RPCs são os que já existem.
- Cada tarefa deixa o app funcionando: nenhuma depende da seguinte para não
  quebrar.
- `SessionWizard.tsx` **não** é partido neste plano. A divisão é de fluxo.
- Sem `communityCloudId` a lista não abre — o caminho manual tem que continuar
  inteiro e explicado.

---

## Tarefa 1 — As vagas viram campo ✅

**Por quê:** hoje a capacidade sai de `teamCount × 6`
(`sessionRoutes.tsx`), e `teamCount` mora no config, que é decisão de sorteio.
Amarra a lista a uma decisão que acontece depois.

**Arquivos**

- `src/shared/types/session.ts` — campo novo
- `src/application/scheduleSessionUseCases.ts` + teste
- `src/components/session/SessionWizard.tsx` — campo no passo 0
- `src/app/routes/sessionRoutes.tsx` — passa para o quadro

- [x] **1.1** Teste: `buildScheduledSessionResult` guarda `registrationCapacity`,
      recusa valor ≤ 0 e sugere `teamCount × 6` quando ausente.
- [x] **1.2** Rodar: falha.
- [x] **1.3** `Session.registrationCapacity?: number`. Fica na Session, não no
      config: é assunto de inscrição, não de sorteio.
- [x] **1.4** Campo "Vagas" no passo 0, ao lado da data, já preenchido.
- [x] **1.5** `useRegistrationBoard` recebe `session.registrationCapacity` e cai
      no cálculo antigo só quando ele não existe.
- [x] **1.6** Rodar tudo. Commit.

---

## Tarefa 2 — Marcar não pede atleta ✅

**Por quê:** é o defeito que o usuário encontrou. O botão primário do passo 0 é
"Próximo", e ele caminha para a exigência de atletas.

**Arquivos**

- `src/components/session/SessionWizard.tsx`
- `src/application/screens/sessionWizard/sessionWizardContract.ts`

- [x] **2.1** Teste de contrato: com `canSchedule`, o modelo expõe
      `primaryAction: 'schedule'`; sem comunidade, `'next'`.
- [x] **2.2** Rodar: falha.
- [x] **2.3** No passo 0, **"Marcar pelada"** vira o botão primário e
      "Escolher atletas na mão" vira o secundário, que leva ao passo 1.
- [x] **2.4** Sem `cloudId`, o primário passa a ser o manual, com a frase:
      esta comunidade ainda não está na nuvem, então a lista não abre.
- [x] **2.5** Rodar tudo. Commit.

---

## Tarefa 3 — Fechar a lista é ação de tela ✅ (replanejada durante a execução)

**O plano original estava errado, e os testes disseram.** Eu ia fazer
`prepareAuthorizedTeamFormation` recusar quando a janela estivesse `OPEN`. Dois
testes que já existiam quebraram, e os dois protegem comportamento deliberado:

- *"com inscrição aberta, o elenco sai dos confirmados e a seleção local não
  manda"* — a XS-W6-08c decidiu que o sorteio **funciona** com inscrição aberta,
  tirando o elenco dos confirmados;
- *"a failure keeps the pending command id, and the retry reuses it"* — na
  retentativa a janela já existe e está `OPEN`, criada pelo próprio sorteio. A
  recusa atingia o retry dele mesmo.

Revertido. A conclusão: **a política não pertence ao motor.** O caso de uso é o
mesmo para os dois caminhos — com lista e sem lista —, e é na tela que eles
diferem. Fechar a lista é decisão de quem organiza; o motor continua sendo o
motor.

- [x] **3.1** "Fechar inscrição" já existia na tela. O que faltava da decisão
      era a confirmação.
- [x] **3.2** Spec: o diálogo diz quantas pessoas ficam e quantas vão para a
      reserva, e desistir não mexe em nada.
- [x] **3.3** Reabrir **não** pede confirmação: não tira nada de ninguém.
- [x] **3.4** Um teste antigo assertava o fechamento num toque só. Atualizado
      para passar pelo diálogo — é exatamente a mudança que a decisão pediu.
- [x] **3.5** Rodar tudo. Commit.

**O gate de "não sortear com a lista aberta" vai para a tarefa 4**, onde ele
pertence: na rota do sorteio.

---

## Tarefa 4 — A rota do sorteio ✅

**Arquivos**

- `src/app/AppRouter.tsx`, `src/application/appRoutes.ts` + teste
- `src/app/routes/sessionRoutes.tsx`
- `src/components/session/RegistrationBoardView.tsx`

- [x] **4.1** Teste: `paths.sortear(c, s)` e o título da rota.
- [x] **4.2** Rota `/comunidades/:c/sessoes/:s/sortear`, montando o wizard a
      partir do passo de formato, com os confirmados já selecionados.
- [x] **4.3** A tela da inscrição, com a lista fechada, oferece **"Sortear os
      times"** apontando para lá.
- [x] **4.4** Teste de rota: sem lista fechada, a rota explica e oferece voltar.
- [x] **4.5** Rodar tudo. Commit.

---

## Fora deste plano

- Partir `SessionWizard.tsx` em arquivos.
- A inversão completa de `prepareAuthorizedTeamFormation` (partir dos
  confirmados em vez de reconciliar). A tarefa 4 encosta nisso ao pré-selecionar
  os confirmados; a inversão de verdade é fatia própria.
- ~~O bloqueio nº 1 da [jornada](../../JORNADA.md)~~ — **feito antes deste
  plano começar**, porque sem ele quem marca a pelada não entraria na própria
  lista e a divisão não faria sentido.
