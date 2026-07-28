-- Add an opt-out flag to app_changelog so draft or superseded entries can be
-- hidden from the What's New screen without deleting data. Forward-only.

alter table public.app_changelog
  add column if not exists is_active boolean not null default true;

-- Make the intent explicit for rows created before this column existed.
update public.app_changelog
  set is_active = true
  where is_active is null;
