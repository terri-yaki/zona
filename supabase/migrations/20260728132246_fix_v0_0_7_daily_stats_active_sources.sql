-- The physical sources table has revocation state; key pause state lives in
-- api_keys. Count active sources through both relations.

create or replace function public.refresh_daily_usage_stats_internal(
  p_stat_date date default ((pg_catalog.now() at time zone 'UTC')::date - 1)
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := p_stat_date::timestamp at time zone 'UTC';
  v_end timestamptz := (p_stat_date + 1)::timestamp at time zone 'UTC';
  v_service_metrics jsonb;
begin
  if p_stat_date is null or p_stat_date > (pg_catalog.now() at time zone 'UTC')::date then
    raise exception 'INVALID_STAT_DATE';
  end if;

  delete from private.daily_usage_stats as stat
  where stat.stat_date = p_stat_date;

  select pg_catalog.jsonb_build_object(
    'notificationsAccepted', (select pg_catalog.count(*) from public.notifications n where n.created_at >= v_start and n.created_at < v_end),
    'notificationsLow', (select pg_catalog.count(*) from public.notifications n where n.created_at >= v_start and n.created_at < v_end and n.severity = 'low'),
    'notificationsMedium', (select pg_catalog.count(*) from public.notifications n where n.created_at >= v_start and n.created_at < v_end and n.severity = 'medium'),
    'notificationsHigh', (select pg_catalog.count(*) from public.notifications n where n.created_at >= v_start and n.created_at < v_end and n.severity = 'high'),
    'notificationsCritical', (select pg_catalog.count(*) from public.notifications n where n.created_at >= v_start and n.created_at < v_end and n.severity = 'critical'),
    'attachmentsAccepted', (select pg_catalog.count(*) from public.notifications n where n.created_at >= v_start and n.created_at < v_end and n.attachment_path is not null),
    'attachmentBytes', (select coalesce(pg_catalog.sum(n.attachment_bytes), 0) from public.notifications n where n.created_at >= v_start and n.created_at < v_end),
    'pushAttempted', (select pg_catalog.count(*) from private.push_delivery_logs p where p.created_at >= v_start and p.created_at < v_end),
    'pushAccepted', (select pg_catalog.count(*) from private.push_delivery_logs p where p.created_at >= v_start and p.created_at < v_end and p.error_message is null and p.http_status between 200 and 299),
    'pushFailed', (select pg_catalog.count(*) from private.push_delivery_logs p where p.created_at >= v_start and p.created_at < v_end and (p.error_message is not null or p.http_status is null or p.http_status not between 200 and 299)),
    'clientEvents', (select pg_catalog.count(*) from private.client_event_logs c where c.created_at >= v_start and c.created_at < v_end),
    'clientErrors', (select pg_catalog.count(*) from private.client_event_logs c where c.created_at >= v_start and c.created_at < v_end and c.level = 'error'),
    'serverEvents', (select pg_catalog.count(*) from private.server_event_logs s where s.created_at >= v_start and s.created_at < v_end),
    'serverErrors', (select pg_catalog.count(*) from private.server_event_logs s where s.created_at >= v_start and s.created_at < v_end and s.level = 'error'),
    'activeSources', (
      select pg_catalog.count(*)
      from public.sources s
      join public.api_keys key on key.source_id = s.id
      where s.revoked_at is null
        and key.revoked_at is null
        and key.is_active
        and (key.expires_at is null or key.expires_at > pg_catalog.now())
    ),
    'activePushDevices', (select pg_catalog.count(*) from public.push_devices d where d.disabled_at is null),
    'activeUsers', (select pg_catalog.count(distinct n.user_id) from public.notifications n where n.created_at >= v_start and n.created_at < v_end)
  ) into v_service_metrics;

  insert into private.daily_usage_stats (stat_date, scope, user_id, metrics)
  values (p_stat_date, 'service', null, v_service_metrics);

  with users_with_activity as (
    select n.user_id from public.notifications n where n.created_at >= v_start and n.created_at < v_end
    union
    select c.user_id from private.client_event_logs c where c.created_at >= v_start and c.created_at < v_end
    union
    select s.user_id from private.server_event_logs s where s.created_at >= v_start and s.created_at < v_end and s.user_id is not null
  )
  insert into private.daily_usage_stats (stat_date, scope, user_id, metrics)
  select
    p_stat_date,
    'user',
    activity.user_id,
    pg_catalog.jsonb_build_object(
      'notificationsAccepted', (select pg_catalog.count(*) from public.notifications n where n.user_id = activity.user_id and n.created_at >= v_start and n.created_at < v_end),
      'pushAttempted', (select pg_catalog.count(*) from private.push_delivery_logs p join public.notifications n on n.id = p.notification_id where n.user_id = activity.user_id and p.created_at >= v_start and p.created_at < v_end),
      'pushAccepted', (select pg_catalog.count(*) from private.push_delivery_logs p join public.notifications n on n.id = p.notification_id where n.user_id = activity.user_id and p.created_at >= v_start and p.created_at < v_end and p.error_message is null and p.http_status between 200 and 299),
      'pushFailed', (select pg_catalog.count(*) from private.push_delivery_logs p join public.notifications n on n.id = p.notification_id where n.user_id = activity.user_id and p.created_at >= v_start and p.created_at < v_end and (p.error_message is not null or p.http_status is null or p.http_status not between 200 and 299)),
      'clientErrors', (select pg_catalog.count(*) from private.client_event_logs c where c.user_id = activity.user_id and c.created_at >= v_start and c.created_at < v_end and c.level = 'error'),
      'serverErrors', (select pg_catalog.count(*) from private.server_event_logs s where s.user_id = activity.user_id and s.created_at >= v_start and s.created_at < v_end and s.level = 'error')
    )
  from users_with_activity as activity;

  return v_service_metrics;
end;
$$;

revoke all on function public.refresh_daily_usage_stats_internal(date)
from public, anon, authenticated;
grant execute on function public.refresh_daily_usage_stats_internal(date)
to service_role;
