import assert from 'node:assert/strict';
import test from 'node:test';
import type { RegistrationBoard, Session } from '@shared/types';
import { makeSession } from '../test/fixtures';
import type { RegistrationBoardGateway } from './registrationBoardGateway';
import {
  addAthleteToRegistration,
  changeRegistrationCapacity,
  joinRegistration,
  leaveRegistration,
  openRegistration,
  removeAthleteFromRegistration,
  setRegistrationOpen,
} from './registrationUseCases';

const coded = (code: string) => Object.assign(new Error(code), { code });

function quadro(overrides: Partial<RegistrationBoard> = {}): RegistrationBoard {
  return {
    windowId: 'w-1',
    sessionId: 'cloud-session',
    status: 'OPEN',
    revision: 2,
    capacity: 12,
    confirmedCount: 1,
    waitlistedCount: 0,
    paymentDueAt: null,
    paidCount: 0,
    viewerCanManage: true,
    viewerPlayerId: 'p-1',
    viewerEntryStatus: 'CONFIRMED',
    viewerQueuePosition: null,
    viewerPaidAt: null,
    pendingDeadlineCut: null,
    entries: [],
    ...overrides,
  };
}

function fakeGateway(options: { sessionExists?: boolean; falhas?: unknown[] } = {}) {
  const chamadas: string[] = [];
  const falhas = options.falhas ?? [];
  const registrar = (nome: string) => {
    chamadas.push(nome);
    if (falhas.length > 0) throw falhas.shift();
  };
  const gateway: RegistrationBoardGateway = {
    async readSessionBoard() {
      registrar('readSessionBoard');
      return quadro();
    },
    async readBoard() {
      registrar('readBoard');
      return quadro();
    },
    async join(input) {
      registrar(`join:${input.commandId}`);
      return 'WAITLISTED';
    },
    async leave(input) {
      registrar(`leave:${input.commandId}`);
    },
    async createTargetSession() {
      registrar('createTargetSession');
      if (options.sessionExists) throw coded('23505');
      return { id: 'cloud-session' };
    },
    async readTargetSession() {
      registrar('readTargetSession');
      return { id: 'cloud-session' };
    },
    registration: {
      async createWindow(input) {
        registrar(`createWindow:${input.capacity}`);
        return 1;
      },
      async openWindow() {
        registrar('openWindow');
        return 2;
      },
      async reopenWindow() {
        registrar('reopenWindow');
        return 3;
      },
      async closeWindow() {
        registrar('closeWindow');
        return 3;
      },
      async lockWindow() {
        registrar('lockWindow');
        return 4;
      },
      async changeCapacity(input) {
        registrar(`changeCapacity:${input.capacity}`);
        return 3;
      },
      async addEntry(input) {
        registrar(`addEntry:${input.playerId}`);
        return 3;
      },
      async removeEntry(input) {
        registrar(`removeEntry:${input.playerId}`);
        return 3;
      },
      async finalizeRoster() {
        registrar('finalizeRoster');
        return { rosterRevisionId: 'r-1', rosterRevisionNumber: 1 };
      },
      async readWindow() {
        registrar('readWindow');
        throw coded('P0002');
      },
    },
  };
  return { gateway, chamadas };
}

function sessao(overrides: Partial<Session> = {}): Session {
  return makeSession('session-1', {
    communityId: 'community-1',
    ...overrides,
  });
}

test('abrir a inscrição cria a Session no servidor, cria a janela e abre', async () => {
  const { gateway, chamadas } = fakeGateway();
  const mudancas: Session[] = [];
  const resultado = await openRegistration(
    {
      session: sessao(),
      communityCloudId: 'cloud-community',
      capacity: 14,
      commandId: 'c-1',
      windowId: 'w-1',
      onSessionChange: (next) => mudancas.push(next),
    },
    gateway,
  );

  assert.equal(resultado.ok, true);
  assert.deepEqual(chamadas, ['createTargetSession', 'createWindow:14', 'openWindow', 'readBoard']);
  assert.equal(mudancas.at(-1)?.authorizedFormation?.windowId, 'w-1');
  assert.equal(mudancas.at(-1)?.cloudId, 'cloud-session');
});

test('Session já criada no servidor é adotada, não recriada', async () => {
  const { gateway, chamadas } = fakeGateway({ sessionExists: true });
  const resultado = await openRegistration(
    {
      session: sessao(),
      communityCloudId: 'cloud-community',
      capacity: 12,
      commandId: 'c-2',
      windowId: 'w-2',
    },
    gateway,
  );
  assert.equal(resultado.ok, true);
  assert.deepEqual(chamadas.slice(0, 2), ['createTargetSession', 'readTargetSession']);
});

test('sem comunidade sincronizada não há o que abrir', async () => {
  const { gateway, chamadas } = fakeGateway();
  const resultado = await openRegistration(
    {
      session: sessao(),
      communityCloudId: null,
      capacity: 12,
      commandId: 'c-3',
      windowId: 'w-3',
    },
    gateway,
  );
  assert.equal(resultado.ok, false);
  if (!resultado.ok) {
    assert.equal(
      resultado.error.message,
      'Esta comunidade ainda não está na nuvem. Sincronize antes de abrir a inscrição.',
    );
  }
  assert.deepEqual(chamadas, []);
});

test('entrar e sair usam o comando que veio de fora, então repetir não duplica', async () => {
  const { gateway, chamadas } = fakeGateway();
  await joinRegistration({ windowId: 'w-1', commandId: 'c-9', entryId: 'e-9' }, gateway);
  await joinRegistration({ windowId: 'w-1', commandId: 'c-9', entryId: 'e-9' }, gateway);
  await leaveRegistration({ windowId: 'w-1', commandId: 'c-10' }, gateway);
  assert.deepEqual(
    chamadas.filter((chamada) => chamada.startsWith('join') || chamada.startsWith('leave')),
    ['join:c-9', 'join:c-9', 'leave:c-10'],
  );
});

test('o organizador inclui, tira, muda a capacidade, fecha e reabre', async () => {
  const { gateway, chamadas } = fakeGateway();
  await addAthleteToRegistration(
    { windowId: 'w-1', playerCloudId: 'cloud-p1', commandId: 'c-11', entryId: 'e-11' },
    gateway,
  );
  await removeAthleteFromRegistration(
    { windowId: 'w-1', playerCloudId: 'cloud-p1', commandId: 'c-12' },
    gateway,
  );
  await changeRegistrationCapacity({ windowId: 'w-1', capacity: 16, commandId: 'c-13' }, gateway);
  await setRegistrationOpen(
    { windowId: 'w-1', open: false, expectedRevision: 3, commandId: 'c-14' },
    gateway,
  );
  await setRegistrationOpen(
    { windowId: 'w-1', open: true, expectedRevision: 4, commandId: 'c-15' },
    gateway,
  );

  assert.deepEqual(
    chamadas.filter((chamada) => chamada !== 'readBoard'),
    [
      'addEntry:cloud-p1',
      'removeEntry:cloud-p1',
      'changeCapacity:16',
      'closeWindow',
      'reopenWindow',
    ],
  );
});

test('as recusas do servidor viram frases do produto', async () => {
  const semPermissao = fakeGateway({ falhas: [coded('42501')] });
  const recusa = await joinRegistration(
    { windowId: 'w-1', commandId: 'c-16', entryId: 'e-16' },
    semPermissao.gateway,
  );
  assert.equal(recusa.ok, false);
  if (!recusa.ok) {
    assert.equal(
      recusa.error.message,
      'Você precisa ser membro ativo desta comunidade para se inscrever.',
    );
  }

  const fechada = fakeGateway({ falhas: [coded('23514')] });
  const bloqueada = await joinRegistration(
    { windowId: 'w-1', commandId: 'c-17', entryId: 'e-17' },
    fechada.gateway,
  );
  assert.equal(bloqueada.ok, false);
  if (!bloqueada.ok) {
    assert.equal(bloqueada.error.message, 'A inscrição está fechada. Fale com quem organiza.');
  }

  const desatualizada = fakeGateway({ falhas: [coded('40001')] });
  const conflito = await changeRegistrationCapacity(
    { windowId: 'w-1', capacity: 10, commandId: 'c-18' },
    desatualizada.gateway,
  );
  assert.equal(conflito.ok, false);
  if (!conflito.ok) {
    assert.equal(
      conflito.error.message,
      'A lista mudou enquanto você olhava. Atualize e tente de novo.',
    );
  }
});
