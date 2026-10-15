import { createFactory, createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { UserDto } from '@formcast/shared';
import { env } from './env';
import { AuthError } from './errors';

// Neon Auth (Managed Better Auth). The app signs in against Neon Auth directly and
// sends the short-lived JWT minted from its session; the API only verifies it.

const jwks = () => createRemoteJWKSet(new URL(env.authJwksUrl || `${env.authBaseUrl}/.well-known/jwks.json`));
let cachedJwks: ReturnType<typeof jwks> | undefined;

/** Every authenticated route sees the signed-in user. */
export type AppEnv = { Variables: { user: UserDto } };

/** Route handlers are built with this, so each sees the signed-in user. */
export const factory = createFactory<AppEnv>();

export async function verifyToken(token: string): Promise<UserDto> {
  cachedJwks ??= jwks();
  try {
    const { payload } = await jwtVerify(token, cachedJwks, { issuer: new URL(env.authBaseUrl).origin });
    return { id: String(payload.sub), name: String(payload.name ?? ''), email: String(payload.email ?? '') };
  } catch {
    throw new AuthError('Invalid or expired token');
  }
}

/** Bearer header, or `?token=` for the WebSocket (native WebSockets can't set headers). */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : c.req.query('token');
  if (!token) throw new AuthError('Sign in required');

  c.set('user', await verifyToken(token));
  await next();
});
