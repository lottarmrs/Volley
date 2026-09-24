import assert from 'node:assert/strict';
import test from 'node:test';
import { makeFreePlayConfig, makeSession } from '../test/fixtures';
import {
  buildScheduledSessionResult,
  suggestedRegistrationCapacity,
} from './scheduleSessionUseCases';

/**
 * Marcar a pelada antes do dia.
 *
 * Ate 2026-09-24 a sessao so entrava em `sessions` no `confirmDivision`, ja com
 * times sorteados. Quem marcava a pelada da quinta na segunda nao tinha onde
 * guardar isso, e a inscricao -- que existe para acontecer ANTES do sorteio --
 * so ficava alcancavel depois dele.
 */

const HOJE = '2026-09-24';

test('marcar guarda a pelada na lista, com a data escolhida', () => {
  const rascunho = makeSession('s-1', { communityId: 'c-1', date: HOJE, status: 'draft' });

  const resultado = buildScheduledSessionResult({
    activeSession: rascunho,
    sessions: [],
    date: '2026-10-01',
    today: HOJE,
    now: '2026-09-24T10:00:00.000Z',
  });

  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  assert.equal(resultado.value.session.date, '2026-10-01');
  assert.equal(resultado.value.session.status, 'draft');
  assert.deepEqual(
    resultado.value.sessions.map((sessao) => sessao.id),
    ['s-1'],
  );
});

test('marcar de novo atualiza a mesma pelada, nao cria outra', () => {
  const rascunho = makeSession('s-1', { communityId: 'c-1', date: HOJE, status: 'draft' });
  const jaNaLista = makeSession('s-1', { communityId: 'c-1', date: '2026-09-30', status: 'draft' });

  const resultado = buildScheduledSessionResult({
    activeSession: rascunho,
    sessions: [jaNaLista, makeSession('s-2', { communityId: 'c-1', date: HOJE })],
    date: '2026-10-02',
    today: HOJE,
    now: '2026-09-24T10:00:00.000Z',
  });

  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  assert.deepEqual(
    resultado.value.sessions.map((sessao) => sessao.id),
    ['s-1', 's-2'],
    'a ordem se mantem: a pelada ja marcada e substituida no lugar',
  );
  assert.equal(resultado.value.sessions[0].date, '2026-10-02');
});

test('hoje vale: a pelada de hoje tambem pode ter lista', () => {
  const resultado = buildScheduledSessionResult({
    activeSession: makeSession('s-1', { communityId: 'c-1', date: HOJE, status: 'draft' }),
    sessions: [],
    date: HOJE,
    today: HOJE,
    now: '2026-09-24T10:00:00.000Z',
  });

  assert.equal(resultado.ok, true);
});

test('data no passado e recusada, porque a agenda nunca mostraria', () => {
  const resultado = buildScheduledSessionResult({
    activeSession: makeSession('s-1', { communityId: 'c-1', date: HOJE, status: 'draft' }),
    sessions: [],
    date: '2026-09-23',
    today: HOJE,
    now: '2026-09-24T10:00:00.000Z',
  });

  assert.equal(resultado.ok, false);
  assert.match(
    resultado.ok === false ? resultado.error.message : '',
    /passou|passado|antes/i,
    'a frase precisa dizer o que esta errado com a data',
  );
});

test('pelada sem comunidade nao pode ser marcada: a lista e do grupo', () => {
  const resultado = buildScheduledSessionResult({
    activeSession: makeSession('s-1', { communityId: null, date: HOJE, status: 'draft' }),
    sessions: [],
    date: '2026-10-01',
    today: HOJE,
    now: '2026-09-24T10:00:00.000Z',
  });

  assert.equal(resultado.ok, false);
});

test('pelada ja sorteada nao volta a ser marcada', () => {
  const resultado = buildScheduledSessionResult({
    activeSession: makeSession('s-1', {
      communityId: 'c-1',
      date: HOJE,
      status: 'teams_generated',
    }),
    sessions: [],
    date: '2026-10-01',
    today: HOJE,
    now: '2026-09-24T10:00:00.000Z',
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.ok === false ? resultado.error.message : '', /sorteada|times/i);
});

test('sem rascunho nao ha o que marcar', () => {
  const resultado = buildScheduledSessionResult({
    activeSession: null,
    sessions: [],
    date: '2026-10-01',
    today: HOJE,
    now: '2026-09-24T10:00:00.000Z',
  });

  assert.equal(resultado.ok, false);
});

test('data invalida e recusada antes de virar NaN na agenda', () => {
  for (const ruim of ['', '31/10/2026', 'amanha']) {
    const resultado = buildScheduledSessionResult({
      activeSession: makeSession('s-1', { communityId: 'c-1', date: HOJE, status: 'draft' }),
      sessions: [],
      date: ruim,
      today: HOJE,
      now: '2026-09-24T10:00:00.000Z',
    });
    assert.equal(resultado.ok, false, `${ruim} deveria ser recusada`);
  }
});

test('a pelada marcada guarda as vagas que quem organiza escolheu', () => {
  const resultado = buildScheduledSessionResult({
    activeSession: makeSession('s-1', {
      communityId: 'c-1',
      date: HOJE,
      status: 'draft',
      registrationCapacity: 14,
    }),
    sessions: [],
    date: '2026-10-01',
    today: HOJE,
    now: '2026-09-24T10:00:00.000Z',
  });

  assert.equal(resultado.ok === true ? resultado.value.session.registrationCapacity : null, 14);
});

test('sem escolha, as vagas saem da sugestao: times x 6', () => {
  const resultado = buildScheduledSessionResult({
    activeSession: makeSession('s-1', {
      communityId: 'c-1',
      date: HOJE,
      status: 'draft',
      config: { ...makeFreePlayConfig(), teamCount: 3 },
    }),
    sessions: [],
    date: '2026-10-01',
    today: HOJE,
    now: '2026-09-24T10:00:00.000Z',
  });

  assert.equal(resultado.ok === true ? resultado.value.session.registrationCapacity : null, 18);
});

test('vagas invalidas sao recusadas antes de virar lista sem sentido', () => {
  for (const vagas of [0, -3, 1.5]) {
    const resultado = buildScheduledSessionResult({
      activeSession: makeSession('s-1', {
        communityId: 'c-1',
        date: HOJE,
        status: 'draft',
        registrationCapacity: vagas,
      }),
      sessions: [],
      date: '2026-10-01',
      today: HOJE,
      now: '2026-09-24T10:00:00.000Z',
    });
    assert.equal(resultado.ok, false, `${vagas} vagas deveria ser recusado`);
    assert.match(
      resultado.ok === false ? resultado.error.message : '',
      /vaga/i,
      'a frase precisa dizer que o problema e a vaga',
    );
  }
});

test('a sugestao de vagas nao depende de a pelada ter sido marcada', () => {
  assert.equal(suggestedRegistrationCapacity({ config: { teamCount: 2 } }), 12);
  assert.equal(suggestedRegistrationCapacity({ config: { teamCount: 4 } }), 24);
  assert.equal(
    suggestedRegistrationCapacity({}),
    12,
    'sem formato escolhido, doze: a pelada padrao de tres times',
  );
});
