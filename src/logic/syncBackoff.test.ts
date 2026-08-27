import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySyncError, computeNextAttemptAt, RETRY_INTERVALS_MS } from './syncBackoff';

test('classifica falha de fetch como offline_unavailable', () => {
  // Chrome/Firefox usam "Failed to fetch"; Safari usa "Load failed".
  assert.equal(classifySyncError(new TypeError('Failed to fetch')), 'offline_unavailable');
  assert.equal(
    classifySyncError(new TypeError('NetworkError when attempting to fetch')),
    'offline_unavailable',
  );
  assert.equal(classifySyncError(new TypeError('Load failed')), 'offline_unavailable');
});

test('classifica PostgrestError sem usar instanceof', () => {
  // PostgrestError e objeto simples, NAO instancia de Error. Testar por instanceof
  // descartaria todo erro vindo do Supabase — ja aconteceu neste projeto.
  const permissao = { code: '42501', message: 'permission denied' };
  assert.equal(classifySyncError(permissao), 'authorization');

  const dadoInvalido = { code: '22023', message: 'Ja e membro' };
  assert.equal(classifySyncError(dadoInvalido), 'validation');

  const conflito = { code: '23505', message: 'duplicate key' };
  assert.equal(classifySyncError(conflito), 'conflict');
});

test('o que nao reconhece vira technical, nao offline', () => {
  // Chutar "offline" para erro desconhecido faria o app insistir para sempre num
  // erro que nunca vai passar.
  assert.equal(classifySyncError(new Error('boom')), 'technical');
  assert.equal(
    classifySyncError({ code: '42P01', message: 'relation does not exist' }),
    'technical',
  );
});

test('erro de rede sempre tem proxima tentativa, mesmo depois de muitas falhas', () => {
  const base = '2026-07-31T12:00:00.000Z';
  const depoisDe50 = computeNextAttemptAt({
    count: 50,
    lastSeenAt: base,
    kind: 'offline_unavailable',
  });
  assert.ok(depoisDe50, 'erro de rede nunca pode congelar');
  // Depois do teto, o intervalo para de crescer e fica no ultimo.
  const teto = RETRY_INTERVALS_MS[RETRY_INTERVALS_MS.length - 1];
  assert.equal(new Date(depoisDe50!).getTime() - new Date(base).getTime(), teto);
});

test('o intervalo cresce a cada falha ate o teto', () => {
  const base = '2026-07-31T12:00:00.000Z';
  const delta = (count: number) =>
    new Date(computeNextAttemptAt({ count, lastSeenAt: base, kind: 'technical' })!).getTime() -
    new Date(base).getTime();
  assert.equal(delta(1), RETRY_INTERVALS_MS[0]);
  assert.equal(delta(2), RETRY_INTERVALS_MS[1]);
  assert.equal(delta(3), RETRY_INTERVALS_MS[2]);
});

test('erro estrutural nao tem proxima tentativa', () => {
  const base = '2026-07-31T12:00:00.000Z';
  // Nenhum destes se conserta com o tempo. Insistir so gera ruido.
  for (const kind of ['validation', 'authorization', 'conflict'] as const) {
    assert.equal(computeNextAttemptAt({ count: 1, lastSeenAt: base, kind }), undefined);
  }
});
