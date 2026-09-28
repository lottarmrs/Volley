import test from 'node:test';
import assert from 'node:assert/strict';
import { updateMyAthleteProfile } from './athleteProfileUseCases';

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
