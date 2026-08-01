-- v0.0.9 owner-visible delivery state over the private push queue.

create or replace function public.get_notification_delivery_summary(
  p_notification_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_notification_created_at timestamptz;
  v_targeted integer;
  v_provider_accepted integer;
  v_failed integer;
  v_pending integer;
  v_updated_at timestamptz;
  v_state text;
  v_reason text;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  perform private.assert_active_zona_session();

  if p_notification_id is null then
    raise exception 'NOT_FOUND';
  end if;

  select notification.created_at
  into v_notification_created_at
  from public.notifications as notification
  where notification.id = p_notification_id
    and notification.user_id = v_user_id
    and notification.expires_at > pg_catalog.now();

  if not found then
    -- Missing, expired, and another owner's notifications are indistinguishable.
    raise exception 'NOT_FOUND';
  end if;

  select
    count(*)::integer,
    count(*) filter (where job.status = 'delivered')::integer,
    count(*) filter (
      where job.status in ('permanent_failed', 'receipt_unknown')
    )::integer,
    count(*) filter (
      where job.status in (
        'queued', 'retry', 'sending', 'ticket_pending', 'receiving'
      )
    )::integer,
    max(job.updated_at),
    case
      when bool_or(job.last_error_code in ('DEVICE_UNAVAILABLE', 'DEVICE_NOT_REGISTERED'))
        then 'device_unavailable'
      when bool_or(job.last_error_code = 'MESSAGE_TOO_BIG')
        then 'message_too_big'
      when bool_or(job.last_error_code in ('MISMATCH_SENDER_ID', 'INVALID_CREDENTIALS'))
        then 'push_configuration'
      when bool_or(job.last_error_code in (
        'MESSAGE_RATE_EXCEEDED', 'EXPO_TIMEOUT', 'EXPO_UNAVAILABLE',
        'EXPO_INVALID_RESPONSE', 'UNKNOWN_EXPO_ERROR'
      )) then 'provider_unavailable'
      when bool_or(
        job.status = 'receipt_unknown'
        or job.last_error_code in ('RECEIPT_PENDING', 'RECEIPT_UNAVAILABLE')
      ) then 'unconfirmed'
      else null
    end
  into
    v_targeted,
    v_provider_accepted,
    v_failed,
    v_pending,
    v_updated_at,
    v_reason
  from private.push_delivery_jobs as job
  where job.notification_id = p_notification_id
    and job.user_id = v_user_id;

  v_state := case
    when v_targeted = 0 then 'not_sent'
    when v_provider_accepted > 0 then 'sent'
    when v_pending = 0 then 'needs_attention'
    else 'queued'
  end;

  -- A reason is actionable only when every target has reached a terminal
  -- non-success outcome. Mixed success remains honestly summarized by counts.
  if v_state <> 'needs_attention' then
    v_reason := null;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', v_state,
    'targetedPhones', v_targeted,
    'providerAccepted', v_provider_accepted,
    'failed', v_failed,
    'pending', v_pending,
    'updatedAt', coalesce(v_updated_at, v_notification_created_at),
    'reason', v_reason
  );
end;
$$;

revoke all on function public.get_notification_delivery_summary(uuid)
from public, anon, authenticated;
grant execute on function public.get_notification_delivery_summary(uuid)
to authenticated;
