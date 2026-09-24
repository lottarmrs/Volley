import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RETURN_TO_PARAM,
  readReturnTo,
  rememberReturnTo,
  resolveReturnTo,
  withReturnTo,
} from './authReturnTo';

/**
 * Levar a pessoa de volta ao que ela clicou.
 *
 * O `state` do react-router morre no recarregamento, e o cadastro por e-mail
 * sempre recarrega: a pessoa sai do app, abre o link de confirmacao e volta
 * numa aba nova. Entao o destino precisa sobreviver fora da memoria.
 */

function memoriaFalsa() {
  const dados = new Map<string, string>();
  return {
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => void dados.set(chave, valor),
    removeItem: (chave: string) => void dados.delete(chave),
  };
}

test('o link para o cadastro carrega para onde voltar', () => {
  assert.equal(
    withReturnTo('/cadastro', '/comunidades/c1/sessoes/s1/inscricao'),
    `/cadastro?${RETURN_TO_PARAM}=%2Fcomunidades%2Fc1%2Fsessoes%2Fs1%2Finscricao`,
  );
});

test('sem destino, o link fica limpo', () => {
  assert.equal(withReturnTo('/entrar', null), '/entrar');
  assert.equal(
    withReturnTo('/entrar', '/painel'),
    '/entrar',
    'o painel e o padrao, nao um destino',
  );
});

test('o destino vindo da URL vence o state, que nao sobrevive ao recarregamento', () => {
  const destino = resolveReturnTo({
    search: `?${RETURN_TO_PARAM}=%2Fagenda`,
    locationState: { from: { pathname: '/ligas' } },
    storage: memoriaFalsa(),
  });
  assert.equal(destino, '/agenda');
});

test('sem URL, o state ainda serve para quem nao recarregou', () => {
  const destino = resolveReturnTo({
    search: '',
    locationState: { from: { pathname: '/ligas' } },
    storage: memoriaFalsa(),
  });
  assert.equal(destino, '/ligas');
});

test('o destino guardado atravessa a confirmacao por e-mail', () => {
  const storage = memoriaFalsa();
  rememberReturnTo('/comunidades/c1/sessoes/s1/inscricao', storage);

  const destino = resolveReturnTo({ search: '', locationState: null, storage });

  assert.equal(destino, '/comunidades/c1/sessoes/s1/inscricao');
  assert.equal(readReturnTo(storage), null, 'ler consome: a proxima entrada vai para o painel');
});

test('sem nada, o destino e o painel', () => {
  assert.equal(
    resolveReturnTo({ search: '', locationState: null, storage: memoriaFalsa() }),
    '/painel',
  );
});

test('destino de fora do app e recusado: o retorno nao vira redirecionamento aberto', () => {
  for (const hostil of [
    'https://exemplo.test/phishing',
    '//exemplo.test/phishing',
    'javascript:alert(1)',
    'painel',
  ]) {
    assert.equal(
      resolveReturnTo({
        search: `?${RETURN_TO_PARAM}=${encodeURIComponent(hostil)}`,
        locationState: null,
        storage: memoriaFalsa(),
      }),
      '/painel',
      `${hostil} deveria ser recusado`,
    );
  }
});

test('armazenamento indisponivel nao derruba a entrada', () => {
  const quebrado = {
    getItem: () => {
      throw new Error('bloqueado');
    },
    setItem: () => {
      throw new Error('bloqueado');
    },
    removeItem: () => {
      throw new Error('bloqueado');
    },
  };

  assert.doesNotThrow(() => rememberReturnTo('/agenda', quebrado));
  assert.equal(resolveReturnTo({ search: '', locationState: null, storage: quebrado }), '/painel');
});
