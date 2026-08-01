const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// This only extracts claims. Call it after Supabase Auth has verified the JWT.
export function sessionIdFromVerifiedJwt(token: string, expectedUserId: string) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const claims = JSON.parse(atob(padded)) as { sub?: unknown; session_id?: unknown };
    if (claims.sub !== expectedUserId || typeof claims.session_id !== 'string' || !uuidPattern.test(claims.session_id)) {
      return null;
    }
    return claims.session_id;
  } catch {
    return null;
  }
}
