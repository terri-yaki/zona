create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  hostname text check (hostname is null or char_length(hostname) between 1 and 255),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create index sources_user_id_idx on public.sources(user_id, created_at desc);

create table private.source_credentials (
  source_id uuid primary key references public.sources(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  created_at timestamptz not null default now()
);

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 8 and 200),
  expo_push_token text not null unique,
  platform text not null default 'ios' check (platform in ('ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create index push_devices_user_id_idx on public.push_devices(user_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete restrict,
  source_name_snapshot text not null check (char_length(source_name_snapshot) between 1 and 80),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  category text check (category is null or char_length(category) between 1 and 80),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index notifications_inbox_idx on public.notifications(user_id, created_at desc);
create index notifications_source_idx on public.notifications(user_id, source_id, created_at desc);
create index notifications_expiry_idx on public.notifications(expires_at);

create table private.ingest_requests (
  id bigint generated always as identity primary key,
  source_id uuid not null references public.sources(id) on delete cascade,
  requested_at timestamptz not null default now()
);

create index ingest_requests_rate_idx on private.ingest_requests(source_id, requested_at desc);

create table private.push_delivery_logs (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  push_device_id uuid references public.push_devices(id) on delete set null,
  http_status integer,
  response jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.sources enable row level security;
alter table public.push_devices enable row level security;
alter table public.notifications enable row level security;

create policy "Users read their sources"
on public.sources for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users read unexpired notifications"
on public.notifications for select to authenticated
using (user_id = (select auth.uid()) and expires_at > now());

create policy "Users mark their notifications read"
on public.notifications for update to authenticated
using (user_id = (select auth.uid()) and expires_at > now())
with check (user_id = (select auth.uid()) and expires_at > now());

create policy "Users delete their notifications"
on public.notifications for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on public.sources, public.push_devices, public.notifications from anon, authenticated;
grant select on public.sources to authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.create_source_internal(
  p_user_id uuid,
  p_display_name text,
  p_hostname text,
  p_token_hash text
) returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_source_id uuid;
begin
  if p_user_id is null
    or char_length(trim(p_display_name)) not between 1 and 80
    or (p_hostname is not null and char_length(trim(p_hostname)) not between 1 and 255)
    or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_SOURCE';
  end if;

  insert into public.sources (user_id, display_name, hostname)
  values (p_user_id, trim(p_display_name), nullif(trim(p_hostname), ''))
  returning id into v_source_id;

  insert into private.source_credentials (source_id, token_hash)
  values (v_source_id, p_token_hash);

  return v_source_id;
end;
$$;

create or replace function public.ingest_notification_internal(
  p_token_hash text,
  p_title text,
  p_body text,
  p_category text,
  p_data jsonb
) returns table (
  notification_id uuid,
  source_id uuid,
  source_name text,
  owner_user_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_source public.sources%rowtype;
  v_request_count integer;
  v_notification public.notifications%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_TOKEN';
  end if;

  select s.* into v_source
  from public.sources s
  join private.source_credentials c on c.source_id = s.id
  where c.token_hash = p_token_hash and s.revoked_at is null;

  if not found then raise exception 'INVALID_TOKEN'; end if;

  -- Serialize each source's rate-limit check so concurrent requests cannot all
  -- observe the same pre-insert count and exceed the rolling limit.
  perform pg_advisory_xact_lock(hashtextextended(v_source.id::text, 0));

  if char_length(trim(p_title)) not between 1 and 120
    or char_length(trim(p_body)) not between 1 and 2000
    or (p_category is not null and char_length(trim(p_category)) not between 1 and 80)
    or p_data is null
    or jsonb_typeof(p_data) <> 'object'
    or octet_length(p_data::text) > 4096 then
    raise exception 'INVALID_PAYLOAD';
  end if;

  select count(*) into v_request_count
  from private.ingest_requests
  where private.ingest_requests.source_id = v_source.id
    and requested_at >= now() - interval '1 minute';

  if v_request_count >= 60 then raise exception 'RATE_LIMITED'; end if;

  insert into private.ingest_requests (source_id) values (v_source.id);
  update public.sources set last_seen_at = now() where id = v_source.id;

  insert into public.notifications (
    user_id, source_id, source_name_snapshot, title, body, category, data
  ) values (
    v_source.user_id,
    v_source.id,
    v_source.display_name,
    trim(p_title),
    trim(p_body),
    nullif(trim(p_category), ''),
    p_data
  ) returning * into v_notification;

  return query select
    v_notification.id,
    v_source.id,
    v_source.display_name,
    v_source.user_id,
    v_notification.created_at;
end;
$$;

create or replace function public.record_push_delivery_internal(
  p_notification_id uuid,
  p_push_device_id uuid,
  p_http_status integer,
  p_response jsonb,
  p_error_message text
) returns void
language sql
security definer
set search_path = public, private, pg_temp
as $$
  insert into private.push_delivery_logs (
    notification_id, push_device_id, http_status, response, error_message
  ) values (
    p_notification_id, p_push_device_id, p_http_status, p_response, p_error_message
  );
$$;

revoke all on function public.create_source_internal(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.ingest_notification_internal(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_push_delivery_internal(uuid, uuid, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_source_internal(uuid, text, text, text) to service_role;
grant execute on function public.ingest_notification_internal(text, text, text, text, jsonb) to service_role;
grant execute on function public.record_push_delivery_internal(uuid, uuid, integer, jsonb, text) to service_role;

alter publication supabase_realtime add table public.notifications;

select cron.schedule(
  'zona-delete-expired-data',
  '17 * * * *',
  $$
    delete from public.notifications where expires_at <= now();
    delete from private.ingest_requests where requested_at < now() - interval '1 day';
  $$
);
