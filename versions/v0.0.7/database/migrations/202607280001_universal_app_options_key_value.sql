-- Convert public.universal_app_options from a single-row table with fixed
-- columns into a key/value store with activation windows (is_active,
-- starts_at, expires_at). This lets the operator stage or schedule option
-- changes without schema edits. Forward-only: do not fold into an
-- already-applied migration.

alter table if exists public.universal_app_options
  rename to universal_app_options_legacy;

create table public.universal_app_options (
  option_name text primary key
    check (option_name ~ '^[a-z0-9_]+$'),
  value text not null,
  is_active boolean not null default true,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migrate values from the legacy single-row table if it exists, then fall back
-- to the previous hardcoded defaults for any missing keys.
do $$
declare
  v_legacy public.universal_app_options_legacy%rowtype;
begin
  select * into v_legacy
  from public.universal_app_options_legacy
  where id = true;

  if found then
    insert into public.universal_app_options (option_name, value)
    values
      ('user_guide_url', v_legacy.user_guide_url),
      ('max_api_keys_standard', v_legacy.max_api_keys_standard::text),
      ('max_api_keys_premium', v_legacy.max_api_keys_premium::text),
      ('retention_days_standard', v_legacy.retention_days_standard::text),
      ('retention_days_premium', v_legacy.retention_days_premium::text),
      ('notify_rpm_standard', v_legacy.notify_rpm_standard::text),
      ('notify_rpm_premium', v_legacy.notify_rpm_premium::text),
      ('attachment_max_bytes_standard', v_legacy.attachment_max_bytes_standard::text),
      ('attachment_max_bytes_premium', v_legacy.attachment_max_bytes_premium::text)
    on conflict (option_name) do nothing;
  end if;
end
$$;

insert into public.universal_app_options (option_name, value)
values
  ('user_guide_url', 'https://gist.github.com/terri-yaki/b1cdbf91263f139f928de292f788d5bc'),
  ('max_api_keys_standard', '100'),
  ('max_api_keys_premium', '500'),
  ('retention_days_standard', '7'),
  ('retention_days_premium', '30'),
  ('notify_rpm_standard', '300'),
  ('notify_rpm_premium', '1000'),
  ('attachment_max_bytes_standard', '5242880'),
  ('attachment_max_bytes_premium', '20971520')
on conflict (option_name) do nothing;

alter table public.universal_app_options enable row level security;

create policy "Authenticated users read active universal app options"
on public.universal_app_options for select to authenticated
using (
  is_active
  and (starts_at is null or starts_at <= pg_catalog.now())
  and (expires_at is null or expires_at > pg_catalog.now())
);

revoke all on public.universal_app_options from anon, authenticated;
grant select on public.universal_app_options to authenticated;

-- Replace effective_limit to read from the key/value store. The latest active
-- row for the tiered key wins; if nothing matches, fall back to the constants
-- that were hardcoded before limits became configurable.
create or replace function private.effective_limit(p_user_id uuid, p_limit text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value text;
  v_key text;
begin
  if p_limit not in ('max_api_keys', 'retention_days', 'notify_rpm', 'attachment_max_bytes') then
    raise exception 'INVALID_LIMIT_KEY';
  end if;

  v_key := case when private.user_is_premium(p_user_id)
    then p_limit || '_premium'
    else p_limit || '_standard'
  end;

  select options.value into v_value
  from public.universal_app_options as options
  where options.option_name = v_key
    and options.is_active
    and (options.starts_at is null or options.starts_at <= pg_catalog.now())
    and (options.expires_at is null or options.expires_at > pg_catalog.now())
  order by options.created_at desc
  limit 1;

  if v_value is null then
    return case p_limit
      when 'max_api_keys' then 100
      when 'retention_days' then 7
      when 'notify_rpm' then 300
      when 'attachment_max_bytes' then 5242880
    end;
  end if;

  return v_value::integer;
end;
$$;

drop table if exists public.universal_app_options_legacy;
