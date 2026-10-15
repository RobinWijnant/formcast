import { describe, expect, it } from 'vitest';
import { normalizeValue } from './fieldTypes';
import { changedKeys, missingColumns, normalizeProposalSet } from './ops';
import { FIELD_BY_KEY } from './schema';

const ctx = { committedLineIds: new Set(['line-db-1']) };

describe('normalizeValue', () => {
  it('coerces times, numbers, selects and multiselects', () => {
    expect(normalizeValue(FIELD_BY_KEY.get('arrivalTime')!, '9:05')).toBe('09:05');
    expect(normalizeValue(FIELD_BY_KEY.get('arrivalTime')!, '25:00')).toBeUndefined();
    expect(normalizeValue(FIELD_BY_KEY.get('coPpm')!, '12,5')).toBe(12.5);
    expect(normalizeValue(FIELD_BY_KEY.get('priority')!, 'High')).toBe('high');
    expect(normalizeValue(FIELD_BY_KEY.get('priority')!, 'critical')).toBeUndefined();
    expect(normalizeValue(FIELD_BY_KEY.get('tags')!, ['Warranty', 'follow up', 'warranty', 'nope'])).toEqual(['warranty', 'follow-up']);
    expect(normalizeValue(FIELD_BY_KEY.get('nextMaintenanceBefore')!, '2027-10-14')).toBe('2027-10-14');
  });
});

describe('normalizeProposalSet', () => {
  it('never clears a required field', () => {
    const { set, dropped } = normalizeProposalSet({ fieldOps: [{ op: 'clear', fieldKey: 'priority' }], lineOps: [] }, ctx);
    expect(set.fieldOps).toEqual([]);
    expect(dropped).toEqual(["priority can't be empty"]);
  });

  it('keeps valid ops and drops invalid ones', () => {
    const { set, dropped } = normalizeProposalSet(
      {
        fieldOps: [
          { op: 'set', fieldKey: 'arrivalTime', value: '10:00' },
          { op: 'set', fieldKey: 'nope', value: 1 },
          { op: 'set', fieldKey: 'coPpm', value: 'lots' },
          { op: 'clear', fieldKey: 'remarks' },
        ],
        lineOps: [
          { op: 'create', groupKey: 'materials', lineId: 'tmp_1', values: { material: 'Cable', quantity: 15, unit: 'm' } },
          { op: 'update', groupKey: 'materials', lineId: 'line-db-1', values: { quantity: '3' } },
          { op: 'delete', groupKey: 'materials', lineId: 'ghost' },
        ],
      },
      ctx,
    );
    expect(set.fieldOps).toEqual([
      { op: 'set', fieldKey: 'arrivalTime', value: '10:00' },
      { op: 'clear', fieldKey: 'remarks' },
    ]);
    expect(set.lineOps).toEqual([
      { op: 'create', groupKey: 'materials', lineId: 'tmp_1', values: { material: 'Cable', quantity: 15, unit: 'm' } },
      { op: 'update', groupKey: 'materials', lineId: 'line-db-1', values: { quantity: 3 } },
    ]);
    expect(dropped).toHaveLength(3);
  });

  it('assigns tmp ids to creates without one', () => {
    const { set } = normalizeProposalSet(
      { lineOps: [{ op: 'create', groupKey: 'materials', values: { material: 'Screws', quantity: 40, unit: 'pcs' } }] },
      ctx,
    );
    expect(set.lineOps[0]?.lineId).toBe('tmp_1');
  });

  it('flags incomplete lines', () => {
    expect(missingColumns({ op: 'create', groupKey: 'materials', lineId: 'tmp_1', values: { material: 'Pipe', quantity: 3 } })).toEqual(['unit']);
  });
});

describe('changedKeys', () => {
  it('reports changed and removed ops', () => {
    const prev = { fieldOps: [{ op: 'set' as const, fieldKey: 'arrivalTime', value: '11:00' }], lineOps: [{ op: 'create' as const, groupKey: 'materials', lineId: 'tmp_2', values: { material: 'Screws' } }] };
    const next = { fieldOps: [{ op: 'set' as const, fieldKey: 'arrivalTime', value: '10:00' }], lineOps: [] };
    expect(changedKeys(prev, next)).toEqual({ changed: ['field:arrivalTime'], removed: ['line:tmp_2'] });
  });
});
