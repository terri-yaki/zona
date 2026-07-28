-- Restore the notification-attachments Storage bucket and its owner
-- read/delete policies. The live project lost the bucket (404 on
-- storage/v1/bucket/notification-attachments), which made the delete-account
-- Edge Function fail its attachment sweep with INTERNAL_ERROR. Idempotent
-- repair; see 202607200003_notification_attachments.sql for the originals.

insert into storage.buckets (id, name, public)
values ('notification-attachments', 'notification-attachments', false)
on conflict (id) do nothing;

drop policy if exists "Owners read their notification attachments" on storage.objects;
create policy "Owners read their notification attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'notification-attachments'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

drop policy if exists "Owners delete their notification attachments" on storage.objects;
create policy "Owners delete their notification attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'notification-attachments'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);
