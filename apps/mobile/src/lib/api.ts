import type { CommitBody, JobDetailDto, JobSummaryDto } from '@formcast/shared';
import { authClient, useAuth } from './auth';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// Neon Auth origin-checks cookie-bearing POSTs (sign-out). Neon only accepts
// http(s) trusted domains, so the app identifies as this fixed one.
const ORIGIN = 'https://formcast.be';
const OFFLINE = "Can't reach Formcast. Check your connection.";

export async function signIn(email: string, password: string) {
  const { data, error } = await authClient.signIn.email({ email, password }).catch(() => {
    throw new ApiError(OFFLINE, 0);
  });
  if (error) throw new ApiError(error.status === 401 ? 'Wrong email or password.' : 'Sign in failed. Try again.', error.status);

  await useAuth.getState().setUser({ id: data.user.id, name: data.user.name, email: data.user.email });
}

/** Revokes the session when Neon Auth is reachable; the device copy is always dropped. */
export async function signOut() {
  await authClient.signOut({ fetchOptions: { headers: { origin: ORIGIN } } }).catch(() => undefined);
  await useAuth.getState().clear();
}

let minting: Promise<string> | null = null;

/** Returns a JWT that is valid for at least another 30 seconds, minting one from the session if needed. */
export async function validToken(): Promise<string> {
  const { user, token, expiresAt, setToken } = useAuth.getState();
  if (!user) throw new ApiError('Sign in required', 401);
  if (token && expiresAt - Date.now() > 30_000) return token;

  minting ??= (async () => {
    try {
      const { data, error } = await authClient.$fetch<{ token: string }>('/token', { method: 'GET' }).catch(() => {
        throw new ApiError(OFFLINE, 0);
      });
      if (error?.status === 401) {
        await signOut();
        throw new ApiError('Your session expired. Sign in again.', 401);
      }
      if (error) throw new ApiError(OFFLINE, 0);

      setToken(data.token);
      return data.token;
    } finally {
      minting = null;
    }
  })();

  return minting;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  headers.set('authorization', `Bearer ${await validToken()}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1${path}`, { ...init, headers });
  } catch {
    throw new ApiError(OFFLINE, 0);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 401) await signOut();
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }

  return res.json() as Promise<T>;
}

export const api = {
  jobs: (date: string) => request<JobSummaryDto[]>(`/jobs?date=${date}`),
  calendar: (from: string, to: string) => request<string[]>(`/calendar?from=${from}&to=${to}`),
  job: (id: string) => request<JobDetailDto>(`/jobs/${id}`),
  startJob: (id: string) => request<JobDetailDto>(`/jobs/${id}/start`, { method: 'POST' }),
  commit: (id: string, body: CommitBody) =>
    request<{ job: JobDetailDto; skipped: string[] }>(`/jobs/${id}/commit`, { method: 'POST', body: JSON.stringify(body) }),
};

export const sessionUrl = async (jobId: string) =>
  `${API_URL.replace(/^http/, 'ws')}/v1/jobs/${jobId}/session?token=${encodeURIComponent(await validToken())}`;
