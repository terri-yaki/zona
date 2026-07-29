-- Allow the independently rate-limited access-key creation event introduced
-- by v0.0.8. The earlier constraint intentionally allowed only the two legacy
-- event kinds.
alter table private.account_rate_events
  drop constraint account_rate_events_event_type_check;

alter table private.account_rate_events
  add constraint account_rate_events_event_type_check
  check (event_type in ('create_source', 'create_source_key', 'register_push_device'));
