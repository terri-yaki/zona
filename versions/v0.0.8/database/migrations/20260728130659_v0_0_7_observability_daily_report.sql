-- v0.0.7 observability: privacy-safe client/server events, durable daily
-- aggregates, and an idempotent daily report ledger.

create extension if not exists pg_net with schema extensions;

create table private.client_event_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id text not null,
  event_name text not null,
  level text not null default 'info' check (level in ('debug', 'info', 'warning', 'error')),
  message text,
  app_version text not null,
  build_number integer not null default 0 check (build_number >= 0),
  platform text not null check (platform in ('ios', 'android', 'web')),
  context jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(context) = 'object'),
  created_at timestamptz not null default pg_catalog.now(),
  check (char_length(installation_id) between 8 and 200),
  check (event_name ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  check (message is null or char_length(message) <= 500),
  check (pg_catalog.octet_length(context::text) <= 4096)
);

create index client_event_logs_user_created_idx
on private.client_event_logs (user_id, created_at desc);

create index client_event_logs_event_created_idx
on private.client_event_logs (event_name, created_at desc);

create table private.server_event_logs (
  id bigint generated always as identity primary key,
  request_id uuid,
  component text not null,
  event_name text not null,
  level text not null default 'info' check (level in ('debug', 'info', 'warning', 'error')),
  user_id uuid references auth.users(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  notification_id uuid references public.notifications(id) on delete set null,
  status_code integer check (status_code is null or status_code between 100 and 599),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 3600000),
  message text,
  context jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(context) = 'object'),
  created_at timestamptz not null default pg_catalog.now(),
  check (component ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  check (event_name ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  check (message is null or char_length(message) <= 500),
  check (pg_catalog.octet_length(context::text) <= 8192)
);

create index server_event_logs_created_idx
on private.server_event_logs (created_at desc);

create index server_event_logs_component_event_idx
on private.server_event_logs (component, event_name, created_at desc);

create index server_event_logs_user_created_idx
on private.server_event_logs (user_id, created_at desc)
where user_id is not null;

create table private.daily_usage_stats (
  id bigint generated always as identity primary key,
  stat_date date not null,
  scope text not null check (scope in ('service', 'user')),
  user_id uuid references auth.users(id) on delete cascade,
  metrics jsonb not null check (pg_catalog.jsonb_typeof(metrics) = 'object'),
  generated_at timestamptz not null default pg_catalog.now(),
  check ((scope = 'service' and user_id is null) or (scope = 'user' and user_id is not null))
);

create unique index daily_usage_stats_scope_idx
on private.daily_usage_stats (
  stat_date,
  scope,
  coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create index daily_usage_stats_user_date_idx
on private.daily_usage_stats (user_id, stat_date desc)
where user_id is not null;

create table private.daily_report_runs (
  report_date date primary key,
  status text not null check (status in ('running', 'sent', 'failed')),
  notification_id uuid,
  metrics jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(metrics) = 'object'),
  started_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  error_message text check (error_message is null or char_length(error_message) <= 500),
  updated_at timestamptz not null default pg_catalog.now()
);

revoke all on private.client_event_logs from public, anon, authenticated;
revoke all on private.server_event_logs from public, anon, authenticated;
revoke all on private.daily_usage_stats from public, anon, authenticated;
revoke all on private.daily_report_runs from public, anon, authenticated;

create or replace function public.record_client_event(
  p_installation_id text,
  p_event_name text,
  p_level text,
  p_message text,
  p_app_version text,
  p_build_number integer,
  p_platform text,
  p_context jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_recent_count integer;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_installation_id is null
    or char_length(pg_catalog.btrim(p_installation_id)) not between 8 and 200
    or p_event_name is null
    or pg_catalog.btrim(p_event_name) !~ '^[a-z][a-z0-9_.-]{1,79}$'
    or p_level not in ('debug', 'info', 'warning', 'error')
    or p_app_version is null
    or char_length(pg_catalog.btrim(p_app_version)) not between 1 and 32
    or coalesce(p_build_number, -1) < 0
    or p_platform not in ('ios', 'android', 'web')
    or p_context is null
    or pg_catalog.jsonb_typeof(p_context) <> 'object'
    or pg_catalog.octet_length(p_context::text) > 4096
    or (p_message is not null and char_length(p_message) > 500) then
    raise exception 'INVALID_CLIENT_EVENT';
  end if;

  select pg_catalog.count(*) into v_recent_count
  from private.client_event_logs as event
  where event.user_id = v_user_id
    and event.created_at >= pg_catalog.now() - interval '1 hour';

  if v_recent_count >= 300 then
    raise exception 'CLIENT_LOG_RATE_LIMITED';
  end if;

  insert into private.client_event_logs (
    user_id,
    installation_id,
    event_name,
    level,
    message,
    app_version,
    build_number,
    platform,
    context
  ) values (
    v_user_id,
    pg_catalog.btrim(p_installation_id),
    pg_catalog.btrim(p_event_name),
    p_level,
    nullif(pg_catalog.btrim(p_message), ''),
    pg_catalog.btrim(p_app_version),
    p_build_number,
    p_platform,
    p_context
  );
end;
$$;

revoke all on function public.record_client_event(text, text, text, text, text, integer, text, jsonb)
from public, anon;
grant execute on function public.record_client_event(text, text, text, text, text, integer, text, jsonb)
to authenticated;

create or replace function public.record_server_event_internal(
  p_request_id uuid,
  p_component text,
  p_event_name text,
  p_level text default 'info',
  p_user_id uuid default null,
  p_source_id uuid default null,
  p_notification_id uuid default null,
  p_status_code integer default null,
  p_duration_ms integer default null,
  p_message text default null,
  p_context jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_component is null
    or pg_catalog.btrim(p_component) !~ '^[a-z][a-z0-9_.-]{1,79}$'
    or p_event_name is null
    or pg_catalog.btrim(p_event_name) !~ '^[a-z][a-z0-9_.-]{1,79}$'
    or p_level not in ('debug', 'info', 'warning', 'error')
    or (p_status_code is not null and p_status_code not between 100 and 599)
    or (p_duration_ms is not null and p_duration_ms not between 0 and 3600000)
    or (p_message is not null and char_length(p_message) > 500)
    or p_context is null
    or pg_catalog.jsonb_typeof(p_context) <> 'object'
    or pg_catalog.octet_length(p_context::text) > 8192 then
    raise exception 'INVALID_SERVER_EVENT';
  end if;

  insert into private.server_event_logs (
    request_id,
    component,
    event_name,
    level,
    user_id,
    source_id,
    notification_id,
    status_code,
    duration_ms,
    message,
    context
  ) values (
    p_request_id,
    pg_catalog.btrim(p_component),
    pg_catalog.btrim(p_event_name),
    p_level,
    p_user_id,
    p_source_id,
    p_notification_id,
    p_status_code,
    p_duration_ms,
    nullif(pg_catalog.btrim(p_message), ''),
    p_context
  );
end;
$$;

revoke all on function public.record_server_event_internal(uuid, text, text, text, uuid, uuid, uuid, integer, integer, text, jsonb)
from public, anon, authenticated;
grant execute on function public.record_server_event_internal(uuid, text, text, text, uuid, uuid, uuid, integer, integer, text, jsonb)
to service_role;

create or replace function private.capture_operational_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_name text;
  v_user_id uuid;
  v_source_id uuid;
  v_notification_id uuid;
  v_context jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'notifications' and tg_op = 'INSERT' then
    v_event_name := 'notification.inserted';
    v_user_id := new.user_id;
    v_source_id := new.source_id;
    v_notification_id := new.id;
    v_context := pg_catalog.jsonb_build_object(
      'severity', new.severity,
      'hasAttachment', new.attachment_path is not null
    );
  elsif tg_table_name = 'sources' and tg_op = 'INSERT' then
    v_event_name := 'source.created';
    v_user_id := new.user_id;
    v_source_id := new.id;
  elsif tg_table_name = 'sources' and tg_op = 'UPDATE' then
    v_user_id := new.user_id;
    v_source_id := new.id;
    if old.revoked_at is distinct from new.revoked_at and new.revoked_at is not null then
      v_event_name := 'source.revoked';
    elsif old.is_active is distinct from new.is_active then
      v_event_name := case when new.is_active then 'source.activated' else 'source.paused' end;
    elsif old.display_name is distinct from new.display_name then
      v_event_name := 'source.renamed';
    else
      return new;
    end if;
  elsif tg_table_name = 'push_devices' and tg_op = 'INSERT' then
    v_event_name := 'push_device.registered';
    v_user_id := new.user_id;
    v_context := pg_catalog.jsonb_build_object('platform', new.platform);
  elsif tg_table_name = 'push_devices' and tg_op = 'UPDATE' then
    v_user_id := new.user_id;
    if old.disabled_at is distinct from new.disabled_at then
      v_event_name := case when new.disabled_at is null then 'push_device.enabled' else 'push_device.disabled' end;
      v_context := pg_catalog.jsonb_build_object('platform', new.platform);
    else
      return new;
    end if;
  elsif tg_table_name = 'api_keys' and tg_op = 'UPDATE' then
    v_user_id := new.user_id;
    v_source_id := new.source_id;
    if old.revoked_at is distinct from new.revoked_at and new.revoked_at is not null then
      v_event_name := 'access_key.revoked';
    elsif old.is_active is distinct from new.is_active then
      v_event_name := case when new.is_active then 'access_key.activated' else 'access_key.paused' end;
    else
      return new;
    end if;
  else
    return new;
  end if;

  insert into private.server_event_logs (
    component,
    event_name,
    level,
    user_id,
    source_id,
    notification_id,
    context
  ) values (
    'database',
    v_event_name,
    'info',
    v_user_id,
    v_source_id,
    v_notification_id,
    v_context
  );
  return new;
end;
$$;

revoke all on function private.capture_operational_event() from public, anon, authenticated;

create trigger notifications_capture_operational_event
after insert on public.notifications
for each row execute function private.capture_operational_event();

create trigger sources_capture_operational_event
after insert or update on public.sources
for each row execute function private.capture_operational_event();

create trigger push_devices_capture_operational_event
after insert or update on public.push_devices
for each row execute function private.capture_operational_event();

create trigger api_keys_capture_operational_event
after update on public.api_keys
for each row execute function private.capture_operational_event();

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
    'activeSources', (select pg_catalog.count(*) from public.sources s where s.revoked_at is null and s.is_active),
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

create or replace function public.list_service_daily_usage_stats_internal(
  p_days integer default 7
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'date', stat.stat_date,
        'metrics', stat.metrics,
        'generatedAt', stat.generated_at
      ) order by stat.stat_date
    ),
    '[]'::jsonb
  )
  from (
    select daily.stat_date, daily.metrics, daily.generated_at
    from private.daily_usage_stats as daily
    where daily.scope = 'service'
    order by daily.stat_date desc
    limit least(greatest(coalesce(p_days, 7), 1), 31)
  ) as stat;
$$;

revoke all on function public.list_service_daily_usage_stats_internal(integer)
from public, anon, authenticated;
grant execute on function public.list_service_daily_usage_stats_internal(integer)
to service_role;

create or replace function public.start_daily_report_internal(
  p_report_date date,
  p_metrics jsonb
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.daily_report_runs (report_date, status, metrics)
  values (p_report_date, 'running', p_metrics)
  on conflict (report_date) do nothing;
  if found then return true; end if;

  update private.daily_report_runs as run
  set status = 'running',
      metrics = p_metrics,
      started_at = pg_catalog.now(),
      completed_at = null,
      error_message = null,
      updated_at = pg_catalog.now()
  where run.report_date = p_report_date
    and (
      run.status = 'failed'
      or (run.status = 'running' and run.updated_at < pg_catalog.now() - interval '15 minutes')
    );
  return found;
end;
$$;

create or replace function public.finish_daily_report_internal(
  p_report_date date,
  p_status text,
  p_notification_id uuid default null,
  p_error_message text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('sent', 'failed') then raise exception 'INVALID_REPORT_STATUS'; end if;
  update private.daily_report_runs
  set status = p_status,
      notification_id = p_notification_id,
      error_message = left(p_error_message, 500),
      completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where report_date = p_report_date;
end;
$$;

revoke all on function public.start_daily_report_internal(date, jsonb) from public, anon, authenticated;
revoke all on function public.finish_daily_report_internal(date, text, uuid, text) from public, anon, authenticated;
grant execute on function public.start_daily_report_internal(date, jsonb) to service_role;
grant execute on function public.finish_daily_report_internal(date, text, uuid, text) to service_role;

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

  select cron.schedule(
    'zona-daily-stats-report',
    '5 0 * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'zona_project_url') || '/functions/v1/daily-stats-report',
        headers := pg_catalog.jsonb_build_object(
          'Content-Type', 'application/json',
          'x-daily-report-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'zona_daily_report_secret')
        ),
        body := pg_catalog.jsonb_build_object(
          'date', (((pg_catalog.now() at time zone 'UTC')::date - 1)::text)
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

-- Raw diagnostic records are intentionally short-lived; aggregate trends live
-- longer without retaining message-level client/server context.
select cron.schedule(
  'zona-observability-retention',
  '43 2 * * *',
  $$
    delete from private.client_event_logs where created_at < pg_catalog.now() - interval '30 days';
    delete from private.server_event_logs where created_at < pg_catalog.now() - interval '30 days';
    delete from private.daily_usage_stats where stat_date < (pg_catalog.now() at time zone 'UTC')::date - 400;
    delete from private.daily_report_runs where report_date < (pg_catalog.now() at time zone 'UTC')::date - 90;
  $$
);

comment on table private.client_event_logs is
  'Privacy-safe mobile lifecycle and error events. Never store notification bodies, tokens, or attachment contents.';
comment on table private.server_event_logs is
  'Structured Edge Function operational events; secrets and request payloads are excluded.';
comment on table private.daily_usage_stats is
  'UTC daily service and per-user aggregates generated independently of raw log retention.';
