-- Optional iOS Live Status preference (client-driven ActivityKit in v1).
-- Default off so installs do not surprise users with Lock Screen chrome.

alter table public.app_options
  add column if not exists live_activity_enabled boolean not null default false;

comment on column public.app_options.live_activity_enabled is
  'When true, the iPhone app may start/update a Live Activity for unread inbox state while JS can run.';
