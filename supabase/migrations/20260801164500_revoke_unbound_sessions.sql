-- Close the unbound-session revocation gap: revoke_account_sessions_internal
-- denylisted sessions only via the installation_sessions trigger path, so
-- Auth sessions with no installation binding survived revocation. Now every
-- affected Auth session is denylisted directly. Re-creates the function from
-- 20260729173751; all other logic unchanged.

create or replace function public.revoke_account_sessions_internal(
  p_user_id uuid,
  p_actor_session_id uuid,
  p_scope text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_actor_installation_id uuid;
  v_revoked integer;
begin
  if p_user_id is null or p_actor_session_id is null
    or p_scope not in ('others', 'all') then raise exception 'INVALID_SCOPE'; end if;
  select owner.account_id into strict v_account_id
  from private.personal_account_owners as owner where owner.user_id = p_user_id;
  select binding.installation_id into v_actor_installation_id
  from private.installation_sessions as binding
  where binding.user_id = p_user_id and binding.session_id = p_actor_session_id
    and binding.status = 'active' and binding.revoked_at is null;

  update private.installation_sessions set
    status = 'revoked', revoked_at = coalesce(revoked_at, pg_catalog.now()),
    last_seen_at = pg_catalog.now()
  where user_id = p_user_id
    and (p_scope = 'all' or session_id <> p_actor_session_id);
  get diagnostics v_revoked = row_count;

  -- Denylist the Auth sessions directly: sessions without an installation
  -- binding are not covered by the installation_sessions trigger path.
  insert into private.revoked_auth_sessions (session_id, user_id, account_id, installation_id, reason)
  select auth_session.id, p_user_id, v_account_id,
    binding.installation_id, 'installation_revoked'
  from auth.sessions as auth_session
  left join private.installation_sessions as binding
    on binding.session_id = auth_session.id and binding.user_id = auth_session.user_id
  where auth_session.user_id = p_user_id
    and (p_scope = 'all' or auth_session.id <> p_actor_session_id)
  on conflict (session_id) do nothing;

  update private.account_installation_subscriptions set
    delivery_enabled = false,
    revoked_at = coalesce(revoked_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
  where account_id = v_account_id and user_id = p_user_id
    and (p_scope = 'all' or installation_id is distinct from v_actor_installation_id);
  update public.push_devices set
    disabled_at = coalesce(disabled_at, pg_catalog.now()), updated_at = pg_catalog.now()
  where user_id = p_user_id
    and (p_scope = 'all' or device_id <> coalesce(v_actor_installation_id::text, ''));
  perform private.record_account_event(v_account_id, p_user_id, v_actor_installation_id,
    'sessions.revoke.' || p_scope, 'success',
    pg_catalog.jsonb_build_object('revokedBindings', v_revoked));
  return pg_catalog.jsonb_build_object('scope', p_scope, 'revokedBindings', v_revoked);
end;
$$;

revoke all on function public.revoke_account_sessions_internal(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.revoke_account_sessions_internal(uuid, uuid, text)
to service_role;
