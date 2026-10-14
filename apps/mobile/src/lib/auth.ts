import { create } from 'zustand';
import type { AuthResponse, UserDto } from '@formcast/shared';
import { storage } from './storage';

const KEY = 'formcast.auth';

interface AuthState {
  ready: boolean;
  token: string | null;
  refreshToken: string | null;
  expiresAt: number;
  user: UserDto | null;
  hydrate: () => Promise<void>;
  setSession: (auth: AuthResponse) => Promise<void>;
  clear: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  ready: false,
  token: null,
  refreshToken: null,
  expiresAt: 0,
  user: null,
  async hydrate() {
    const raw = await storage.get(KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as AuthResponse;
        set({ token: saved.token, refreshToken: saved.refreshToken, expiresAt: saved.expiresAt, user: saved.user });
      } catch {
        await storage.set(KEY, null);
      }
    }
    set({ ready: true });
  },
  async setSession(auth) {
    await storage.set(KEY, JSON.stringify(auth));
    set({ token: auth.token, refreshToken: auth.refreshToken, expiresAt: auth.expiresAt, user: auth.user });
  },
  async clear() {
    await storage.set(KEY, null);
    set({ token: null, refreshToken: null, expiresAt: 0, user: null });
  },
}));
