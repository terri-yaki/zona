alter table public.push_devices
  drop constraint if exists push_devices_platform_check;

alter table public.push_devices
  add constraint push_devices_platform_check
  check (platform in ('ios', 'android')) not valid;

alter table public.push_devices
  validate constraint push_devices_platform_check;

create or replace function public.register_push_device_internal(
  p_user_id uuid,
  p_device_id text,
  p_expo_push_token text,
  p_platform text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.push_devices%rowtype;
  v_token_device public.push_devices%rowtype;
  v_has_device boolean;
  v_has_token boolean;
  v_active_devices integer;
  v_recent_registrations integer;
begin
  if p_user_id is null
    or p_device_id is null
    or p_expo_push_token is null
    or p_platform is null
    or char_length(pg_catalog.btrim(p_device_id)) not between 8 and 200
    or char_length(pg_catalog.btrim(p_expo_push_token)) not between 20 and 255
    or pg_catalog.btrim(p_expo_push_token) !~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$'
    or p_platform not in ('ios', 'android') then
    raise exception 'INVALID_DEVICE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:push-token:' || pg_catalog.btrim(p_expo_push_token), 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:push-user:' || p_user_id::text, 0)
  );

  select device.* into v_device
  from public.push_devices as device
  where device.user_id = p_user_id
    and device.device_id = pg_catalog.btrim(p_device_id)
  for update;
  v_has_device := found;

  select device.* into v_token_device
  from public.push_devices as device
  where device.expo_push_token = pg_catalog.btrim(p_expo_push_token)
  for update;
  v_has_token := found;

  if v_has_token and v_token_device.user_id <> p_user_id then
    raise exception 'TOKEN_CONFLICT';
  end if;

  if v_has_device
    and v_device.expo_push_token = pg_catalog.btrim(p_expo_push_token)
    and v_device.platform = p_platform
    and v_device.disabled_at is null then
    update public.push_devices
    set updated_at = pg_catalog.now()
    where id = v_device.id;
    return v_device.id;
  end if;

  select count(*) into v_recent_registrations
  from private.account_rate_events as event
  where event.user_id = p_user_id
    and event.event_type = 'register_push_device'
    and event.requested_at >= pg_catalog.now() - interval '1 hour';

  if v_recent_registrations >= 120 then
    raise exception 'DEVICE_RATE_LIMITED';
  end if;

  if not v_has_device or v_device.disabled_at is not null then
    select count(*) into v_active_devices
    from public.push_devices as device
    where device.user_id = p_user_id
      and device.disabled_at is null;

    if v_active_devices >= 10
      and not (v_has_token and v_token_device.user_id = p_user_id and v_token_device.device_id <> pg_catalog.btrim(p_device_id)) then
      raise exception 'DEVICE_LIMIT_REACHED';
    end if;
  end if;

  if v_has_token and v_token_device.device_id <> pg_catalog.btrim(p_device_id) then
    delete from public.push_devices
    where id = v_token_device.id;
  end if;

  if v_has_device then
    update public.push_devices
    set expo_push_token = pg_catalog.btrim(p_expo_push_token),
        platform = p_platform,
        updated_at = pg_catalog.now(),
        disabled_at = null
    where id = v_device.id
    returning * into v_device;
  else
    insert into public.push_devices (
      user_id,
      device_id,
      expo_push_token,
      platform,
      disabled_at
    ) values (
      p_user_id,
      pg_catalog.btrim(p_device_id),
      pg_catalog.btrim(p_expo_push_token),
      p_platform,
      null
    )
    returning * into v_device;
  end if;

  insert into private.account_rate_events (user_id, event_type)
  values (p_user_id, 'register_push_device');

  return v_device.id;
end;
$$;

revoke all on function public.register_push_device_internal(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.register_push_device_internal(uuid, text, text, text) to service_role;
