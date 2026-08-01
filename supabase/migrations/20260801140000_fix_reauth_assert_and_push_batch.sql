-- Assert-only reauth grant check (no used_at write) so Edge handlers can
-- validate, perform side effects, then consume without burning grants on
-- FINAL_IDENTITY / Auth unlink / CURRENT_INSTALLATION failures.
-- Also batch push delivery outcome RPCs to avoid N+1 round-trips in the worker.

create or replace function public.assert_account_reauth_grant_internal(
  p_user_id uuid,
  p_actor_session_id uuid,
  p_action text,
  p_target text,
  p_grant text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_grant private.account_reauth_grants%rowtype;
begin
  if p_grant is null or char_length(p_grant) not between 32 and 200 then
    raise exception 'REAUTH_REQUIRED';
  end if;
  perform public.assert_account_session_active_internal(p_user_id, p_actor_session_id);
  select grant_row.* into v_grant
  from private.account_reauth_grants as grant_row
  where grant_row.token_hash = pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(p_grant, 'UTF8'), 'sha256'), 'hex')
    and grant_row.user_id = p_user_id
    and grant_row.actor_session_id = p_actor_session_id
    and grant_row.action = p_action
    and grant_row.target = coalesce(p_target, '')
  for share;
  if not found or v_grant.used_at is not null or v_grant.expires_at <= pg_catalog.now() then
    raise exception 'REAUTH_REQUIRED';
  end if;
  return v_grant.id;
end;
$$;

revoke all on function public.assert_account_reauth_grant_internal(uuid, uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.assert_account_reauth_grant_internal(uuid, uuid, text, text, text)
to service_role;

-- Single round-trip for up to 100 send-ticket / fail outcomes after Expo batch send.
create or replace function public.apply_push_send_outcomes_internal(
  p_worker_id uuid,
  p_outcomes jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_accepted integer := 0;
  v_failed integer := 0;
  v_result jsonb;
begin
  if p_worker_id is null or p_outcomes is null or pg_catalog.jsonb_typeof(p_outcomes) <> 'array'
    or pg_catalog.jsonb_array_length(p_outcomes) > 100 then
    raise exception 'INVALID_PUSH_OUTCOMES';
  end if;

  for v_entry in select value from pg_catalog.jsonb_array_elements(p_outcomes)
  loop
    if coalesce(v_entry ->> 'kind', '') = 'accept' then
      perform public.accept_push_delivery_ticket_internal(
        (v_entry ->> 'jobId')::uuid,
        p_worker_id,
        v_entry ->> 'ticketId',
        nullif(v_entry ->> 'httpStatus', '')::integer
      );
      v_accepted := v_accepted + 1;
    elsif coalesce(v_entry ->> 'kind', '') = 'fail' then
      v_result := public.fail_push_delivery_job_internal(
        (v_entry ->> 'jobId')::uuid,
        p_worker_id,
        v_entry ->> 'errorCode',
        coalesce((v_entry ->> 'permanent')::boolean, false),
        nullif(v_entry ->> 'httpStatus', '')::integer
      );
      if coalesce((v_result ->> 'updated')::boolean, false) then
        v_failed := v_failed + 1;
      end if;
    else
      raise exception 'INVALID_PUSH_OUTCOMES';
    end if;
  end loop;

  return pg_catalog.jsonb_build_object('accepted', v_accepted, 'failed', v_failed);
end;
$$;

-- Single round-trip for receipt complete / retry / defer outcomes.
create or replace function public.apply_push_receipt_outcomes_internal(
  p_worker_id uuid,
  p_outcomes jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_delivered integer := 0;
  v_deferred integer := 0;
  v_failed integer := 0;
begin
  if p_worker_id is null or p_outcomes is null or pg_catalog.jsonb_typeof(p_outcomes) <> 'array'
    or pg_catalog.jsonb_array_length(p_outcomes) > 100 then
    raise exception 'INVALID_PUSH_OUTCOMES';
  end if;

  for v_entry in select value from pg_catalog.jsonb_array_elements(p_outcomes)
  loop
    case coalesce(v_entry ->> 'kind', '')
      when 'complete' then
        perform public.complete_push_delivery_job_internal(
          (v_entry ->> 'jobId')::uuid,
          p_worker_id,
          v_entry ->> 'outcome',
          nullif(v_entry ->> 'errorCode', ''),
          nullif(v_entry ->> 'httpStatus', '')::integer
        );
        if (v_entry ->> 'outcome') = 'delivered' then
          v_delivered := v_delivered + 1;
        else
          v_failed := v_failed + 1;
        end if;
      when 'retry' then
        perform public.retry_push_delivery_from_receipt_internal(
          (v_entry ->> 'jobId')::uuid,
          p_worker_id,
          v_entry ->> 'errorCode',
          nullif(v_entry ->> 'httpStatus', '')::integer
        );
        v_deferred := v_deferred + 1;
      when 'defer' then
        perform public.defer_push_receipt_internal(
          (v_entry ->> 'jobId')::uuid,
          p_worker_id,
          v_entry ->> 'errorCode',
          nullif(v_entry ->> 'httpStatus', '')::integer
        );
        v_deferred := v_deferred + 1;
      else
        raise exception 'INVALID_PUSH_OUTCOMES';
    end case;
  end loop;

  return pg_catalog.jsonb_build_object(
    'delivered', v_delivered, 'deferred', v_deferred, 'failed', v_failed
  );
end;
$$;

revoke all on function public.apply_push_send_outcomes_internal(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.apply_push_send_outcomes_internal(uuid, jsonb) to service_role;
revoke all on function public.apply_push_receipt_outcomes_internal(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.apply_push_receipt_outcomes_internal(uuid, jsonb) to service_role;
