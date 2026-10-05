import test from 'node:test';
import assert from 'node:assert/strict';
import { unpaidRefusalMessage } from './registrationRefusals';

test('recusa por pagamento diz quantos faltam e o que fazer', () => {
  const erro = {
    code: '23514',
    hint: 'REGISTRATION_UNPAID',
    message: 'Registration has 9 confirmed entries without payment',
  };
  assert.equal(
    unpaidRefusalMessage(erro),
    '9 confirmados ainda não pagaram. Marque quem pagou ou defina um prazo: quem não pagar até lá vai para a reserva.',
  );
  assert.match(
    unpaidRefusalMessage({ message: 'Registration has 1 confirmed entries without payment' }) ?? '',
    /^1 confirmado ainda não pagou\./,
  );
});

test('outras recusas nao sao confundidas com pagamento', () => {
  assert.equal(unpaidRefusalMessage({ code: '23514', message: 'Session must be DRAFT' }), null);
  assert.equal(unpaidRefusalMessage(null), null);
});
