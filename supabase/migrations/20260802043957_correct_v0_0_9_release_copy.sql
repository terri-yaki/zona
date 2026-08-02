-- Correct the inactive v0.0.9 customer note before it can be published. A push
-- receipt shows provider acceptance, not display, and only sources/phones are
-- currently rendered against numeric limits.

update public.app_release_note_items as item
set body_en = case item.item_key
      when 'follow-an-alert' then 'Open any alert to see whether a phone push service accepted it or it is still on its way. Your inbox copy is always safe.'
      when 'see-your-usage' then 'Account now shows recent alerts, sources, access keys, phones, attachments, and storage. Sources and phones also show their account limits.'
      else item.body_en
    end,
    body_zh_hant = case item.item_key
      when 'follow-an-alert' then '打開任何通知，即可查看手機推播服務是否已接受，或通知是否仍在途中；收件匣內的副本永遠安全。'
      when 'see-your-usage' then '帳戶頁現在顯示近期通知、來源、存取金鑰、手機、附件及儲存用量；來源和手機亦會顯示帳戶上限。'
      else item.body_zh_hant
    end,
    updated_at = pg_catalog.now()
where item.release_id = (
    select note.id from public.app_release_notes as note where note.version = '0.0.9'
  )
  and item.item_key in ('follow-an-alert', 'see-your-usage');

update public.app_release_notes as note
set legacy_items = (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'key', item.item_key,
            'icon', item.icon_name,
            'is_active', item.is_active,
            'title_en', item.title_en,
            'title_zh_hant', item.title_zh_hant,
            'body_en', item.body_en,
            'body_zh_hant', item.body_zh_hant
          ) order by item.position, item.item_key
        ),
        '[]'::jsonb
      )
      from public.app_release_note_items as item
      where item.release_id = note.id
    ),
    updated_at = pg_catalog.now()
where note.version = '0.0.9';
