import { corsHeaders } from '../_shared/cors.ts';
import { json, readJson } from '../_shared/http.ts';
import { requireUserSession, service } from '../_shared/supabase.ts';
import { uuid } from '../_shared/validation.ts';

type TestNotification = {
  notification_id: string;
  source_id: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const { user, sessionId } = await requireUserSession(req);
    const body = await readJson(req);
    const sourceId = uuid(body.sourceId);
    const { error: accountError } = await service.rpc('assert_account_session_active_internal', {
      p_user_id: user.id,
      p_session_id: sessionId,
    });
    if (accountError) {
      if (accountError.message.includes('ACCOUNT_INACTIVE')) throw new Error('ACCOUNT_INACTIVE');
      if (accountError.message.includes('INVALID_SESSION')) throw new Error('UNAUTHORIZED');
      throw accountError;
    }
    const { data, error } = await service.rpc('create_test_notification_internal', {
      p_user_id: user.id,
      p_source_id: sourceId,
    });
    if (error) {
      if (error.message.includes('SOURCE_NOT_FOUND')) throw new Error('SOURCE_NOT_FOUND');
      if (error.message.includes('INVALID_TOKEN')) throw new Error('SOURCE_INACTIVE');
      if (error.message.includes('TEST_NOTIFICATIONS_DISABLED')) throw new Error('SERVICE_UNAVAILABLE');
      throw error;
    }

    const accepted = (data as TestNotification[] | null)?.[0];
    if (!accepted) throw new Error('SOURCE_NOT_FOUND');

    const { data: queueCount, error: queueError } = await service.rpc(
      'get_notification_push_queue_count_internal',
      { p_user_id: user.id, p_notification_id: accepted.notification_id },
    );
    if (queueError) console.error('test push queue count unavailable', queueError);
    const pushQueued = typeof queueCount === 'number' ? queueCount : 0;

    return json(
      {
        notificationId: accepted.notification_id,
        sourceId: accepted.source_id,
        pushQueued,
        pushAttempted: pushQueued,
        pushAccepted: 0,
      },
      202,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'UNAUTHORIZED') return json({ error: code }, 401);
    if (code === 'ACCOUNT_INACTIVE') return json({ error: code }, 423);
    if (code === 'SOURCE_NOT_FOUND') return json({ error: code }, 404);
    if (code === 'SOURCE_INACTIVE') return json({ error: code }, 409);
    if (code === 'SERVICE_UNAVAILABLE') return json({ error: code }, 503, { 'Retry-After': '60' });
    if (code === 'PAYLOAD_TOO_LARGE') return json({ error: code }, 413);
    if (['INVALID_SOURCE', 'CONTENT_TYPE', 'INVALID_JSON'].includes(code)) {
      return json({ error: 'INVALID_SOURCE' }, 400);
    }
    console.error('test-source', error);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});
