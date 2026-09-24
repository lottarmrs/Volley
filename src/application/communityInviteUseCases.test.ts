import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInviteShareUrl, resolveCommunityInviteState } from './communityInviteUseCases';

/**
 * O convite que chega pelo WhatsApp.
 *
 * Quem clica nao e do grupo, entao a comunidade nao esta neste aparelho e o
 * `CommunityShell` mandava a pessoa para /comunidades antes de qualquer coisa.
 * Esta rota vive fora dele e decide o que mostrar a partir do que o servidor
 * responde sobre o codigo.
 */

const grupo = {
  id: 'c-1',
  name: 'Terça Forte',
  description: null,
  memberCount: 18,
  myStatus: null,
};

test('carregando vem antes de qualquer decisao', () => {
  const estado = resolveCommunityInviteState({ loading: true, preview: null, error: null });
  assert.equal(estado.kind, 'loading');
});

test('grupo encontrado e sem vinculo: da para pedir', () => {
  const estado = resolveCommunityInviteState({ loading: false, preview: grupo, error: null });

  assert.equal(estado.kind, 'canRequest');
  if (estado.kind !== 'canRequest') return;
  assert.equal(estado.community.name, 'Terça Forte');
});

test('pedido ja enviado nao oferece pedir de novo', () => {
  const pendente = resolveCommunityInviteState({
    loading: false,
    preview: { ...grupo, myStatus: 'pending' },
    error: null,
  });
  assert.equal(pendente.kind, 'pending');

  const recemPedido = resolveCommunityInviteState({
    loading: false,
    preview: grupo,
    error: null,
    justRequested: true,
  });
  assert.equal(recemPedido.kind, 'pending');
});

test('quem ja e do grupo nao ve convite: vai para a pelada que motivou o link', () => {
  const estado = resolveCommunityInviteState({
    loading: false,
    preview: { ...grupo, myStatus: 'active' },
    error: null,
    sessionId: 's-9',
  });

  assert.equal(estado.kind, 'alreadyMember');
  if (estado.kind !== 'alreadyMember') return;
  assert.equal(estado.to, '/comunidades/c-1/sessoes/s-9/inscricao');
});

test('sem pelada no link, quem ja e do grupo cai na comunidade', () => {
  const estado = resolveCommunityInviteState({
    loading: false,
    preview: { ...grupo, myStatus: 'active' },
    error: null,
  });

  assert.equal(estado.kind === 'alreadyMember' ? estado.to : '', '/comunidades/c-1');
});

test('quem foi recusado ou suspenso nao recebe botao de pedir de novo', () => {
  for (const status of ['rejected', 'suspended']) {
    const estado = resolveCommunityInviteState({
      loading: false,
      preview: { ...grupo, myStatus: status },
      error: null,
    });
    assert.equal(estado.kind, 'blocked', `${status} nao pode pedir de novo sozinho`);
  }
});

test('codigo invalido vira beco com saida, nao erro cru', () => {
  const estado = resolveCommunityInviteState({
    loading: false,
    preview: null,
    error: 'Código de convite inválido ou comunidade não encontrada.',
  });

  assert.equal(estado.kind, 'invalid');
  if (estado.kind !== 'invalid') return;
  assert.match(estado.message, /inválido/i);
});

test('sem preview e sem erro tambem e codigo invalido, nao tela em branco', () => {
  const estado = resolveCommunityInviteState({ loading: false, preview: null, error: null });
  assert.equal(estado.kind, 'invalid');
});

test('o link do convite carrega o codigo e a pelada', () => {
  assert.equal(
    buildInviteShareUrl({ origin: 'https://exemplo.test/', code: 'ab12cd', sessionId: 's-1' }),
    'https://exemplo.test/convite/AB12CD?pelada=s-1',
  );
  assert.equal(
    buildInviteShareUrl({ origin: 'https://exemplo.test', code: 'AB12CD' }),
    'https://exemplo.test/convite/AB12CD',
  );
});

test('sem codigo nao ha link de convite para oferecer', () => {
  assert.equal(buildInviteShareUrl({ origin: 'https://exemplo.test', code: null }), null);
  assert.equal(buildInviteShareUrl({ origin: 'https://exemplo.test', code: '  ' }), null);
});
