-- Apple Shortcuts are compiled into the signed iOS binary. A remote feature
-- mode cannot add, remove, or disable them, so stop presenting this key as an
-- effective runtime control while preserving its operator history.

update private.app_feature_controls
set is_active = false,
    updated_at = pg_catalog.now()
where feature_key = 'ios.shortcuts'
  and is_active;

update private.app_control_catalog
set is_active = false,
    operator_description = 'Retired: Apple Shortcuts are a signed-build capability and cannot be changed by runtime configuration.',
    updated_at = pg_catalog.now()
where control_key = 'ios.shortcuts'
  and is_active;
