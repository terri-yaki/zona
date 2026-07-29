-- current_user is SQL syntax, not a pg_catalog relation or callable function.
-- The legacy guard's pg_catalog.current_user reference failed every preference
-- insert/update with 42P01 once the new owner RPC exercised that trigger.

create or replace function private.guard_app_options_premium()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    if tg_op = 'INSERT' then
      if new.is_premium
        or new.premium_plan is not null
        or new.premium_status is not null
        or new.premium_expires_at is not null
        or new.premium_store is not null
        or new.premium_product_id is not null
        or new.premium_customer_id is not null then
        raise exception 'PREMIUM_FIELDS_READONLY';
      end if;
    elsif new.is_premium is distinct from old.is_premium
      or new.premium_plan is distinct from old.premium_plan
      or new.premium_status is distinct from old.premium_status
      or new.premium_expires_at is distinct from old.premium_expires_at
      or new.premium_store is distinct from old.premium_store
      or new.premium_product_id is distinct from old.premium_product_id
      or new.premium_customer_id is distinct from old.premium_customer_id then
      raise exception 'PREMIUM_FIELDS_READONLY';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_app_options_premium()
from public, anon, authenticated;
