# Auth Production Checklist

- [ ] Backup do projeto Supabase confirmado antes da migration.
- [ ] Redirect URLs incluem producao e `/auth/callback`.
- [ ] Google provider usa client ID/secret do ambiente correto.
- [ ] Confirmacao de email esta ativa.
- [ ] SMTP proprio esta configurado e testado.
- [ ] CAPTCHA esta ativo em cadastro, login e recovery.
- [ ] Rate limits foram revisados no dashboard.
- [ ] TOTP esta habilitado; SMS continua desabilitado.
- [x] Service role nao existe em variavel `VITE_*`. **Verificado em 2026-07-29**, no
      historico inteiro e nao so no estado atual — o repositorio e publico, entao um
      commit antigo continuaria exposto mesmo apos remocao.
      - Unicas `VITE_*`: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
      - `.env` nunca foi versionado; so `.env.example`, com placeholders.
      - `git log --all -S"eyJhbGciOiJIUzI1NiIs"` (JWT) e `-S"sb_secret_"` (formato novo)
        nao retornam nenhum commit.
      - As ocorrencias de `service_role` em `29a1733`/`2e06d2a` sao a documentacao das
        skills do Supabase discutindo o conceito, nao chave.
      - `GEMINI_API_KEY` nao tem prefixo `VITE_`, entao nao entra no bundle. Renomear
        para `VITE_*` vazaria a chave.
      - Para repetir: `git log --all -S"<padrao>" --oneline`. Buscar no working tree
        nao basta.
- [ ] `ensure_account_ready` nao executa para `anon`.
- [ ] Usuario autenticado le apenas perfil/jogador permitidos por RLS.
- [ ] Logs nao incluem access token, refresh token, secret TOTP ou senha.
- [ ] Smoke test de cadastro, recovery, Google, onboarding e logout passou.
- [ ] Nenhuma tabela de produto foi resetada nesta entrega.
- [ ] Senha minima configurada em 8 caracteres (Authentication -> Policies).
- [ ] community_players.role permanece marcado como legado (nao usar em novas features).

## Recuperacao de acesso master (break-glass)

Com MFA obrigatorio, `set_user_role` exige AAL2 **e** `is_superadmin()`. Duas
consequencias que mudam o plano de recuperacao:

- **`programmer` nao recupera nada.** Só `master` tem `manage_global_roles`; um
  programmer nao consegue alterar papel algum. Uma "segunda conta staff" como
  programmer da falsa seguranca.
- **Service role tambem nao serve.** Um JWT de service role nao carrega a claim
  `aal`, entao `require_aal2()` rejeita — script de backend nao consegue chamar
  `set_user_role`, `set_community_member_role`, `remove_community_member` nem
  `transfer_community_ownership`, com uma mensagem que fala de dois fatores e nao
  tem nada a ver com a situacao real.

Estado atual: **dois masters** (`mlottargato@gmail.com` e `testedev@gmail.com`).

- [ ] O segundo master tem TOTP enrolado, em um dispositivo **diferente** do
      primeiro. Sem isso nao ha redundancia: os dois masters caem junto com o
      mesmo aparelho.

### Procedimento (SQL editor do painel, apenas em emergencia)

Se todos os masters perderem o autenticador, o unico caminho e o SQL editor, que
roda como superusuario e ignora a RLS. O trigger `guard_profile_role` so permite
mudanca de papel com a flag abaixo, na mesma transacao:

```sql
begin;
select set_config('app.allow_role_change', 'on', true);
update public.profiles set role = 'master', updated_at = now()
 where email = 'quem-vai-recuperar@exemplo.com';
commit;
```

Para destravar a conta, apagar o fator TOTP perdido (o app gera um novo no
proximo acesso a `/configurar-mfa`):

```sql
delete from auth.mfa_factors where user_id = '<uuid>' and status <> 'verified';
```

Apagar um fator **verificado** remove a segunda etapa da conta — faca apenas se
o dispositivo foi realmente perdido, e reenrole em seguida.
