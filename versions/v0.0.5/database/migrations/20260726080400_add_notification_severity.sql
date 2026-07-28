-- Optional notification urgency. Existing rows remain NULL, which is the
-- neutral white/default presentation.

alter table public.notifications
  add column if not exists severity text;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'notifications_severity_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_severity_check
      check (severity is null or severity in ('low', 'medium', 'high', 'critical'));
  end if;
end
$$;

-- Keep the seven-argument RPC for an overlap-safe Edge Function rollout.
-- The new overload folds severity into the old function's private attachment
-- hash input. That value participates only in idempotency and is not persisted.
create or replace function public.ingest_notification_internal(
  p_token_hash text,
  p_idempotency_key text,
  p_title text,
  p_body text,
  p_category text,
  p_data jsonb,
  p_attachment_hash text,
  p_severity text
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
  v_severity text;
  v_hash_attachment text;
  v_result record;
begin
  v_severity := nullif(pg_catalog.lower(pg_catalog.btrim(p_severity)), '');
  if v_severity is not null
    and v_severity not in ('low', 'medium', 'high', 'critical') then
    raise exception 'INVALID_PAYLOAD';
  end if;

  v_hash_attachment := case
    when v_severity is null then p_attachment_hash
    else pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(coalesce(p_attachment_hash, '') || ':' || v_severity, 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  end;

  select accepted.* into v_result
  from public.ingest_notification_internal(
    p_token_hash,
    p_idempotency_key,
    p_title,
    p_body,
    p_category,
    p_data,
    v_hash_attachment
  ) as accepted;

  if not v_result.idempotent_replay then
    update public.notifications
    set severity = v_severity
    where id = v_result.notification_id
      and user_id = v_result.owner_user_id;
  end if;

  return query select
    v_result.notification_id::uuid,
    v_result.source_id::uuid,
    v_result.source_name::text,
    v_result.owner_user_id::uuid,
    v_result.created_at::timestamptz,
    v_result.idempotent_replay::boolean,
    v_result.attachment_path::text;
end;
$$;

revoke all on function public.ingest_notification_internal(
  text, text, text, text, text, jsonb, text, text
) from public, anon, authenticated;

grant execute on function public.ingest_notification_internal(
  text, text, text, text, text, jsonb, text, text
) to service_role;

insert into public.app_changelog (
  version,
  released_at,
  title_en,
  title_zh_hant,
  summary_en,
  summary_zh_hant,
  items
) values (
  '0.0.5',
  '2026-07-26T08:04:00+00:00',
  'Urgency, now in color',
  '重要程度，現在一眼看懂',
  'Give an alert an optional severity and Zona will dress it in a candy-colored signal.',
  '通知可以選擇重要程度，Zona 會用清爽的糖果色讓你一眼分辨。',
  '[
    {"icon":"bell.fill","title_en":"Four useful levels","title_zh_hant":"四個清楚等級","body_en":"Low is green, medium is yellow, high is orange, and critical is red.","body_zh_hant":"低為綠色、中為黃色、高為橙色、嚴重為紅色。"},
    {"icon":"paintpalette.fill","title_en":"Color without clutter","title_zh_hant":"有顏色，不雜亂","body_en":"Inbox cards and notification icons carry the signal; alerts without severity stay clean white.","body_zh_hant":"收件匣卡片和通知圖示會顯示顏色，未設定重要程度的通知則保持簡潔白色。"}
  ]'::jsonb
)
on conflict (version) do update set
  released_at = excluded.released_at,
  title_en = excluded.title_en,
  title_zh_hant = excluded.title_zh_hant,
  summary_en = excluded.summary_en,
  summary_zh_hant = excluded.summary_zh_hant,
  items = excluded.items,
  updated_at = now();
