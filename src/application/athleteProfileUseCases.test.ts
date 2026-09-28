import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAthleteDraftToOwnPlayer,
  applyAthleteDraftToPlayer,
  updateMyAthleteProfile,
} from './athleteProfileUseCases';

const draft = {
  genero: 'M' as const,
  posicaoPrincipal: 'ponteiro' as const,
  alturaCm: 182,
  maoDominante: 'direita' as const,
  apelido: 'Zé',
  posicoesSecundarias: [],
};

test('valida antes de chamar o servidor', async () => {
  let chamou = false;
  const gateway = {
    update: async () => {
      chamou = true;
      return 'ready' as const;
    },
  };
  const result = await updateMyAthleteProfile({ ...draft, alturaCm: null }, gateway);
  assert.equal(result.ok, false);
  assert.equal(chamou, false);
});

test('devolve o novo estado da conta', async () => {
  const gateway = { update: async () => 'ready' as const };
  assert.deepEqual(await updateMyAthleteProfile(draft, gateway), { ok: true, value: 'ready' });
});

test('a recusa do servidor aponta o campo', async () => {
  const gateway = {
    update: async () => {
      throw { code: '23514', message: 'Height must be between 120 and 230 cm' };
    },
  };
  const result = await updateMyAthleteProfile(draft, gateway);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error.message, /altura/i);
});

const ficha = {
  id: 'p1',
  nome: 'José Silva',
  apelido: 'José Silva',
  genero: null,
  posicaoPrincipal: null,
  posicoesSecundarias: [],
  alturaCm: undefined,
  maoDominante: null,
  userId: 'conta-1',
  status: { lesionado: false, limitacaoFisica: null, presencaFrequente: false },
  syncStatus: 'pending',
} as any;

test('applyAthleteDraftToPlayer grava a ficha como o servidor grava', () => {
  const result = applyAthleteDraftToPlayer(ficha, {
    ...draft,
    apelido: '  ',
    posicoesSecundarias: ['oposto'],
    lesionado: true,
    limitacaoFisica: 'joelho',
  });
  assert.equal(result.genero, 'M');
  assert.equal(result.posicaoPrincipal, 'ponteiro');
  assert.deepEqual(result.posicoesSecundarias, ['oposto']);
  assert.equal(result.alturaCm, 182);
  assert.equal(result.maoDominante, 'direita');
  assert.equal(result.apelido, '');
  assert.deepEqual(result.status, {
    lesionado: true,
    limitacaoFisica: 'joelho',
    presencaFrequente: false,
  });
  assert.equal(result.syncStatus, 'synced');
  assert.equal(applyAthleteDraftToPlayer(ficha, draft).apelido, 'Zé');
});

test('applyAthleteDraftToOwnPlayer muda so a ficha da conta', () => {
  const outra = { ...ficha, id: 'p2', userId: 'conta-2' };
  const convidado = { ...ficha, id: 'p3', userId: undefined };
  const [minha, dela, dele] = applyAthleteDraftToOwnPlayer(
    [ficha, outra, convidado],
    'conta-1',
    draft,
  );
  assert.equal(minha.genero, 'M');
  assert.equal(dela, outra);
  assert.equal(dele, convidado);
});
