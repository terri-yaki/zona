-- Durable failure tracking for transferred-guest Auth cleanup: instead of
-- only console.logging deleteUser failures (rows silently re-listed forever),
-- record attempts and the last error on the transfer job.

alter table private.account_transfer_jobs
  add column if not exists auth_cleanup_attempts integer not null default 0,
  add column if not exists auth_cleanup_last_error text;

create or replace function public.mark_transfer_auth_cleanup_failed_internal(
  p_transfer_id uuid,
  p_error text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.account_transfer_jobs set
    auth_cleanup_attempts = auth_cleanup_attempts + 1,
    auth_cleanup_last_error = pg_catalog.left(coalesce(p_error, ''), 500),
    updated_at = pg_catalog.now()
  where id = p_transfer_id and status = 'completed';
end;
$$;

revoke all on function public.mark_transfer_auth_cleanup_failed_internal(uuid, text)
from public, anon, authenticated;
grant execute on function public.mark_transfer_auth_cleanup_failed_internal(uuid, text) to service_role;
