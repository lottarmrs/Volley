import test from 'node:test';
import assert from 'node:assert/strict';
import { markPeladaDefaults, plannedStartIso, peladaName } from './markPeladaDefaults';

const quarta = new Date(2026, 8, 30, 10, 0);

test('sugere o proximo dia padrao da comunidade, o horario e o local', () => {
  const sugestao = markPeladaDefaults(
    {
      defaultDay: 'Sexta',
      defaultStartTime: '19:30',
      defaultLocation: 'Bolão',
      defaultFormat: 'free_play',
    },
    quarta,
  );
  assert.deepEqual(sugestao, {
    date: '2026-10-02',
    time: '19:30',
    location: 'Bolão',
    capacity: 12,
    type: 'free_play',
  });
});

test('no proprio dia padrao sugere hoje; sem dia padrao, hoje e 20:00', () => {
  assert.equal(markPeladaDefaults({ defaultDay: 'Quarta' }, quarta).date, '2026-09-30');
  const sem = markPeladaDefaults({}, quarta);
  assert.equal(sem.date, '2026-09-30');
  assert.equal(sem.time, '20:00');
  assert.equal(sem.type, 'free_play');
});

test('horario local vira instante e o nome leva o dia', () => {
  assert.equal(plannedStartIso('2026-10-02', '19:30'), new Date(2026, 9, 2, 19, 30).toISOString());
  assert.equal(plannedStartIso('2026-10-02', ''), '');
  assert.equal(peladaName('Inimigos do Vôlei', '2026-10-02'), 'Inimigos do Vôlei · sex 02/10');
});
