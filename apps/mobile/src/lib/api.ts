import type { AuthResponse, CommitBody, JobDetailDto, JobSummaryDto } from '@formcast/shared';
import { useAuth } from './auth';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

let refreshing: Promise<string> | null = null;

/** Returns a JWT that is valid for at least another 30 seconds, refreshing if needed. */
export async function validToken(): Promise<string> {
  const { token, refreshToken, expiresAt, setSession, clear } = useAuth.getState();
  if (!token || !refreshToken) throw new ApiError('Sign in required', 401);
  if (expiresAt - Date.now() > 30_000) return token;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await clear();
        throw new ApiError('Your session expired. Sign in again.', 401);
      }
      const auth = (await res.json()) as AuthResponse;
      await setSession(auth);
      return auth.token;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (auth) headers.set('authorization', `Bearer ${await validToken()}`);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Can't reach Formcast. Check your connection.", 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 401 && auth) await useAuth.getState().clear();
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  signIn: (email: string, password: string) =>
    request<AuthResponse>('/auth/sign-in', { method: 'POST', body: JSON.stringify({ email, password }) }, false),
  signOut: (refreshToken: string) =>
    request<{ ok: true }>('/auth/sign-out', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false),
  jobs: (date: string) => request<JobSummaryDto[]>(`/jobs?date=${date}`),
  calendar: (from: string, to: string) => request<string[]>(`/calendar?from=${from}&to=${to}`),
  job: (id: string) => request<JobDetailDto>(`/jobs/${id}`),
  startJob: (id: string) => request<JobDetailDto>(`/jobs/${id}/start`, { method: 'POST' }),
  commit: (id: string, body: CommitBody) =>
    request<{ job: JobDetailDto; skipped: string[] }>(`/jobs/${id}/commit`, { method: 'POST', body: JSON.stringify(body) }),
};

export const sessionUrl = async (jobId: string) =>
  `${API_URL.replace(/^http/, 'ws')}/v1/jobs/${jobId}/session?token=${encodeURIComponent(await validToken())}`;
