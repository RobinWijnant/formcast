import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import type { AuthResponse, UserDto } from '@formcast/shared';
import { env } from './env';

// Neon Auth (Managed Better Auth) keeps sessions in HTTP-only cookies, which a
// native app can't use. The API signs in on the app's behalf, keeps the session
// cookie as an opaque refresh token, and hands the app a short-lived JWT.

const SESSION_COOKIE = '__Secure-neon-auth.session_token';
// Better Auth requires an Origin header; any trusted origin works server-side.
const ORIGIN = 'http://localhost:8081';

const jwks = () => createRemoteJWKSet(new URL(env.authJwksUrl || `${env.authBaseUrl}/.well-known/jwks.json`));
let cachedJwks: ReturnType<typeof jwks> | undefined;

export class AuthError extends Error {
  constructor(message: string, readonly status: 400 | 401 = 401) {
    super(message);
  }
}

async function neonAuth(path: string, init: RequestInit & { session?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('origin', ORIGIN);
  if (init.body) headers.set('content-type', 'application/json');
  if (init.session) headers.set('cookie', `${SESSION_COOKIE}=${init.session}`);
  return fetch(`${env.authBaseUrl}${path}`, { ...init, headers });
}

function sessionFrom(res: Response): string | undefined {
  for (const cookie of res.headers.getSetCookie()) {
    const [pair] = cookie.split(';');
    const [name, value] = (pair ?? '').split('=');
    if (name === SESSION_COOKIE && value) return value;
  }
}

async function tokenFor(session: string): Promise<AuthResponse> {
  const res = await neonAuth('/token', { session });
  if (!res.ok) throw new AuthError('Session expired');
  const { token } = (await res.json()) as { token: string };
  const claims = decodeJwt(token);
  return {
    token,
    refreshToken: session,
    expiresAt: (claims.exp ?? 0) * 1000,
    user: { id: String(claims.sub), name: String(claims.name ?? ''), email: String(claims.email ?? '') },
  };
}

export async function signIn(email: string, password: string): Promise<AuthResponse> {
  const res = await neonAuth('/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (res.status === 401 || res.status === 400) throw new AuthError('Wrong email or password');
  if (!res.ok) throw new Error(`Neon Auth sign-in failed: ${res.status}`);
  const session = sessionFrom(res);
  if (!session) throw new Error('Neon Auth returned no session');
  return tokenFor(session);
}

export const refresh = (refreshToken: string) => tokenFor(refreshToken);

export async function signOut(refreshToken: string) {
  await neonAuth('/sign-out', { method: 'POST', body: '{}', session: refreshToken });
}

export async function verifyToken(token: string): Promise<UserDto> {
  cachedJwks ??= jwks();
  try {
    const { payload } = await jwtVerify(token, cachedJwks, { issuer: new URL(env.authBaseUrl).origin });
    return { id: String(payload.sub), name: String(payload.name ?? ''), email: String(payload.email ?? '') };
  } catch {
    throw new AuthError('Invalid or expired token');
  }
}
