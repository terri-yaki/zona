-- Split the mislabeled reauth error: a stale proof identity (last_sign_in_at
-- outside the 10-minute freshness window) now raises FRESH_PROOF_REQUIRED,
-- while REMAINING_IDENTITY_PROOF_REQUIRED is reserved for unlinking the very
-- identity that was used as proof. Re-creates issue_account_reauth_grant_internal
-- from 20260729173751; all other logic unchanged.

create or replace function public.issue_account_reauth_grant_internal(
  p_user_id uuid,
  p_actor_session_id uuid,
  p_proof_session_id uuid,
  p_proof_identity_id uuid,
  p_installation_id uuid,
  p_action text,
  p_target text default ''
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_token text;
  v_grant private.account_reauth_grants%rowtype;
begin
  if p_user_id is null or p_actor_session_id is null or p_proof_session_id is null
    or p_proof_identity_id is null
    or p_actor_session_id = p_proof_session_id
    or p_action not in ('account.delete', 'identity.link', 'identity.unlink', 'installation.revoke',
      'sessions.revoke.others', 'sessions.revoke.all')
    or p_target is null or char_length(p_target) > 200 then
    raise exception 'INVALID_REAUTH_REQUEST';
  end if;

  v_account_id := public.assert_account_session_active_internal(p_user_id, p_actor_session_id);
  if exists (select 1 from auth.users as auth_user
    where auth_user.id = p_user_id and coalesce(auth_user.is_anonymous, false)) then
    raise exception 'REAUTH_NOT_AVAILABLE';
  end if;
  if not exists (select 1 from auth.sessions as auth_session
    where auth_session.id = p_actor_session_id and auth_session.user_id = p_user_id) then
    raise exception 'INVALID_SESSION';
  end if;
  if not exists (select 1 from auth.sessions as auth_session
    where auth_session.id = p_proof_session_id and auth_session.user_id = p_user_id
      and auth_session.created_at >= pg_catalog.now() - interval '10 minutes') then
    raise exception 'FRESH_PROOF_REQUIRED';
  end if;
  -- Stale proof identity is a freshness failure, not a remaining-identity one.
  if not exists (select 1 from auth.identities as identity
    where identity.id = p_proof_identity_id and identity.user_id = p_user_id
      and identity.last_sign_in_at >= pg_catalog.now() - interval '10 minutes') then
    raise exception 'FRESH_PROOF_REQUIRED';
  end if;
  -- Only unlinking the proof identity itself is a remaining-identity failure.
  if p_action = 'identity.unlink' and p_target = p_proof_identity_id::text then
    raise exception 'REMAINING_IDENTITY_PROOF_REQUIRED';
  end if;
  if p_installation_id is not null and not exists (
    select 1 from private.installation_sessions as binding
    where binding.user_id = p_user_id
      and binding.session_id = p_actor_session_id
      and binding.installation_id = p_installation_id
      and binding.status = 'active' and binding.revoked_at is null
  ) then raise exception 'INVALID_INSTALLATION'; end if;

  v_token := 'zona_reauth_' || pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(extensions.gen_random_uuid()::text || extensions.gen_random_uuid()::text, 'UTF8'),
      'sha256'
    ), 'hex'
  );
  insert into private.account_reauth_grants (
    account_id, user_id, actor_session_id, proof_session_id,
    proof_identity_id, installation_id, action, target, token_hash, expires_at
  ) values (
    v_account_id, p_user_id, p_actor_session_id, p_proof_session_id,
    p_proof_identity_id, p_installation_id, p_action, p_target,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    pg_catalog.now() + interval '10 minutes'
  )
  on conflict (proof_session_id, action, target) do update set
    actor_session_id = excluded.actor_session_id,
    proof_identity_id = excluded.proof_identity_id,
    installation_id = excluded.installation_id,
    token_hash = excluded.token_hash,
    expires_at = excluded.expires_at,
    used_at = null,
    created_at = pg_catalog.now()
  returning * into v_grant;

  perform private.record_account_event(v_account_id, p_user_id, p_installation_id,
    'reauth.grant', 'success',
    pg_catalog.jsonb_build_object('action', p_action));
  return pg_catalog.jsonb_build_object(
    'grant', v_token,
    'expiresAt', v_grant.expires_at,
    'action', v_grant.action,
    'target', v_grant.target
  );
end;
$$;
