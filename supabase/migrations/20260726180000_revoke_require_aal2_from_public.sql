-- require_aal2() shipped in 20260726110000 without the revoke/grant pair every other
-- function in that migration received, leaving /rest/v1/rpc/require_aal2 callable by
-- anon. Harmless in practice (not security definer; reads only the caller's own JWT)
-- but inconsistent with this schema's convention. See
-- docs/superpowers/plans/2026-07-26-roles-permissions-security-hardening.md.

revoke execute on function public.require_aal2() from public, anon;
grant execute on function public.require_aal2() to authenticated;
