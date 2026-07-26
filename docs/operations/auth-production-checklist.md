# Auth Production Checklist

- [ ] Backup do projeto Supabase confirmado antes da migration.
- [ ] Redirect URLs incluem producao e `/auth/callback`.
- [ ] Google provider usa client ID/secret do ambiente correto.
- [ ] Confirmacao de email esta ativa.
- [ ] SMTP proprio esta configurado e testado.
- [ ] CAPTCHA esta ativo em cadastro, login e recovery.
- [ ] Rate limits foram revisados no dashboard.
- [ ] TOTP esta habilitado; SMS continua desabilitado.
- [ ] Service role nao existe em variavel `VITE_*`.
- [ ] `ensure_account_ready` nao executa para `anon`.
- [ ] Usuario autenticado le apenas perfil/jogador permitidos por RLS.
- [ ] Logs nao incluem access token, refresh token, secret TOTP ou senha.
- [ ] Smoke test de cadastro, recovery, Google, onboarding e logout passou.
- [ ] Nenhuma tabela de produto foi resetada nesta entrega.
- [ ] Senha minima configurada em 8 caracteres (Authentication -> Policies).
