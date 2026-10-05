import test from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage } from './authErrorMessage';

test('credencial errada vira frase em portugues', () => {
  assert.equal(
    authErrorMessage({ message: 'Invalid login credentials', code: 'invalid_credentials' }),
    'E-mail ou senha incorretos.',
  );
  assert.equal(
    authErrorMessage({ message: 'Invalid login credentials' }),
    'E-mail ou senha incorretos.',
  );
});

test('erros conhecidos do Supabase dizem o que fazer', () => {
  assert.match(authErrorMessage({ message: 'Email not confirmed' }), /confirme seu e-mail/i);
  assert.match(authErrorMessage({ message: 'User already registered' }), /já tem conta/i);
  assert.match(
    authErrorMessage({ message: 'email rate limit exceeded', code: 'over_email_send_rate_limit' }),
    /espere/i,
  );
  assert.match(authErrorMessage({ message: 'captcha protection: request disallowed' }), /robô/i);
  assert.match(authErrorMessage(new TypeError('Failed to fetch')), /sem conexão/i);
});

test('mensagem nossa passa como esta e o resto vira generica', () => {
  assert.equal(authErrorMessage(new Error('Senha fraca demais.')), 'Senha fraca demais.');
  assert.equal(authErrorMessage(null), 'Não deu para entrar agora. Tente de novo.');
  assert.equal(
    authErrorMessage({ message: 'Database error saving new user' }),
    'Não deu para entrar agora. Tente de novo.',
  );
});

test('erros da verificacao em duas etapas chegam em portugues', () => {
  assert.match(
    authErrorMessage({ message: 'Invalid TOTP code entered', code: 'mfa_verification_failed' }),
    /código incorreto ou vencido/i,
  );
  assert.match(
    authErrorMessage({
      message: 'MFA enroll is disabled for TOTP',
      code: 'mfa_totp_enroll_not_enabled',
    }),
    /duas etapas/i,
  );
});
