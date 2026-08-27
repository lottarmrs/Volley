-- Fix RLS policy on modification_logs for audit triggers
--
-- The `log_table_changes()` trigger function inserts rows into `public.modification_logs`
-- during table mutations. If RLS is enabled without an INSERT policy for authenticated users,
-- table updates/upserts raise 42501 ("new row violates row-level security policy for table modification_logs").

drop policy if exists "Authenticated users can insert modification logs" on public.modification_logs;
create policy "Authenticated users can insert modification logs" on public.modification_logs
  for insert to authenticated
  with check (true);
