-- Per-host sound selection plus authenticated wrappers used by the mobile app
-- to avoid Edge Function cold starts for routine key management.

alter table public.api_keys
  add column sound_name text not null default 'default';

alter table public.api_keys
  add constraint api_keys_sound_name_check check (
    sound_name in (
      'default',
      'silent',
      'zona-soft.wav',
      'zona-bright.wav',
      'zona-urgent.wav'
    )
  );

create policy "Users update their API key sound"
on public.api_keys for update to authenticated
using (user_id = (select auth.uid()) and revoked_at is null)
with check (user_id = (select auth.uid()) and revoked_at is null);

grant update (sound_name, updated_at) on public.api_keys to authenticated;

create view public.source_api_keys
with (security_invoker = true)
as
select
  source.id,
  source.user_id,
  source.display_name,
  source.hostname,
  source.created_at,
  source.last_seen_at,
  source.revoked_at,
  api_key.id as api_key_id,
  api_key.name as api_key_name,
  api_key.key_prefix,
  api_key.is_active,
  api_key.created_at as key_created_at,
  api_key.updated_at as key_updated_at,
  api_key.last_used_at as key_last_used_at,
  api_key.expires_at as key_expires_at,
  api_key.revoked_at as key_revoked_at,
  api_key.sound_name
from public.sources as source
join public.api_keys as api_key
  on api_key.source_id = source.id
 and api_key.user_id = source.user_id;

revoke all on public.source_api_keys from anon, authenticated;
grant select on public.source_api_keys to authenticated;

create or replace function public.create_source(
  p_display_name text,
  p_hostname text,
  p_token_hash text,
  p_key_prefix text
) returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.create_source_internal(
    (select auth.uid()),
    p_display_name,
    p_hostname,
    p_token_hash,
    p_key_prefix
  );
$$;

create or replace function public.manage_source(
  p_source_id uuid,
  p_action text,
  p_display_name text default null,
  p_is_active boolean default null
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.manage_source_internal(
    (select auth.uid()),
    p_source_id,
    p_action,
    p_display_name,
    p_is_active
  );
$$;

create or replace function public.create_test_notification_internal(
  p_user_id uuid,
  p_source_id uuid
) returns table (
  notification_id uuid,
  source_id uuid,
  source_name text,
  owner_user_id uuid,
  created_at timestamptz,
  sound_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.sources%rowtype;
  v_key public.api_keys%rowtype;
  v_notification public.notifications%rowtype;
begin
  if p_user_id is null or p_source_id is null then
    raise exception 'INVALID_SOURCE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:source:' || p_source_id::text, 0)
  );

  select source.* into v_source
  from public.sources as source
  where source.id = p_source_id
    and source.user_id = p_user_id
    and source.revoked_at is null
  for update;

  if not found then
    raise exception 'SOURCE_NOT_FOUND';
  end if;

  select api_key.* into v_key
  from public.api_keys as api_key
  where api_key.source_id = p_source_id
    and api_key.user_id = p_user_id
    and api_key.is_active
    and api_key.revoked_at is null
    and (api_key.expires_at is null or api_key.expires_at > pg_catalog.now())
  for update;

  if not found then
    raise exception 'INVALID_TOKEN';
  end if;

  update public.sources as source
  set last_seen_at = pg_catalog.now()
  where source.id = p_source_id;

  update public.api_keys as api_key
  set last_used_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where api_key.source_id = p_source_id;

  insert into public.notifications (
    user_id,
    source_id,
    source_name_snapshot,
    title,
    body,
    category,
    data,
    idempotency_key,
    request_hash
  ) values (
    p_user_id,
    p_source_id,
    v_source.display_name,
    'Zona is connected',
    'This test alert came from ' || v_source.display_name || '.',
    'test',
    '{}'::jsonb,
    'app-test-' || extensions.gen_random_uuid()::text,
    pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(extensions.gen_random_uuid()::text, 'UTF8'), 'sha256'),
      'hex'
    )
  )
  returning * into v_notification;

  return query select
    v_notification.id,
    v_source.id,
    v_source.display_name,
    v_source.user_id,
    v_notification.created_at,
    v_key.sound_name;
end;
$$;

revoke all on function public.create_source(text, text, text, text) from public, anon;
revoke all on function public.manage_source(uuid, text, text, boolean) from public, anon;
revoke all on function public.create_test_notification_internal(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_source(text, text, text, text) to authenticated;
grant execute on function public.manage_source(uuid, text, text, boolean) to authenticated;
grant execute on function public.create_test_notification_internal(uuid, uuid) to service_role;
