// Inline npm: specifier is deliberate: the hosted Edge Function bundler cannot
// resolve deno.json import maps on Docker-less CLI deploys.
// deno-lint-ignore no-import-prefix
import { createClient, type User } from 'npm:@supabase/supabase-js@2.110.7';
import { sessionIdFromVerifiedJwt } from './verified-session.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
const secretKey = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !publishableKey || !secretKey) throw new Error('Missing Supabase runtime secrets.');

export const service = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export function projectUrl() {
  return supabaseUrl!;
}

export type VerifiedUserSession = {
  user: User;
  accessToken: string;
  sessionId: string;
};

export async function requireUserSession(req: Request): Promise<VerifiedUserSession> {
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('UNAUTHORIZED');
  const token = authorization.slice(7);
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw new Error('UNAUTHORIZED');
  // Parsing is safe only after Auth has cryptographically verified the token.
  const sessionId = sessionIdFromVerifiedJwt(token, data.user.id);
  if (!sessionId) throw new Error('UNAUTHORIZED');
  return { user: data.user, accessToken: token, sessionId };
}

export async function requireUser(req: Request): Promise<User> {
  return (await requireUserSession(req)).user;
}
