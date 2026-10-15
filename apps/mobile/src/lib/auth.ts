import { create } from 'zustand';
import { createAuthClient } from 'better-auth/client';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import type { UserDto } from '@formcast/shared';
import { storage } from './storage';

// Neon Auth (Managed Better Auth). The Expo client keeps the session cookie in
// SecureStore; the API only ever sees short-lived JWTs minted from that session.
export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_NEON_AUTH_URL,
  plugins: [expoClient({ scheme: 'formcast', storagePrefix: 'formcast', cookiePrefix: 'neon-auth', storage: SecureStore })],
});

const USER_KEY = 'formcast.user';

interface AuthState {
  ready: boolean;
  /** Set while a session is stored on the device. */
  user: UserDto | null;
  /** API JWT, kept in memory only. */
  token: string | null;
  expiresAt: number;
  hydrate: () => Promise<void>;
  setUser: (user: UserDto) => Promise<void>;
  setToken: (token: string) => void;
  clear: () => Promise<void>;
}

/** Expiry of a JWT in ms. Only `exp` is read, so plain base64 decoding is enough. */
function expiryOf(token: string): number {
  const payload = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
  const { exp } = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))) as { exp?: number };
  return (exp ?? 0) * 1000;
}

export const useAuth = create<AuthState>((set) => ({
  ready: false,
  user: null,
  token: null,
  expiresAt: 0,
  async hydrate() {
    const [cookie, raw] = await Promise.all([authClient.getCookie(), storage.get(USER_KEY)]);
    if (cookie && raw) {
      try {
        set({ user: JSON.parse(raw) as UserDto });
      } catch {
        await storage.set(USER_KEY, null);
      }
    }
    set({ ready: true });
  },
  async setUser(user) {
    await storage.set(USER_KEY, JSON.stringify(user));
    set({ user });
  },
  setToken(token) {
    set({ token, expiresAt: expiryOf(token) });
  },
  async clear() {
    await storage.set(USER_KEY, null);
    set({ user: null, token: null, expiresAt: 0 });
  },
}));
