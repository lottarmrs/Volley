import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionOrganizerGateway } from './sessionOrganizerUseCases';
import { transferSessionOrganizer } from './sessionOrganizerUseCases';

const coded = (code: string) => Object.assign(new Error(code), { code });

function fakeGateway(
  options: {
    jaOrganiza?: boolean;
    falhas?: unknown[];
    revision?: number;
  } = {},
) {
  const chamadas: string[] = [];
  const falhas = options.falhas ?? [];
  const registrar = (nome: string) => {
    chamadas.push(nome);
    if (falhas.length > 0) throw falhas.shift();
  };

  const gateway: SessionOrganizerGateway = {
    async readTargetSession() {
      registrar('readTargetSession');
      return { revision: options.revision ?? 7 };
    },
    async setCommunityOrganizer(input) {
      registrar(`setCommunityOrganizer:${input.userId}`);
    },
    async assignSessionOrganizer(input) {
      registrar(`assign:${input.organizerUserId}:${input.expectedRevision}`);
    },
  };

  return { gateway, chamadas };
}

const entrada = {
  sessionCloudId: 'cloud-session',
  communityCloudId: 'cloud-community',
  organizerUserId: 'u-substituto',
  commandId: 'c-1',
  assignmentId: 'a-1',
};

test('concede a responsabilidade e amarra a pessoa a sessão, nessa ordem', async () => {
  const { gateway, chamadas } = fakeGateway();

  const resultado = await transferSessionOrganizer(entrada, gateway);

  assert.equal(resultado.ok, true);
  assert.deepEqual(chamadas, [
    'setCommunityOrganizer:u-substituto',
    'readTargetSession',
    'assign:u-substituto:7',
  ]);
});

test('quem delega também precisa da responsabilidade, e ela é concedida junto', async () => {
  const { gateway, chamadas } = fakeGateway();

  await transferSessionOrganizer({ ...entrada, granterUserId: 'u-dono' }, gateway);

  assert.deepEqual(
    chamadas,
    [
      'setCommunityOrganizer:u-dono',
      'setCommunityOrganizer:u-substituto',
      'readTargetSession',
      'assign:u-substituto:7',
    ],
    'session.manage vem da responsabilidade, entao quem delega precisa dela antes',
  );
});

test('assumir para si concede e atribui a própria pessoa uma vez só', async () => {
  const { gateway, chamadas } = fakeGateway();

  await transferSessionOrganizer(
    { ...entrada, organizerUserId: 'u-dono', granterUserId: 'u-dono' },
    gateway,
  );

  assert.deepEqual(chamadas, [
    'setCommunityOrganizer:u-dono',
    'readTargetSession',
    'assign:u-dono:7',
  ]);
});

test('sem comunidade na nuvem, recusa antes de tocar no servidor', async () => {
  const { gateway, chamadas } = fakeGateway();

  const resultado = await transferSessionOrganizer({ ...entrada, communityCloudId: null }, gateway);

  assert.equal(resultado.ok, false);
  assert.deepEqual(chamadas, []);
});

test('a recusa por dois fatores vira uma frase que diz o que fazer', async () => {
  const { gateway } = fakeGateway({
    falhas: [
      Object.assign(new Error('Esta operacao exige verificacao em duas etapas (AAL2).'), {
        code: '42501',
      }),
    ],
  });

  const resultado = await transferSessionOrganizer(entrada, gateway);

  assert.equal(
    resultado.ok === false ? resultado.error.message : '',
    'Esta ação pede verificação em duas etapas. Ative os dois fatores na sua conta e tente de novo.',
  );
});

test('quem não pode gerir membros recebe frase própria', async () => {
  const { gateway } = fakeGateway({ falhas: [coded('42501')] });

  const resultado = await transferSessionOrganizer(entrada, gateway);

  assert.equal(
    resultado.ok === false ? resultado.error.message : '',
    'Só quem administra a comunidade pode mudar quem organiza a pelada.',
  );
});
