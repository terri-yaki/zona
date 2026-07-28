import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

process.loadEnvFile('.env');

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publishableKey) throw new Error('Missing public Supabase environment.');

const supabase = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const result = {};
let signedIn = false;
let failed = null;
let stage = 'authenticate';
let realtimeChannel = null;
const keepAccount = process.env.KEEP_SMOKE_ACCOUNT === '1';

try {
  const { data: auth, error: authError } = await supabase.auth.signInAnonymously();
  if (authError) throw authError;
  signedIn = true;
  result.auth = Boolean(auth.user?.is_anonymous);
  if (keepAccount) result.userId = auth.user.id;
  await supabase.realtime.setAuth(auth.session.access_token);

  stage = 'create source';
  const token = `zona_live_${randomBytes(32).toString('base64url')}`;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data: sourceId, error: createError } = await supabase.rpc('create_source', {
    p_display_name: 'Disposable API Test',
    p_hostname: 'SMOKE-TEST',
    p_token_hash: tokenHash,
    p_key_prefix: token.slice(0, 18),
  });
  if (createError) throw createError;
  result.created = typeof sourceId === 'string';
  if (keepAccount) result.sourceId = sourceId;

  stage = 'read source overview';
  const { data: keyRow, error: keyError } = await supabase
    .from('notification_source_overview')
    .select('access_key_id,access_key_name,is_active,key_prefix,sound_name')
    .eq('id', sourceId)
    .single();
  if (keyError) throw keyError;
  result.apiKey = { name: keyRow.access_key_name, isActive: keyRow.is_active, hasPrefix: Boolean(keyRow.key_prefix) };

  stage = 'update source sound';
  const { error: soundError } = await supabase
    .rpc('update_source_notification_sound', {
      p_access_key_id: keyRow.access_key_id,
      p_sound_name: 'default',
    });
  if (soundError) throw soundError;

  stage = 'update preferences';
  const { error: optionCreateError } = await supabase.rpc('update_user_notification_preferences', {
    p_push_enabled: false,
    p_play_sound: false,
    p_show_preview: false,
    p_live_activity_enabled: false,
  });
  if (optionCreateError) throw optionCreateError;
  stage = 'read preferences';
  const { data: optionRow, error: optionError } = await supabase
    .rpc('get_user_notification_preferences');
  if (optionError) throw optionError;
  result.options = {
    push_enabled: optionRow.push_enabled,
    play_sound: optionRow.play_sound,
    show_preview: optionRow.show_preview,
  };

  stage = 'read release notes';
  const { data: release, error: releaseError } = await supabase
    .from('app_release_notes')
    .select('version,is_active,app_release_note_items(item_key,is_active)')
    .eq('version', '0.0.6')
    .single();
  if (releaseError) throw releaseError;
  result.releaseNotes = release.is_active && release.app_release_note_items.length >= 4;

  stage = 'bootstrap runtime controls';
  const { data: bootstrap, error: bootstrapError } = await supabase.rpc('get_app_bootstrap', {
    p_platform: 'ios',
    p_app_version: '0.0.6',
    p_build_number: 14,
    p_release_channel: 'production',
    p_locale: 'en',
    p_installation_id: `smoke-${auth.user.id}`,
  });
  if (bootstrapError) throw bootstrapError;
  result.bootstrap = Boolean(bootstrap?.features?.['sources.create'] && bootstrap?.limits?.retentionDays);

  stage = 'pause source';
  const { error: pauseError } = await supabase.rpc('manage_source', {
    p_action: 'set_active',
    p_display_name: null,
    p_is_active: false,
    p_source_id: sourceId,
  });
  if (pauseError) throw pauseError;

  const notifyUrl = `${url}/functions/v1/notify`;
  const send = (suffix) => fetch(notifyUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'idempotency-key': `smoke-${Date.now()}-${suffix}`,
    },
    body: JSON.stringify({
      title: 'Smoke test',
      body: 'Disposable production verification.',
      category: 'test',
    }),
  });

  stage = 'send with paused source';
  const paused = await send('paused');
  result.pausedStatus = paused.status;

  stage = 'activate source';
  const { error: activateError } = await supabase.rpc('manage_source', {
    p_action: 'set_active',
    p_display_name: null,
    p_is_active: true,
    p_source_id: sourceId,
  });
  if (activateError) throw activateError;

  stage = 'subscribe to inbox broadcast';
  let resolveBroadcast;
  const broadcastReceived = new Promise((resolve) => { resolveBroadcast = resolve; });
  const subscribed = new Promise((resolve, reject) => {
    realtimeChannel = supabase
      .channel(`zona:inbox:${auth.user.id}`, { config: { private: true } })
      .on('broadcast', { event: 'changed' }, () => resolveBroadcast(true))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`Realtime ${status}`));
      });
  });
  await subscribed;

  stage = 'send active notification';
  const active = await send('active');
  result.activeStatus = active.status;
  const activeBody = await active.json();
  result.accepted = Boolean(
    activeBody.notificationId
    && activeBody.sourceId === sourceId
    && activeBody.pushAttempted === 0
  );
  result.realtimeInbox = await Promise.race([
    broadcastReceived,
    new Promise((resolve) => setTimeout(() => resolve(false), 8_000)),
  ]);
  if (!result.realtimeInbox) throw new Error('Inbox broadcast was not received.');

  if (process.platform === 'win32') {
    stage = 'send PowerShell attachment';
    const attachmentPath = resolve(tmpdir(), `zona-smoke-${Date.now()}.png`);
    writeFileSync(
      attachmentPath,
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    );
    try {
      const sender = spawnSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        resolve('..', 'examples', 'send-notification.ps1'),
        '-Title',
        'PowerShell attachment smoke test',
        '-Body',
        'Windows PowerShell multipart upload succeeded.',
        '-Category',
        'test',
        '-Attachment',
        attachmentPath,
      ], {
        encoding: 'utf8',
        env: { ...process.env, ZONA_NOTIFY_URL: notifyUrl, ZONA_SOURCE_TOKEN: token },
      });
      if (sender.status !== 0) {
        throw new Error(`PowerShell attachment sender failed: ${sender.stderr || sender.stdout}`);
      }
      result.powerShellAttachment = /attachmentAccepted\s*:\s*True/i.test(sender.stdout);
    } finally {
      rmSync(attachmentPath, { force: true });
    }
  }

  stage = 'send reusable test';
  const { data: tested, error: testError } = await supabase.functions.invoke('test-source', {
    body: { sourceId },
  });
  if (testError) throw testError;
  result.reusableTest = Boolean(tested?.notificationId && tested?.sourceId === sourceId && tested?.pushAttempted === 0);

  stage = 'read final access key';
  const { data: finalKey, error: finalKeyError } = await supabase
    .from('source_access_keys')
    .select('is_active,last_used_at,sound_name')
    .eq('source_id', sourceId)
    .single();
  if (finalKeyError) throw finalKeyError;
  result.finalKey = {
    isActive: finalKey.is_active,
    hasLastUsed: Boolean(finalKey.last_used_at),
    sound: finalKey.sound_name,
  };
} catch (error) {
  failed = error;
  result.failure = {
    stage,
    code: typeof error === 'object' && error && 'code' in error ? String(error.code) : null,
    message: error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : 'Unknown smoke-test failure',
  };
} finally {
  if (realtimeChannel) await supabase.removeChannel(realtimeChannel);
  if (signedIn && !keepAccount) {
    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: { confirmation: 'DELETE' },
    });
    result.cleanup = !error && data?.deleted === true;
  }
}

console.log(JSON.stringify(result));
if (failed) process.exitCode = 1;
