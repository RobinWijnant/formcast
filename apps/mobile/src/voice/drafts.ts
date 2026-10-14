import { create } from 'zustand';
import { EMPTY_PROPOSALS, opKey, type FieldOp, type LineOp, type ProposalSet } from '@formcast/shared';

// The proposal layer: pending changes per job, kept apart from the committed
// job data until the technician taps Save.

export interface Ghost {
  key: string;
  op: LineOp;
  until: number;
}

export interface Draft {
  pending: ProposalSet;
  /** When each op last changed; drives the heard -> filled timer. */
  changedAt: Record<string, number>;
  /** Pending creates that were just dropped, shown fading out. */
  ghosts: Ghost[];
}

const EMPTY_DRAFT: Draft = { pending: EMPTY_PROPOSALS, changedAt: {}, ghosts: [] };
const GHOST_MS = 1200;
/** changedAt for hand edits: far in the past, so the row shows as filled right away. */
const MANUAL = 1;

interface DraftsState {
  drafts: Record<string, Draft>;
  apply: (jobId: string, set: ProposalSet, changed: string[], removed: string[]) => void;
  remove: (jobId: string, key: string) => void;
  /** A change made by hand: lands as already filled (no countdown). */
  put: (jobId: string, op: FieldOp | LineOp) => void;
  clear: (jobId: string) => void;
}

export const useDrafts = create<DraftsState>((set) => ({
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
      for (const key of changed) changedAt[key] = now;
      const ghosts = prev.ghosts.filter((g) => g.until > now);
      for (const key of removed) {
        delete changedAt[key];
        const op = prev.pending.lineOps.find((l) => opKey(l) === key);
        if (op?.op === 'create') ghosts.push({ key, op, until: now + GHOST_MS });
      }
      return { drafts: { ...s.drafts, [jobId]: { pending: next, changedAt, ghosts } } };
    });
  },
  remove(jobId, key) {
    set((s) => {
      const prev = s.drafts[jobId];
      if (!prev) return s;
      const keep = (o: FieldOp | LineOp) => opKey(o) !== key;
      const { [key]: _, ...changedAt } = prev.changedAt;
      return {
        drafts: {
          ...s.drafts,
          [jobId]: { ...prev, changedAt, pending: { fieldOps: prev.pending.fieldOps.filter(keep), lineOps: prev.pending.lineOps.filter(keep) } },
        },
      };
    });
  },
  put(jobId, op) {
    set((s) => {
      const prev = s.drafts[jobId] ?? EMPTY_DRAFT;
      const key = opKey(op);
      const fieldOps = prev.pending.fieldOps.filter((o) => opKey(o) !== key);
      const lineOps = prev.pending.lineOps.filter((o) => opKey(o) !== key);
      if ('fieldKey' in op) fieldOps.push(op);
      else lineOps.push(op);
      return {
        drafts: {
          ...s.drafts,
          [jobId]: { ...prev, pending: { fieldOps, lineOps }, changedAt: { ...prev.changedAt, [key]: MANUAL } },
        },
      };
    });
  },
  clear(jobId) {
    set((s) => ({ drafts: { ...s.drafts, [jobId]: EMPTY_DRAFT } }));
  },
}));

export const useDraft = (jobId: string) => useDrafts((s) => s.drafts[jobId] ?? EMPTY_DRAFT);

export const pendingCount = (d: Draft) => d.pending.fieldOps.length + d.pending.lineOps.length;
