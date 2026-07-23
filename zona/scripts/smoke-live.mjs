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
const keepAccount = process.env.KEEP_SMOKE_ACCOUNT === '1';

try {
  const { data: auth, error: authError } = await supabase.auth.signInAnonymously();
  if (authError) throw authError;
  signedIn = true;
  result.auth = Boolean(auth.user?.is_anonymous);
  if (keepAccount) result.userId = auth.user.id;

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

  const { data: keyRow, error: keyError } = await supabase
    .from('source_api_keys')
    .select('api_key_id,api_key_name,is_active,key_prefix,sound_name')
    .eq('id', sourceId)
    .single();
  if (keyError) throw keyError;
  result.apiKey = { name: keyRow.api_key_name, isActive: keyRow.is_active, hasPrefix: Boolean(keyRow.key_prefix) };

  const { error: soundError } = await supabase
    .from('api_keys')
    .update({ sound_name: 'zona-soft.wav', updated_at: new Date().toISOString() })
    .eq('id', keyRow.api_key_id);
  if (soundError) throw soundError;

  const { error: optionCreateError } = await supabase.from('app_options').upsert({
    user_id: auth.user.id,
    push_enabled: false,
    play_sound: false,
    show_preview: false,
  });
  if (optionCreateError) throw optionCreateError;
  const { data: optionRow, error: optionError } = await supabase
    .from('app_options')
    .select('push_enabled,play_sound,show_preview')
    .single();
  if (optionError) throw optionError;
  result.options = optionRow;

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

  const paused = await send('paused');
  result.pausedStatus = paused.status;

  const { error: activateError } = await supabase.rpc('manage_source', {
    p_action: 'set_active',
    p_display_name: null,
    p_is_active: true,
    p_source_id: sourceId,
  });
  if (activateError) throw activateError;

  const active = await send('active');
  result.activeStatus = active.status;
  const activeBody = await active.json();
  result.accepted = Boolean(
    activeBody.notificationId
    && activeBody.sourceId === sourceId
    && activeBody.pushAttempted === 0
  );

  if (process.platform === 'win32') {
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

  const { data: tested, error: testError } = await supabase.functions.invoke('test-source', {
    body: { sourceId },
  });
  if (testError) throw testError;
  result.reusableTest = Boolean(tested?.notificationId && tested?.sourceId === sourceId && tested?.pushAttempted === 0);

  const { data: finalKey, error: finalKeyError } = await supabase
    .from('api_keys')
    .select('is_active,last_used_at,sound_name')
    .eq('source_id', sourceId)
    .single();
  if (finalKeyError) throw finalKeyError;
  result.finalKey = {
    isActive: finalKey.is_active,
    hasLastUsed: Boolean(finalKey.last_used_at),
    sound: finalKey.sound_name,
  };
} finally {
  if (signedIn && !keepAccount) {
    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: { confirmation: 'DELETE' },
    });
    result.cleanup = !error && data?.deleted === true;
  }
}

console.log(JSON.stringify(result));
