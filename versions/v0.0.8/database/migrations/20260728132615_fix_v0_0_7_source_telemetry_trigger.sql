-- Source pause state belongs to api_keys, not sources. The first telemetry
-- trigger incorrectly inspected a non-existent sources.is_active field.

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

revoke all on function private.capture_operational_event()
from public, anon, authenticated;
