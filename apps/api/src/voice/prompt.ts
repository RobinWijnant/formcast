import { FIELDS, FIELD_BY_KEY, LINE_GROUPS } from '@formcast/shared';

// What the model is told and the shape it must answer in. Built from the form
// schema, so adding a field needs no prompt change.

const fieldList = FIELDS.map((f) => {
  const opts = f.options ? ` One of: ${f.options.map((o) => o.value).join(', ')}.` : '';
  return `- ${f.key} (${f.type}${f.unit ? `, ${f.unit}` : ''}): ${f.label}. ${f.hint}${opts}`;
}).join('\n');

const groupList = LINE_GROUPS.map(
  (g) => `- ${g.key}: ${g.label}. ${g.hint} Columns: ${g.columns
    .map((c) => `${c.key} (${c.type}${c.options ? `: ${c.options.map((o) => o.value).join('/')}` : ''})`)
    .join(', ')}.`,
).join('\n');

export const SYSTEM = `You fill in a boiler maintenance job report from what a field technician says out loud.

You get: today's date, the committed form (saved in the database), the pending changes from earlier, and the transcript of what the technician has said in this session, in order.

Return the COMPLETE set of pending changes that should exist after everything the technician said. Not a delta.

Fields:
${fieldList}

Line groups (repeating rows):
${groupList}

Rules:
- Only propose what the technician actually said. Never invent values.
- Keep pending changes from earlier unless the transcript changes or cancels them.
- Corrections overrule earlier statements: "no scrap that", "forget it", "never mind" remove the change they refer to; "actually it was X", "make that X" replace it.
- Field ops: {op:"set", fieldKey, value} or {op:"clear", fieldKey} to empty a committed value. Do not repeat a value that is already committed unchanged.
- Times as 24h "HH:MM" ("11am" -> "11:00", "half past ten" -> "10:30"). Dates as "YYYY-MM-DD", resolve relative dates against today.
- Numbers as plain numbers in the field's unit, as a string ("42", "12.5").
- Booleans as "true" or "false".
- Multiselect (tags): put the complete resulting list in "values", starting from the committed list. "Remove the follow-up tag" -> the list without it.
- Remarks: value is the complete new text, merging the committed remarks with what was added.
- Lines: {op:"create", groupKey, lineId, values} for a new row. Reuse the lineId of a pending create when it is the same item; a new item gets "tmp_<n>" with n higher than any pending tmp id. Change an item with a new create of the same lineId and updated values.
- To change a committed row use {op:"update", lineId:<its id>, values:<changed columns>}; to remove one use {op:"delete", lineId:<its id>}.
- Dropping a pending create ("forget the screws") means leaving it out of the result.
- "Used twelve meters of cable and forty screws" is two rows: cable 12 m and screws 40 pcs. Counted items use unit "pcs".
- If nothing relevant was said, return the pending changes unchanged.`;

// Kept flat and string-typed: easy for the model, normalized afterwards.
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    fieldOps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['set', 'clear'] },
          fieldKey: { type: 'string', enum: FIELDS.map((f) => f.key) },
          value: { type: 'string' },
          values: { type: 'array', items: { type: 'string' } },
        },
        required: ['op', 'fieldKey'],
      },
    },
    lineOps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['create', 'update', 'delete'] },
          groupKey: { type: 'string', enum: LINE_GROUPS.map((g) => g.key) },
          lineId: { type: 'string' },
          values: {
            type: 'object',
            properties: Object.fromEntries(LINE_GROUPS.flatMap((g) => g.columns).map((c) => [c.key, { type: 'string' }])),
          },
        },
        required: ['op', 'groupKey', 'lineId'],
      },
    },
  },
  required: ['fieldOps', 'lineOps'],
};

/** Model output -> loose op shape: multiselect values move into `value`. */
export function toRaw(output: { fieldOps?: unknown[]; lineOps?: unknown[] }) {
  return {
    fieldOps: (output.fieldOps ?? []).map((o) => {
      const op = o as { op: string; fieldKey: string; value?: string; values?: string[] };
      const def = FIELD_BY_KEY.get(op.fieldKey);
      return { op: op.op, fieldKey: op.fieldKey, value: def?.type === 'multiselect' ? op.values ?? [] : op.value };
    }),
    lineOps: output.lineOps ?? [],
  };
}
