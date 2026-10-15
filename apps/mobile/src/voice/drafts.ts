import { create } from 'zustand';
import { EMPTY_PROPOSALS, opKey, type FieldOp, type LineOp, type OpKey, type ProposalSet } from '@formcast/shared';
import { usePrefs } from '@/lib/prefs';

// The proposal layer: pending changes per job, kept apart from the committed
// job data until the technician taps Save.

export interface Ghost {
  key: string;
  op: LineOp;
  until: number;
}

/** Where a pending change is in its fill: heard (countdown) -> flash (green) -> settled. */
export type FillStage = 'heard' | 'flash';

export interface Draft {
  pending: ProposalSet;
  /** When each op last changed; drives the countdown ring and auto-scroll. */
  changedAt: Record<string, number>;
  /** Ops still counting down or flashing green. Absent means settled. */
  stage: Record<string, FillStage>;
  /** Pending creates that were just dropped, shown fading out. */
  ghosts: Ghost[];
}

const EMPTY_DRAFT: Draft = { pending: EMPTY_PROPOSALS, changedAt: {}, stage: {}, ghosts: [] };
const GHOST_MS = 1200;
/** How long a settled row stays green before it turns back to normal. */
export const FILL_FLASH_MS = 1540;
/** changedAt for hand edits: far in the past, so the row shows as filled right away. */
const MANUAL = 1;

const without = <T extends object>(record: T, key: string): T => {
  const { [key]: _, ...rest } = record as Record<string, unknown>;
  return rest as T;
};

interface DraftsState {
  drafts: Record<string, Draft>;
  apply: (jobId: string, set: ProposalSet, changed: string[], removed: string[]) => void;
  remove: (jobId: string, key: string) => void;
  /** A change made by hand: lands as already filled (no countdown). */
  put: (jobId: string, op: FieldOp | LineOp) => void;
  /** Drops the given ops, keeping any that changed since they were read. */
  settle: (jobId: string, saved: ProposalSet) => void;
  clear: (jobId: string) => void;
}

// One timer per pending op moves it heard -> flash -> settled.
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const timerId = (jobId: string, key: string) => `${jobId}|${key}`;
function stopTimer(jobId: string, key: string) {
  clearTimeout(timers.get(timerId(jobId, key)));
  timers.delete(timerId(jobId, key));
}

export const useDrafts = create<DraftsState>((set, get) => {
  const setStage = (jobId: string, key: string, stage: FillStage | undefined) =>
    set((s) => {
      const d = s.drafts[jobId];
      if (!d) return s;
      const next = stage ? { ...d.stage, [key]: stage } : without(d.stage, key);
      return { drafts: { ...s.drafts, [jobId]: { ...d, stage: next } } };
    });

  const startTimer = (jobId: string, key: string) => {
    stopTimer(jobId, key);
    const id = timerId(jobId, key);
    timers.set(
      id,
      setTimeout(() => {
        setStage(jobId, key, 'flash');
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id);
            setStage(jobId, key, undefined);
          }, FILL_FLASH_MS),
        );
      }, usePrefs.getState().fillDelayMs),
    );
  };

  return {
    drafts: {},
    apply(jobId, next, changed, removed) {
      if (removed.length) {
        setTimeout(
          () =>
            set((s) => {
              const d = s.drafts[jobId];
              if (!d) return s;
              return { drafts: { ...s.drafts, [jobId]: { ...d, ghosts: d.ghosts.filter((g) => g.until > Date.now()) } } };
            }),
          GHOST_MS + 50,
        );
      }
      set((s) => {
        const prev = s.drafts[jobId] ?? EMPTY_DRAFT;
        const now = Date.now();
        const changedAt = { ...prev.changedAt };
        let stage = { ...prev.stage };
        for (const key of changed) {
          changedAt[key] = now;
          stage[key] = 'heard';
        }
        const ghosts = prev.ghosts.filter((g) => g.until > now);
        for (const key of removed) {
          delete changedAt[key];
          stage = without(stage, key);
          const op = prev.pending.lineOps.find((l) => opKey(l) === key);
          if (op?.op === 'create') ghosts.push({ key, op, until: now + GHOST_MS });
        }
        return { drafts: { ...s.drafts, [jobId]: { pending: next, changedAt, stage, ghosts } } };
      });
      for (const key of changed) startTimer(jobId, key);
      for (const key of removed) stopTimer(jobId, key);
    },
    remove(jobId, key) {
      stopTimer(jobId, key);
      set((s) => {
        const prev = s.drafts[jobId];
        if (!prev) return s;
        const keep = (o: FieldOp | LineOp) => opKey(o) !== key;
        return {
          drafts: {
            ...s.drafts,
            [jobId]: {
              ...prev,
              changedAt: without(prev.changedAt, key),
              stage: without(prev.stage, key),
              pending: { fieldOps: prev.pending.fieldOps.filter(keep), lineOps: prev.pending.lineOps.filter(keep) },
            },
          },
        };
      });
    },
    put(jobId, op) {
      const key = opKey(op);
      stopTimer(jobId, key);
      set((s) => {
        const prev = s.drafts[jobId] ?? EMPTY_DRAFT;
        const fieldOps = prev.pending.fieldOps.filter((o) => opKey(o) !== key);
        const lineOps = prev.pending.lineOps.filter((o) => opKey(o) !== key);
        if ('fieldKey' in op) fieldOps.push(op);
        else lineOps.push(op);
        return {
          drafts: {
            ...s.drafts,
            [jobId]: { ...prev, pending: { fieldOps, lineOps }, changedAt: { ...prev.changedAt, [key]: MANUAL }, stage: without(prev.stage, key) },
          },
        };
      });
    },
    settle(jobId, saved) {
      const current = get().drafts[jobId];
      if (!current) return;
      const savedJson = new Map<OpKey, string>([...saved.fieldOps, ...saved.lineOps].map((o) => [opKey(o), JSON.stringify(o)]));
      for (const op of [...current.pending.fieldOps, ...current.pending.lineOps]) {
        const key = opKey(op);
        if (savedJson.get(key) === JSON.stringify(op)) get().remove(jobId, key);
      }
    },
    clear(jobId) {
      for (const id of [...timers.keys()]) if (id.startsWith(`${jobId}|`)) stopTimer(jobId, id.slice(jobId.length + 1));
      set((s) => ({ drafts: { ...s.drafts, [jobId]: EMPTY_DRAFT } }));
    },
  };
});

export const useDraft = (jobId: string) => useDrafts((s) => s.drafts[jobId] ?? EMPTY_DRAFT);

export const pendingCount = (d: Draft) => d.pending.fieldOps.length + d.pending.lineOps.length;
