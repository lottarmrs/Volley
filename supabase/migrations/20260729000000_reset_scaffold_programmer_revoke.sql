-- Removida a capability `reset_product_data` da role `programmer`.
-- Apenas `master` mantém a capability destrutiva. Decisão do operador registrada em
-- plano-3 sync-foundation ledger 2026-07-29.
--
-- Plano 5 pode reintroduzir via nova migration se a justificativa aparecer
-- (por exemplo, scripts de manutenção automatizados com approval externo).
delete from public.global_role_capabilities
where role = 'programmer' and capability = 'reset_product_data';
