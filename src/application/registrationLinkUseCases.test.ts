import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRegistrationShareMessage,
  resolveRegistrationTarget,
} from './registrationLinkUseCases';
import { makeSession } from '../test/fixtures';

/**
 * Abrir a inscricao pelo link, e gerar o link.
 *
 * Quem recebe o link nao tem a sessao no armazenamento local -- e, para sessao
 * target, nunca vai ter: `scopeOperationalFetch` filtra `sessions` por
 * `authority_model = 'legacy'` no download em lote. Entao a tela precisa saber
 * se virar com o id que veio na URL.
 */

test('com a sessao local target, o alvo sai dela', () => {
  const alvo = resolveRegistrationTarget({
    routeSessionId: 's-1',
    session: makeSession('s-1', {
      name: 'Pelada de quinta',
      date: '2026-10-01',
      cloudId: 's-1',
      authorityModel: 'target',
    }),
  });

  assert.deepEqual(alvo, {
    sessionCloudId: 's-1',
    name: 'Pelada de quinta',
    date: '2026-10-01',
    fromLink: false,
  });
});

test('sem sessao local, o id da URL vale como id de nuvem', () => {
  const alvo = resolveRegistrationTarget({ routeSessionId: 's-9', session: null });

  assert.equal(alvo?.sessionCloudId, 's-9');
  assert.equal(alvo?.fromLink, true);
  assert.equal(alvo?.name, null, 'o nome so chega depois da leitura na nuvem');
});

test('sessao local ainda legada: o id da URL continua valendo, porque a promocao nao desce', () => {
  const alvo = resolveRegistrationTarget({
    routeSessionId: 's-2',
    session: makeSession('s-2', { name: 'Quinta', date: '2026-10-02' }),
  });

  assert.equal(alvo?.sessionCloudId, 's-2');
  assert.equal(alvo?.name, 'Quinta', 'o nome local serve enquanto a nuvem nao responde');
  assert.equal(
    alvo?.fromLink,
    false,
    'ha copia local, entao o cabecalho nao precisa esperar a nuvem',
  );
});

test('sem id na rota nao ha alvo', () => {
  assert.equal(resolveRegistrationTarget({ routeSessionId: undefined, session: null }), null);
});

test('a mensagem de convite carrega nome, dia, vagas e o link', () => {
  const texto = buildRegistrationShareMessage({
    sessionName: 'Pelada de quinta',
    sessionDate: '2026-10-01',
    capacity: 12,
    confirmedCount: 5,
    url: 'https://panelinhahub.vercel.app/comunidades/c1/sessoes/s1/inscricao',
  });

  assert.match(texto, /Pelada de quinta/);
  assert.match(texto, /quinta-feira/i);
  assert.match(texto, /7 vagas/);
  assert.match(
    texto,
    /https:\/\/panelinhahub\.vercel\.app\/comunidades\/c1\/sessoes\/s1\/inscricao/,
  );
});

test('lista cheia convida para a reserva em vez de prometer vaga', () => {
  const texto = buildRegistrationShareMessage({
    sessionName: 'Pelada de quinta',
    sessionDate: '2026-10-01',
    capacity: 12,
    confirmedCount: 12,
    url: 'https://exemplo.test/x',
  });

  assert.match(texto, /reserva/i);
  assert.doesNotMatch(texto, /\d+ vagas/);
});

test('o link e absoluto, para sobreviver ao WhatsApp', () => {
  const texto = buildRegistrationShareMessage({
    sessionName: 'P',
    sessionDate: '2026-10-01',
    capacity: 1,
    confirmedCount: 0,
    url: 'https://exemplo.test/comunidades/c/sessoes/s/inscricao',
  });

  assert.ok(texto.includes('https://'), 'um caminho relativo nao vira link no aplicativo');
});
