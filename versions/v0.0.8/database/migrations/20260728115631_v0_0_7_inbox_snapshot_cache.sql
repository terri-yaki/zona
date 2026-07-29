-- v0.0.7: return the first inbox page and unread count in one owner-scoped call.

create index if not exists notifications_user_unread_created_idx
  on public.notifications (user_id, created_at desc, id desc)
  where read_at is null;

create or replace function public.get_inbox_snapshot(
  p_source_id uuid default null,
  p_since timestamptz default null,
  p_unread_only boolean default false,
  p_page_size integer default 30
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with requested as (
    select
      notification.id,
      notification.user_id,
      notification.source_id,
      notification.source_name_snapshot,
      notification.title,
      notification.body,
      notification.category,
      notification.severity,
      notification.data,
      notification.created_at,
      notification.read_at,
      notification.expires_at,
      notification.attachment_path,
      notification.attachment_mime,
      notification.attachment_bytes
    from public.inbox_notifications as notification
    where (select auth.uid()) is not null
      and (p_source_id is null or notification.source_id = p_source_id)
      and (not p_unread_only or notification.read_at is null)
      and (p_since is null or notification.created_at >= p_since)
    order by notification.created_at desc, notification.id desc
    limit least(greatest(coalesce(p_page_size, 30), 1), 100) + 1
  )
  select pg_catalog.jsonb_build_object(
    'rows', coalesce(
      (
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(requested_row)
          order by requested_row.created_at desc, requested_row.id desc)
        from requested as requested_row
      ),
      '[]'::jsonb
    ),
    'unreadCount', (
      select pg_catalog.count(*)
      from public.inbox_notifications as unread_notification
      where unread_notification.read_at is null
    )
  );
$$;

revoke all on function public.get_inbox_snapshot(uuid, timestamptz, boolean, integer)
  from public, anon;
grant execute on function public.get_inbox_snapshot(uuid, timestamptz, boolean, integer)
  to authenticated;

comment on function public.get_inbox_snapshot(uuid, timestamptz, boolean, integer) is
  'Returns an RLS-scoped first inbox page plus unread total for the current account.';
