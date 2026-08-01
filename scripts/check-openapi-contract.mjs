import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [spec, notifySource, testSource, deliveryMigration] = await Promise.all([
  readFile(new URL("docs/openapi.yaml", root), "utf8"),
  readFile(new URL("supabase/functions/notify/index.ts", root), "utf8"),
  readFile(new URL("supabase/functions/test-source/index.ts", root), "utf8"),
  readFile(
    new URL(
      "supabase/migrations/20260801170000_v0_0_9_notification_delivery_summary.sql",
      root,
    ),
    "utf8",
  ),
]);

function fail(message) {
  throw new Error(`OpenAPI contract drift: ${message}`);
}

function schemaBlock(name) {
  const match = spec.match(
    new RegExp(
      `^    ${name}:\\r?\\n([\\s\\S]*?)(?=^    [A-Za-z][A-Za-z0-9]*:\\r?$|(?![\\s\\S]))`,
      "m",
    ),
  );
  if (!match) fail(`components.schemas.${name} is missing`);
  return match[1];
}

function schemaKeys(name) {
  const block = schemaBlock(name);
  const properties = block.match(/^[ ]{6}properties:\r?\n([\s\S]*)$/m)?.[1] ??
    "";
  const keys = [...properties.matchAll(/^[ ]{8}([A-Za-z][A-Za-z0-9]*):\r?$/gm)]
    .map((match) => match[1]);
  if (!keys.length) fail(`${name} has no readable properties`);

  const list = block.match(
    /^[ ]{6}required:\r?\n([\s\S]*?)(?=^[ ]{6}[A-Za-z]|(?![\s\S]))/m,
  )?.[1];
  const inline = block.match(/^[ ]{6}required: \[([^\]]+)]/m)?.[1];
  const required = list
    ? [...list.matchAll(/^[ ]{8}- ([A-Za-z][A-Za-z0-9]*)\r?$/gm)].map((match) =>
      match[1]
    )
    : inline?.split(",").map((key) => key.trim()) ?? [];

  return { keys: new Set(keys), required: new Set(required) };
}

function responseKeys(source, status, label) {
  const responses = [
    ...source.matchAll(
      /^\s*return json\(\r?\n\s*\{([\s\S]*?)\r?\n\s*\},\s*\r?\n\s*(200|202),/gm,
    ),
  ]
    .filter((match) => Number(match[2]) === status);
  if (responses.length !== 1) {
    fail(
      `${label} expected one multiline HTTP ${status} response, found ${responses.length}`,
    );
  }

  const lines = responses[0][1].split(/\r?\n/);
  const candidates = lines.flatMap((line) => {
    const match = line.match(/^(\s+)([A-Za-z][A-Za-z0-9]*)(?::|,\s*$)/);
    return match ? [{ indent: match[1].length, key: match[2] }] : [];
  });
  const minimumIndent = Math.min(...candidates.map(({ indent }) => indent));
  return new Set(
    candidates.filter(({ indent }) => indent === minimumIndent).map(({ key }) =>
      key
    ),
  );
}

function compareResponse(schemaName, actual, label, branchRequired = []) {
  const schema = schemaKeys(schemaName);
  for (const key of actual) {
    if (!schema.keys.has(key)) {
      fail(`${label} returns undocumented field ${key}`);
    }
  }
  for (const key of [...schema.required, ...branchRequired]) {
    if (!actual.has(key)) fail(`${label} omits required field ${key}`);
  }
}

const notifyReplay = responseKeys(notifySource, 200, "notify replay");
const notifyAccepted = responseKeys(notifySource, 202, "notify accepted");
const testAccepted = responseKeys(testSource, 202, "test-source accepted");

compareResponse("NotifyAccepted", notifyReplay, "notify replay");
compareResponse("NotifyAccepted", notifyAccepted, "notify accepted", [
  "pushQueued",
]);
compareResponse("TestSourceAccepted", testAccepted, "test-source accepted");

const deliveryObject = deliveryMigration.match(
  /return pg_catalog\.jsonb_build_object\(([\s\S]*?)\r?\n  \);/,
)?.[1];
if (!deliveryObject) fail("delivery summary JSON projection is unreadable");
const deliveryKeys = new Set(
  [...deliveryObject.matchAll(/^    '([A-Za-z][A-Za-z0-9]*)',/gm)].map(
    (match) => match[1],
  ),
);
const deliverySchema = schemaKeys("NotificationDeliverySummary");
for (const key of deliveryKeys) {
  if (!deliverySchema.keys.has(key)) {
    fail(`delivery summary returns undocumented field ${key}`);
  }
}
for (const key of deliverySchema.required) {
  if (!deliveryKeys.has(key)) {
    fail(`delivery summary omits required field ${key}`);
  }
}

const notifySchema = schemaBlock("NotifyAccepted");
if (!/^[ ]{8}pushQueued:\r?$/m.test(notifySchema)) {
  fail("NotifyAccepted must document pushQueued");
}
if (
  !/compatib/i.test(notifySchema) || !/durable/i.test(notifySchema) ||
  !/receipt/i.test(notifySchema)
) {
  fail(
    "NotifyAccepted delivery fields must explain durable queue, compatibility, and receipt semantics",
  );
}

console.log(
  "OpenAPI response fields match notification handlers and delivery summary RPC.",
);
