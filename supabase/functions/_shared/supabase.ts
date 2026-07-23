import { createClient, type User } from '@supabase/supabase-js';

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

export async function requireUser(req: Request): Promise<User> {
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('UNAUTHORIZED');
  const token = authorization.slice(7);
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw new Error('UNAUTHORIZED');
  return data.user;
}
