-- Collapse per-row notification Realtime broadcasts into one send per
-- statement/user. mark_all_inbox_notifications_read (and any bulk
-- update/delete) previously fired N inbox + N live realtime.send calls.

drop trigger if exists notifications_broadcast_user_change on public.notifications;

create or replace function private.broadcast_notification_user_ids(
  p_user_ids uuid[],
  p_operation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_user_ids is null then return; end if;
  foreach v_user_id in array p_user_ids loop
    if v_user_id is null then continue; end if;
    perform realtime.send(
      pg_catalog.jsonb_build_object('scope', 'inbox', 'operation', p_operation),
      'changed',
      'zona:inbox:' || v_user_id::text,
      true
    );
    perform realtime.send(
      pg_catalog.jsonb_build_object('scope', 'live', 'operation', p_operation),
      'changed',
      'zona:live:' || v_user_id::text,
      true
    );
  end loop;
end;
$$;

create or replace function private.broadcast_notifications_from_new()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast_notification_user_ids(
    array(select distinct new_rows.user_id from new_rows where new_rows.user_id is not null),
    tg_op
  );
  return null;
end;
$$;

create or replace function private.broadcast_notifications_from_old()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast_notification_user_ids(
    array(select distinct old_rows.user_id from old_rows where old_rows.user_id is not null),
    tg_op
  );
  return null;
end;
$$;

create trigger notifications_broadcast_insert
after insert on public.notifications
referencing new table as new_rows
for each statement execute function private.broadcast_notifications_from_new();

create trigger notifications_broadcast_update
after update on public.notifications
referencing new table as new_rows
for each statement execute function private.broadcast_notifications_from_new();

create trigger notifications_broadcast_delete
after delete on public.notifications
referencing old table as old_rows
for each statement execute function private.broadcast_notifications_from_old();

revoke all on function private.broadcast_notification_user_ids(uuid[], text)
from public, anon, authenticated;
revoke all on function private.broadcast_notifications_from_new()
from public, anon, authenticated;
revoke all on function private.broadcast_notifications_from_old()
from public, anon, authenticated;
