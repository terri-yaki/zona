-- Daily reporting uses Hong Kong calendar days. This migration only replaces
-- private service-role functions and reschedules the private report job; it
-- does not change any mobile or ingestion-facing table/API contract.

create or replace function public.refresh_daily_usage_stats_internal(
  p_stat_date date default ((pg_catalog.now() at time zone 'Asia/Hong_Kong')::date - 1)
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := p_stat_date::timestamp at time zone 'Asia/Hong_Kong';
  v_end timestamptz := (p_stat_date + 1)::timestamp at time zone 'Asia/Hong_Kong';
  v_service_metrics jsonb;
begin
  if p_stat_date is null or p_stat_date > (pg_catalog.now() at time zone 'Asia/Hong_Kong')::date then
    raise exception 'INVALID_STAT_DATE';
  end if;

  delete from private.daily_usage_stats as stat
  where stat.stat_date = p_stat_date;

  select pg_catalog.jsonb_build_object(
    -- Keep notificationsAccepted for existing report readers while exposing
    -- the clearer notificationsTriggered name to new reports.
    'notificationsAccepted', (select pg_catalog.count(*) from public.notifications n where n.created_at >= v_start and n.created_at < v_end),
    'notificationsTriggered', (select pg_catalog.count(*) from public.notifications n where n.created_at >= v_start and n.created_at < v_end),
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
    'newUsers', (select pg_catalog.count(*) from auth.users u where u.created_at >= v_start and u.created_at < v_end),
    'totalUsers', (select pg_catalog.count(*) from auth.users),
    'newKeys', (select pg_catalog.count(*) from public.api_keys key where key.created_at >= v_start and key.created_at < v_end),
    'totalKeys', (select pg_catalog.count(*) from public.api_keys),
    'activeKeys', (
      select pg_catalog.count(*)
      from public.api_keys key
      join public.sources source on source.id = key.source_id
      where source.revoked_at is null
        and key.revoked_at is null
        and key.is_active
        and (key.expires_at is null or key.expires_at > pg_catalog.now())
    ),
    'totalSources', (select pg_catalog.count(*) from public.sources),
    'activeSources', (
      select pg_catalog.count(*)
      from public.sources source
      join public.api_keys key on key.source_id = source.id
      where source.revoked_at is null
        and key.revoked_at is null
        and key.is_active
        and (key.expires_at is null or key.expires_at > pg_catalog.now())
    ),
    'activeSendingSources', (select pg_catalog.count(distinct n.source_id) from public.notifications n where n.created_at >= v_start and n.created_at < v_end),
    'activePushDevices', (select pg_catalog.count(*) from public.push_devices d where d.disabled_at is null),
    'appOpens', (select pg_catalog.count(*) from private.client_event_logs c where c.event_name = 'app.session_ready' and c.created_at >= v_start and c.created_at < v_end),
    'activeInstallations', (select pg_catalog.count(distinct c.installation_id) from private.client_event_logs c where c.created_at >= v_start and c.created_at < v_end),
    'activeUsers', (
      select pg_catalog.count(*)
      from (
        select n.user_id from public.notifications n where n.created_at >= v_start and n.created_at < v_end
        union
        select c.user_id from private.client_event_logs c where c.created_at >= v_start and c.created_at < v_end
      ) as active_users
    )
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
      'notificationsTriggered', (select pg_catalog.count(*) from public.notifications n where n.user_id = activity.user_id and n.created_at >= v_start and n.created_at < v_end),
      'pushAttempted', (select pg_catalog.count(*) from private.push_delivery_logs p join public.notifications n on n.id = p.notification_id where n.user_id = activity.user_id and p.created_at >= v_start and p.created_at < v_end),
      'pushAccepted', (select pg_catalog.count(*) from private.push_delivery_logs p join public.notifications n on n.id = p.notification_id where n.user_id = activity.user_id and p.created_at >= v_start and p.created_at < v_end and p.error_message is null and p.http_status between 200 and 299),
      'pushFailed', (select pg_catalog.count(*) from private.push_delivery_logs p join public.notifications n on n.id = p.notification_id where n.user_id = activity.user_id and p.created_at >= v_start and p.created_at < v_end and (p.error_message is not null or p.http_status is null or p.http_status not between 200 and 299)),
      'appOpens', (select pg_catalog.count(*) from private.client_event_logs c where c.user_id = activity.user_id and c.event_name = 'app.session_ready' and c.created_at >= v_start and c.created_at < v_end),
      'activeInstallations', (select pg_catalog.count(distinct c.installation_id) from private.client_event_logs c where c.user_id = activity.user_id and c.created_at >= v_start and c.created_at < v_end),
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

-- Rebuild the visible trend immediately so all seven bars use the same HKT
-- boundary instead of mixing earlier UTC aggregates with new HKT aggregates.
do $$
declare
  v_offset integer;
begin
  for v_offset in 1..7 loop
    perform public.refresh_daily_usage_stats_internal(
      (pg_catalog.now() at time zone 'Asia/Hong_Kong')::date - v_offset
    );
  end loop;
end;
$$;

create or replace function public.configure_daily_stats_report_internal(
  p_project_url text,
  p_report_secret text
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_job_id bigint;
begin
  if p_project_url is null
    or pg_catalog.btrim(p_project_url) !~ '^https://[a-z0-9]+\.supabase\.co$'
    or p_report_secret is null
    or char_length(p_report_secret) not between 32 and 200 then
    raise exception 'INVALID_DAILY_REPORT_CONFIGURATION';
  end if;

  select secret.id into v_secret_id from vault.secrets as secret where secret.name = 'zona_project_url';
  if v_secret_id is null then
    perform vault.create_secret(pg_catalog.btrim(p_project_url), 'zona_project_url', 'Zona Edge Function base URL');
  else
    perform vault.update_secret(v_secret_id, pg_catalog.btrim(p_project_url), 'zona_project_url', 'Zona Edge Function base URL');
  end if;

  select secret.id into v_secret_id from vault.secrets as secret where secret.name = 'zona_daily_report_secret';
  if v_secret_id is null then
    perform vault.create_secret(p_report_secret, 'zona_daily_report_secret', 'Zona daily report scheduler credential');
  else
    perform vault.update_secret(v_secret_id, p_report_secret, 'zona_daily_report_secret', 'Zona daily report scheduler credential');
  end if;

  perform cron.unschedule(job.jobid)
  from cron.job as job
  where job.jobname = 'zona-daily-stats-report';

  -- pg_cron is UTC: 16:05 UTC is 00:05 HKT. The measured day itself starts
  -- and ends exactly at 00:00 Asia/Hong_Kong.
  select cron.schedule(
    'zona-daily-stats-report',
    '5 16 * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'zona_project_url') || '/functions/v1/daily-stats-report',
        headers := pg_catalog.jsonb_build_object(
          'Content-Type', 'application/json',
          'x-daily-report-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'zona_daily_report_secret')
        ),
        body := pg_catalog.jsonb_build_object(
          'date', (((pg_catalog.now() at time zone 'Asia/Hong_Kong')::date - 1)::text)
        ),
        timeout_milliseconds := 30000
      );
    $job$
  ) into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.configure_daily_stats_report_internal(text, text)
from public, anon, authenticated;
grant execute on function public.configure_daily_stats_report_internal(text, text)
to service_role;

-- Reconfigure an existing production job without exposing or rotating its
-- Vault-held credentials. Fresh installs run the normal setup script instead.
do $$
declare
  v_project_url text;
  v_report_secret text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'zona_project_url';

  select decrypted_secret into v_report_secret
  from vault.decrypted_secrets
  where name = 'zona_daily_report_secret';

  if v_project_url is not null and v_report_secret is not null then
    perform public.configure_daily_stats_report_internal(v_project_url, v_report_secret);
  end if;
end;
$$;

-- The daily pulse is an operator tool, not an end-user v0.0.7 feature. Hide
-- the already-published card from both normalized and legacy note readers.
update public.app_release_note_items as item
set is_active = false,
    updated_at = pg_catalog.now()
where item.release_id = (
  select note.id from public.app_release_notes as note where note.version = '0.0.7'
)
  and item.item_key = 'daily-pulse';

update public.app_release_notes as note
set legacy_items = coalesce(
      (
        select pg_catalog.jsonb_agg(entry.value order by entry.ordinality)
        from pg_catalog.jsonb_array_elements(note.legacy_items) with ordinality as entry(value, ordinality)
        where entry.value ->> 'key' <> 'daily-pulse'
      ),
      '[]'::jsonb
    ),
    updated_at = pg_catalog.now()
where note.version = '0.0.7';
