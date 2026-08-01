import { randomUUID } from 'node:crypto';

const baseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!baseUrl || !publishableKey) {
  throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required.');
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${path} returned non-JSON HTTP ${response.status}.`);
  }
  return { body, response };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const auth = await request('/auth/v1/signup', {
  body: JSON.stringify({ data: {}, gotrue_meta_security: {} }),
  headers: {
    apikey: publishableKey,
    Authorization: `Bearer ${publishableKey}`,
    'Content-Type': 'application/json',
  },
  method: 'POST',
});
expect(auth.response.ok, `anonymous sign-in returned HTTP ${auth.response.status}`);
expect(typeof auth.body?.access_token === 'string', 'anonymous sign-in omitted access_token');
const accessToken = auth.body.access_token;
const userHeaders = {
  apikey: publishableKey,
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
};

const installation = await request('/rest/v1/rpc/bind_account_installation', {
  body: JSON.stringify({
    p_app_version: '0.0.9-ci',
    p_build_number: 1,
    p_display_name: 'Contract test',
    p_installation_id: randomUUID(),
    p_platform: 'web',
  }),
  headers: userHeaders,
  method: 'POST',
});
expect(installation.response.ok, `installation bind returned HTTP ${installation.response.status}`);

const source = await request('/functions/v1/create-source', {
  body: JSON.stringify({ displayName: 'CI source', hostname: 'github-actions' }),
  headers: userHeaders,
  method: 'POST',
});
expect(source.response.status === 201, `create-source returned HTTP ${source.response.status}`);
expect(typeof source.body?.sourceId === 'string', 'create-source omitted sourceId');
expect(typeof source.body?.token === 'string', 'create-source omitted the one-time token');

const idempotencyKey = `ci-${randomUUID()}`;
const event = { body: 'The local contract test passed.', category: 'ci', severity: 'low', title: 'CI alert' };
const sourceHeaders = {
  Authorization: `Bearer ${source.body.token}`,
  'Content-Type': 'application/json',
  'Idempotency-Key': idempotencyKey,
};
const accepted = await request('/functions/v1/notify', {
  body: JSON.stringify(event),
  headers: sourceHeaders,
  method: 'POST',
});
expect(accepted.response.status === 202, `notify returned HTTP ${accepted.response.status}`);
expect(typeof accepted.body?.notificationId === 'string', 'notify omitted notificationId');
expect(accepted.body?.sourceId === source.body.sourceId, 'notify source identity drifted');
expect(accepted.body?.idempotentReplay === false, 'first notify request was marked as a replay');
expect(accepted.body?.pushQueued === 0, 'zero-device contract should queue no delivery jobs');
expect(accepted.body?.pushAttempted === 0, 'pushAttempted compatibility alias drifted');
expect(accepted.body?.pushAccepted === 0, 'pushAccepted compatibility field drifted');

const replay = await request('/functions/v1/notify', {
  body: JSON.stringify(event),
  headers: sourceHeaders,
  method: 'POST',
});
expect(replay.response.status === 200, `notify replay returned HTTP ${replay.response.status}`);
expect(replay.body?.notificationId === accepted.body.notificationId, 'notify replay returned a different record');
expect(replay.body?.idempotentReplay === true, 'notify replay flag was false');
expect(!Object.hasOwn(replay.body, 'pushQueued'), 'notify replay must not claim a newly queued job');

const delivery = await request('/rest/v1/rpc/get_notification_delivery_summary', {
  body: JSON.stringify({ p_notification_id: accepted.body.notificationId }),
  headers: userHeaders,
  method: 'POST',
});
expect(delivery.response.ok, `delivery summary returned HTTP ${delivery.response.status}`);
expect(delivery.body?.state === 'not_sent', 'zero-device delivery summary must be not_sent');
expect(delivery.body?.targetedPhones === 0, 'zero-device delivery summary targeted a phone');

console.log('Local authenticated Edge Function and delivery contracts passed.');
