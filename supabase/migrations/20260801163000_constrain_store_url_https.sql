-- Constrain release-policy store_url to https, mirroring the existing
-- app_announcements.action_url constraint. The app also sanitizes the value
-- client-side; this blocks non-https values at the operator boundary.

alter table private.client_release_policies
  add constraint client_release_policies_store_url_https
  check (store_url is null or store_url ~ '^https://[^[:space:]]+$');
