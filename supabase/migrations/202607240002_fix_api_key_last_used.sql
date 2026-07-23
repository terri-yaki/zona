-- Correct the target-column reference in already-deployed copies of the
-- ingestion function. Fresh databases receive the qualified form in 001.
do $$
declare
  v_signature constant regprocedure :=
    'public.ingest_notification_internal(text,text,text,text,text,jsonb,text)'::regprocedure;
  v_definition text;
  v_fixed text;
begin
  select pg_catalog.pg_get_functiondef(v_signature) into v_definition;
  v_fixed := pg_catalog.replace(
    v_definition,
    'where source_id = v_source.id;',
    'where public.api_keys.source_id = v_source.id;'
  );

  if v_fixed <> v_definition then
    execute v_fixed;
  end if;
end;
$$;
