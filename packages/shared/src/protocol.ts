import type { FieldValue, LineValues, ProposalSet } from './ops';

/** Audio the app streams: 16 kHz, mono, signed 16-bit little-endian PCM. */
export const AUDIO_SAMPLE_RATE = 16000;

// App -> API over the session WebSocket (audio frames are sent as binary).
export type ClientMessage =
  /** First message: unsaved changes from earlier and the actual mic sample rate. */
  | { type: 'init'; pending: ProposalSet; sampleRate?: number }
  | { type: 'reject'; key: string }
  | { type: 'stop' };

export type SessionState = 'connecting' | 'listening' | 'updating' | 'stopping' | 'closed';

// API -> app.
export type ServerMessage =
  | { type: 'ready' }
  | { type: 'transcript'; final: string; interim: string }
  | { type: 'status'; state: SessionState }
  /** Full proposal set after a model run; `changed` keys restart their fill timer. */
  | { type: 'proposals'; seq: number; set: ProposalSet; changed: string[]; removed: string[] }
  | { type: 'error'; code: 'stt' | 'llm' | 'auth' | 'job' | 'internal'; message: string }
  | { type: 'done' };

// REST DTOs.
export interface UserDto {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  expiresAt: number;
  user: UserDto;
}

export interface ClientDto {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  city: string;
  accessNote: string | null;
  lat: number;
  lng: number;
}

export interface JobLineDto {
  id: string;
  groupKey: string;
  values: LineValues;
}

export interface JobSummaryDto {
  id: string;
  code: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: 'scheduled' | 'in_progress' | 'done';
  clientName: string;
  priority: string;
  tags: string[];
}

export interface HistoryItemDto {
  jobId: string;
  date: string;
  title: string;
  outcome: string;
}

export interface JobDetailDto extends JobSummaryDto {
  description: string;
  version: number;
  client: ClientDto;
  appliance: { label: string; yearBuilt: number | null } | null;
  /** Committed field values, including priority and tags. */
  values: Record<string, FieldValue>;
  lines: JobLineDto[];
  history: HistoryItemDto[];
  /** Set when appliance values were copied from an earlier visit. */
  appliancePrefilledFrom: string | null;
}
