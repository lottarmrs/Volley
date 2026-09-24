# Dividir o wizard — plano de implementação

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

## Tarefa 1 — As vagas viram campo

**Por quê:** hoje a capacidade sai de `teamCount × 6`
(`sessionRoutes.tsx`), e `teamCount` mora no config, que é decisão de sorteio.
Amarra a lista a uma decisão que acontece depois.

**Arquivos**

- `src/shared/types/session.ts` — campo novo
- `src/application/scheduleSessionUseCases.ts` + teste
- `src/components/session/SessionWizard.tsx` — campo no passo 0
- `src/app/routes/sessionRoutes.tsx` — passa para o quadro

- [ ] **1.1** Teste: `buildScheduledSessionResult` guarda `registrationCapacity`,
      recusa valor ≤ 0 e sugere `teamCount × 6` quando ausente.
- [ ] **1.2** Rodar: falha.
- [ ] **1.3** `Session.registrationCapacity?: number`. Fica na Session, não no
      config: é assunto de inscrição, não de sorteio.
- [ ] **1.4** Campo "Vagas" no passo 0, ao lado da data, já preenchido.
- [ ] **1.5** `useRegistrationBoard` recebe `session.registrationCapacity` e cai
      no cálculo antigo só quando ele não existe.
- [ ] **1.6** Rodar tudo. Commit.

---

## Tarefa 2 — Marcar não pede atleta

**Por quê:** é o defeito que o usuário encontrou. O botão primário do passo 0 é
"Próximo", e ele caminha para a exigência de atletas.

**Arquivos**

- `src/components/session/SessionWizard.tsx`
- `src/application/screens/sessionWizard/sessionWizardContract.ts`

- [ ] **2.1** Teste de contrato: com `canSchedule`, o modelo expõe
      `primaryAction: 'schedule'`; sem comunidade, `'next'`.
- [ ] **2.2** Rodar: falha.
- [ ] **2.3** No passo 0, **"Marcar pelada"** vira o botão primário e
      "Escolher atletas na mão" vira o secundário, que leva ao passo 1.
- [ ] **2.4** Sem `cloudId`, o primário passa a ser o manual, com a frase:
      esta comunidade ainda não está na nuvem, então a lista não abre.
- [ ] **2.5** Rodar tudo. Commit.

---

## Tarefa 3 — Fechar a lista é ação de tela

**Por quê:** decisão da spec. Hoje `prepareAuthorizedTeamFormation` fecha e trava
a janela sozinho (`authorizedTeamFormationUseCases.ts:192`), escondendo de quem
organiza o momento em que as vagas congelam.

**Arquivos**

- `src/application/authorizedTeamFormationUseCases.ts` + teste
- `src/components/session/RegistrationBoardView.tsx` + spec
- `src/hooks/useRegistrationBoard.ts`

- [ ] **3.1** Teste: com a janela `OPEN`, `prepareAuthorizedTeamFormation`
      recusa com frase própria em vez de fechar sozinho.
- [ ] **3.2** Rodar: falha.
- [ ] **3.3** Tirar o `inscricaoAberta` do caminho automático.
- [ ] **3.4** Spec: a tela da inscrição ganha **"Fechar a lista"** para quem
      organiza, com a confirmação dizendo quantas pessoas ficam e quantas saem.
- [ ] **3.5** Implementar. Rodar tudo. Commit.

**Risco nomeado:** este é o caminho que a XS-W6-08c abriu para
`create_target_session` por tela. Os testes de `authorizedTeamFormationUseCases`
são a rede; se algum ficar vermelho, parar e reavaliar em vez de ajustar o teste.

---

## Tarefa 4 — A rota do sorteio

**Arquivos**

- `src/app/AppRouter.tsx`, `src/application/appRoutes.ts` + teste
- `src/app/routes/sessionRoutes.tsx`
- `src/components/session/RegistrationBoardView.tsx`

- [ ] **4.1** Teste: `paths.sortear(c, s)` e o título da rota.
- [ ] **4.2** Rota `/comunidades/:c/sessoes/:s/sortear`, montando o wizard a
      partir do passo de formato, com os confirmados já selecionados.
- [ ] **4.3** A tela da inscrição, com a lista fechada, oferece **"Sortear os
      times"** apontando para lá.
- [ ] **4.4** Teste de rota: sem lista fechada, a rota explica e oferece voltar.
- [ ] **4.5** Rodar tudo. Commit.

---

## Fora deste plano

- Partir `SessionWizard.tsx` em arquivos.
- A inversão completa de `prepareAuthorizedTeamFormation` (partir dos
  confirmados em vez de reconciliar). A tarefa 4 encosta nisso ao pré-selecionar
  os confirmados; a inversão de verdade é fatia própria.
- O bloqueio nº 1 da [jornada](../../JORNADA.md): quem cria a comunidade não
  vira atleta. É **pré-requisito de produto** para este plano fazer sentido —
  sem ele, quem marca a pelada não consegue entrar na própria lista.
