// Reject every session issued before password-only authentication was enforced.
export const AUTH_SESSION_VERSION = 2;

export interface AuthSessionPayload {
  sub: string;
  sessionVersion?: number;
  exp?: number;
}

export function isCurrentAuthSession(payload: AuthSessionPayload): boolean {
  return payload?.sessionVersion === AUTH_SESSION_VERSION &&
    typeof payload.sub === 'string' && payload.sub.length > 0;
}
