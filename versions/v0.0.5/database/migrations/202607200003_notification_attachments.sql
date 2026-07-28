-- Notification image attachments (screenshots as evidence). Forward-only: do not
-- fold into an already-applied migration. One optional image per notification,
-- stored in a private Storage bucket and readable only by the owning user.

alter table public.notifications
  add column attachment_path text,
  add column attachment_mime text,
  add column attachment_bytes integer;

alter table public.notifications
  add constraint notifications_attachment_check check (
    (attachment_path is null and attachment_mime is null and attachment_bytes is null)
    or (
      attachment_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'
      and attachment_mime in ('image/png', 'image/jpeg', 'image/webp')
      and attachment_bytes between 1 and 5242880
    )
  ) not valid;

alter table public.notifications
  validate constraint notifications_attachment_check;

insert into storage.buckets (id, name, public)
values ('notification-attachments', 'notification-attachments', false);

-- Owners read (signed URLs/downloads) and early-purge their own attachments.
-- Writes remain service-role only through the notify Edge Function.
create policy "Owners read their notification attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'notification-attachments'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy "Owners delete their notification attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'notification-attachments'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create or replace function public.ingest_notification_internal(
  p_token_hash text,
  p_idempotency_key text,
  p_title text,
  p_body text,
  p_category text,
  p_data jsonb,
  p_attachment_hash text default null
) returns table (
  notification_id uuid,
  source_id uuid,
  source_name text,
  owner_user_id uuid,
  created_at timestamptz,
  idempotent_replay boolean,
  attachment_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_source public.sources%rowtype;
  v_source_request_count integer;
  v_user_request_count integer;
  v_notification public.notifications%rowtype;
  v_request_hash text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_TOKEN';
  end if;

  if p_idempotency_key is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  if p_title is null
    or p_body is null
    or char_length(pg_catalog.btrim(p_title)) not between 1 and 120
    or char_length(pg_catalog.btrim(p_body)) not between 1 and 2000
    or (p_category is not null and char_length(pg_catalog.btrim(p_category)) not between 1 and 80)
    or p_data is null
    or pg_catalog.jsonb_typeof(p_data) <> 'object'
    or pg_catalog.octet_length(p_data::text) > 4096
    or (p_attachment_hash is not null and p_attachment_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'INVALID_PAYLOAD';
  end if;

  select credential.source_id into v_source_id
  from private.source_credentials as credential
  where credential.token_hash = p_token_hash;

  if not found then
    raise exception 'INVALID_TOKEN';
  end if;

  -- Ingest and source management take the same lock. Once a revoke request
  -- returns, no request can continue from a stale pre-revocation read.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:source:' || v_source_id::text, 0)
  );

  select source.* into v_source
  from public.sources as source
  where source.id = v_source_id
    and source.revoked_at is null
  for update;

  if not found then
    raise exception 'INVALID_TOKEN';
  end if;

  v_request_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'title', pg_catalog.btrim(p_title),
          'body', pg_catalog.btrim(p_body),
          'category', nullif(pg_catalog.btrim(p_category), ''),
          'data', p_data,
          'attachment', p_attachment_hash
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select notification.* into v_notification
  from public.notifications as notification
  where notification.source_id = v_source.id
    and notification.idempotency_key = p_idempotency_key;

  if found then
    if v_notification.request_hash <> v_request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;

    return query select
      v_notification.id,
      v_source.id,
      v_notification.source_name_snapshot,
      v_source.user_id,
      v_notification.created_at,
      true,
      v_notification.attachment_path;
    return;
  end if;

  -- Different sources for the same account share this lock, preventing the
  -- aggregate rolling-window check from being overrun by concurrent sources.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zona:ingest-user:' || v_source.user_id::text, 0)
  );

  select count(*) into v_source_request_count
  from private.ingest_requests as request
  where request.source_id = v_source.id
    and request.requested_at >= pg_catalog.now() - interval '1 minute';

  if v_source_request_count >= 60 then
    raise exception 'RATE_LIMITED';
  end if;

  select count(*) into v_user_request_count
  from private.ingest_requests as request
  where request.user_id = v_source.user_id
    and request.requested_at >= pg_catalog.now() - interval '1 minute';

  if v_user_request_count >= 300 then
    raise exception 'ACCOUNT_RATE_LIMITED';
  end if;

  insert into private.ingest_requests (source_id, user_id)
  values (v_source.id, v_source.user_id);

  update public.sources
  set last_seen_at = pg_catalog.now()
  where id = v_source.id;

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
    v_source.user_id,
    v_source.id,
    v_source.display_name,
    pg_catalog.btrim(p_title),
    pg_catalog.btrim(p_body),
    nullif(pg_catalog.btrim(p_category), ''),
    p_data,
    p_idempotency_key,
    v_request_hash
  )
  returning * into v_notification;

  return query select
    v_notification.id,
    v_source.id,
    v_source.display_name,
    v_source.user_id,
    v_notification.created_at,
    false,
    v_notification.attachment_path;
end;
$$;

drop function public.ingest_notification_internal(text, text, text, text, text, jsonb);

-- Sets attachment metadata after the Edge Function has stored the object. The
-- path must be exactly {owner_user_id}/{notification_id} so a service caller can
-- never point one user's notification at another user's object.
create or replace function public.attach_notification_image_internal(
  p_notification_id uuid,
  p_path text,
  p_mime text,
  p_bytes integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select notification.user_id into v_owner
  from public.notifications as notification
  where notification.id = p_notification_id;

  if not found then
    raise exception 'NOTIFICATION_NOT_FOUND';
  end if;

  if p_path is null
    or p_path <> v_owner::text || '/' || p_notification_id::text
    or p_mime is null
    or p_mime not in ('image/png', 'image/jpeg', 'image/webp')
    or p_bytes is null
    or p_bytes not between 1 and 5242880 then
    raise exception 'INVALID_ATTACHMENT';
  end if;

  update public.notifications as notification
  set attachment_path = p_path,
      attachment_mime = p_mime,
      attachment_bytes = p_bytes
  where notification.id = p_notification_id;
end;
$$;

create or replace function private.cleanup_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notifications integer;
  v_ingest_requests integer;
  v_rate_events integer;
  v_push_devices integer;
  v_sources integer;
  v_cron_history integer;
begin
  delete from public.notifications
  where expires_at <= pg_catalog.now()
    and attachment_path is null;
  get diagnostics v_notifications = row_count;

  delete from private.ingest_requests
  where requested_at < pg_catalog.now() - interval '1 day';
  get diagnostics v_ingest_requests = row_count;

  delete from private.account_rate_events
  where requested_at < pg_catalog.now() - interval '2 days';
  get diagnostics v_rate_events = row_count;

  delete from public.push_devices
  where disabled_at < pg_catalog.now() - interval '7 days';
  get diagnostics v_push_devices = row_count;

  delete from public.sources as source
  where source.revoked_at < pg_catalog.now() - interval '30 days'
    and not exists (
      select 1
      from public.notifications as notification
      where notification.source_id = source.id
    );
  get diagnostics v_sources = row_count;

  delete from cron.job_run_details
  where coalesce(end_time, start_time) < pg_catalog.now() - interval '30 days';
  get diagnostics v_cron_history = row_count;

  return pg_catalog.jsonb_build_object(
    'notifications', v_notifications,
    'ingestRequests', v_ingest_requests,
    'rateEvents', v_rate_events,
    'pushDevices', v_push_devices,
    'sources', v_sources,
    'cronHistory', v_cron_history
  );
end;
$$;

revoke all on function public.ingest_notification_internal(text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.attach_notification_image_internal(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function private.cleanup_expired_data() from public, anon, authenticated;

grant execute on function public.ingest_notification_internal(text, text, text, text, text, jsonb, text) to service_role;
grant execute on function public.attach_notification_image_internal(uuid, text, text, integer) to service_role;
