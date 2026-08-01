-- Lock down the legacy create_source: it accepts client-supplied token hashes,
-- bypassing v0.0.8 server-side source-key issuance (create-source-key). The
-- shipped app no longer calls it; service_role keeps server paths working.
-- Legacy field clients must upgrade (release policy can hard-require v0.0.8).

revoke execute on function public.create_source(text, text, text, text)
from public, anon, authenticated;

grant execute on function public.create_source(text, text, text, text) to service_role;
