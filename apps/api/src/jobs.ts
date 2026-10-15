import { and, asc, desc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import {
  APPLIANCE_KEYS,
  FIELD_BY_KEY,
  committedLineIds,
  missingColumns,
  normalizeProposalSet,
  type FieldValue,
  type JobDetailDto,
  type JobSummaryDto,
  type LineValues,
  type ProposalSet,
} from '@formcast/shared';
import { db, schema, type Db } from './db/client';

const { jobs, clients, appliances, jobValues, jobLines } = schema;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export class ConflictError extends Error {}
export class NotFoundError extends Error {}

const TZ = 'Europe/Brussels';

type JobRow = typeof jobs.$inferSelect;

/**
 * Form fields stored as columns on the job row instead of in job_values, so the
 * Today list can show them. Everything outside this map treats them like any field.
 */
const JOB_COLUMNS: Record<string, { read: (j: JobRow) => FieldValue; write: (v: FieldValue | undefined) => Partial<JobRow> } | undefined> = {
  priority: { read: (j) => j.priority, write: (v) => ({ priority: String(v) }) },
  tags: { read: (j) => j.tags, write: (v) => ({ tags: (v as string[] | undefined) ?? [] }) },
};

const summary = (j: JobRow, clientName: string): JobSummaryDto => ({
  id: j.id,
  code: j.code,
  title: j.title,
  scheduledStart: j.scheduledStart.toISOString(),
  scheduledEnd: j.scheduledEnd.toISOString(),
  status: j.status,
  clientName,
  priority: j.priority,
  tags: j.tags,
});

/** Jobs scheduled on a calendar day (YYYY-MM-DD, Brussels time), in schedule order. */
export async function listJobs(day: string): Promise<JobSummaryDto[]> {
  const start = sql`(${day}::date)::timestamp at time zone ${TZ}`;
  const end = sql`((${day}::date) + 1)::timestamp at time zone ${TZ}`;
  const rows = await db
    .select({ job: jobs, clientName: clients.name })
    .from(jobs)
    .innerJoin(clients, eq(clients.id, jobs.clientId))
    .where(and(gte(jobs.scheduledStart, start), lt(jobs.scheduledStart, end)))
    .orderBy(asc(jobs.scheduledStart));
  return rows.map((r) => summary(r.job, r.clientName));
}

/** Days in a range that have at least one job, for the week strip. */
export async function daysWithJobs(from: string, to: string): Promise<string[]> {
  const res = await db.execute<{ day: string }>(sql`
    select distinct to_char(${jobs.scheduledStart} at time zone ${TZ}, 'YYYY-MM-DD') as day
    from ${jobs}
    where (${jobs.scheduledStart} at time zone ${TZ})::date between ${from}::date and ${to}::date`);
  return res.rows.map((r) => r.day);
}

export async function getJob(id: string, tx: Tx | Db = db): Promise<JobDetailDto> {
  const [row] = await tx
    .select({ job: jobs, client: clients, appliance: appliances })
    .from(jobs)
    .innerJoin(clients, eq(clients.id, jobs.clientId))
    .leftJoin(appliances, eq(appliances.id, jobs.applianceId))
    .where(eq(jobs.id, id));
  if (!row) throw new NotFoundError('Job not found');

  // Sequential: a transaction is one connection and can't run queries in parallel.
  const valueRows = await tx.select().from(jobValues).where(eq(jobValues.jobId, id));
  const lineRows = await tx.select().from(jobLines).where(eq(jobLines.jobId, id)).orderBy(asc(jobLines.position), asc(jobLines.createdAt));
  const historyRows = await tx
    .select()
    .from(jobs)
    .where(and(eq(jobs.clientId, row.job.clientId), ne(jobs.id, id), eq(jobs.status, 'done')))
    .orderBy(desc(jobs.scheduledStart))
    .limit(5);

  const values: Record<string, FieldValue> = {};
  for (const [key, column] of Object.entries(JOB_COLUMNS)) values[key] = column!.read(row.job);
  for (const v of valueRows) values[v.fieldKey] = v.value as FieldValue;

  return {
    ...summary(row.job, row.client.name),
    description: row.job.description,
    version: row.job.version,
    client: {
      id: row.client.id,
      name: row.client.name,
      contactName: row.client.contactName,
      phone: row.client.phone,
      address: row.client.address,
      city: row.client.city,
      accessNote: row.client.accessNote,
      lat: row.client.lat,
      lng: row.client.lng,
    },
    appliance: row.appliance ? { label: row.appliance.label, yearBuilt: row.appliance.yearBuilt } : null,
    values,
    lines: lineRows.map((l) => ({ id: l.id, groupKey: l.groupKey, values: l.values as LineValues })),
    history: historyRows.map((h) => ({
      jobId: h.id,
      date: h.scheduledStart.toISOString(),
      title: h.title,
      outcome: h.outcome ?? '',
    })),
    appliancePrefilledFrom: row.job.appliancePrefilledFrom,
  };
}

/**
 * Starts a job. When the client has an earlier visit and the appliance section is
 * still empty, the appliance values are copied from that visit.
 */
export async function startJob(id: string): Promise<JobDetailDto> {
  return db.transaction(async (tx) => {
    const job = await getJob(id, tx);
    if (job.status !== 'scheduled') return job;

    const hasAppliance = APPLIANCE_KEYS.some((k) => job.values[k] !== undefined);
    let prefilledFrom: string | null = null;
    if (!hasAppliance) {
      // Most recent earlier visit of this client that recorded the appliance.
      const [source] = await tx
        .selectDistinct({ jobId: jobs.id, start: jobs.scheduledStart })
        .from(jobs)
        .innerJoin(jobValues, eq(jobValues.jobId, jobs.id))
        .where(and(eq(jobs.clientId, job.client.id), ne(jobs.id, id), inArray(jobValues.fieldKey, APPLIANCE_KEYS)))
        .orderBy(desc(jobs.scheduledStart))
        .limit(1);
      if (source) {
        const previous = await tx
          .select()
          .from(jobValues)
          .where(and(eq(jobValues.jobId, source.jobId), inArray(jobValues.fieldKey, APPLIANCE_KEYS)));
        await tx.insert(jobValues).values(previous.map((p) => ({ jobId: id, fieldKey: p.fieldKey, value: p.value })));
        prefilledFrom = source.start.toISOString().slice(0, 10);
      }
    }
    await tx
      .update(jobs)
      .set({ status: 'in_progress', appliancePrefilledFrom: prefilledFrom, version: sql`${jobs.version} + 1`, updatedAt: new Date() })
      .where(eq(jobs.id, id));
    return getJob(id, tx);
  });
}

export interface CommitResult {
  job: JobDetailDto;
  /** Ops that could not be saved, e.g. a line still missing its unit. */
  skipped: string[];
}

/** Writes a proposal set to the database in one transaction. */
export async function commit(id: string, baseVersion: number, proposals: unknown): Promise<CommitResult> {
  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(jobs).where(eq(jobs.id, id)).for('update');
    if (!locked) throw new NotFoundError('Job not found');
    if (locked.version !== baseVersion) throw new ConflictError('Job changed since it was loaded');

    const existing = await tx.select({ id: jobLines.id }).from(jobLines).where(eq(jobLines.jobId, id));
    const { set, dropped } = normalizeProposalSet(proposals, { committedLineIds: committedLineIds(existing) });
    const skipped = [...dropped];
    const jobPatch: Partial<typeof jobs.$inferInsert> = {};

    for (const op of set.fieldOps) {
      const column = JOB_COLUMNS[op.fieldKey];
      if (column) {
        Object.assign(jobPatch, column.write(op.op === 'set' ? op.value : undefined));
      } else if (op.op === 'clear') {
        await tx.delete(jobValues).where(and(eq(jobValues.jobId, id), eq(jobValues.fieldKey, op.fieldKey)));
      } else {
        await tx
          .insert(jobValues)
          .values({ jobId: id, fieldKey: op.fieldKey, value: op.value })
          .onConflictDoUpdate({ target: [jobValues.jobId, jobValues.fieldKey], set: { value: op.value, updatedAt: new Date() } });
      }
      if (op.fieldKey === 'jobComplete' && op.op === 'set') jobPatch.status = op.value === true ? 'done' : 'in_progress';
      if (op.fieldKey === 'status' && op.op === 'set') {
        jobPatch.outcome = FIELD_BY_KEY.get('status')?.options?.find((o) => o.value === op.value)?.label ?? null;
      }
    }

    let position = existing.length;
    for (const op of set.lineOps) {
      if (op.op === 'create') {
        const missing = missingColumns(op);
        if (missing.length) { skipped.push(`line ${op.lineId} missing ${missing.join(', ')}`); continue; }
        await tx.insert(jobLines).values({ jobId: id, groupKey: op.groupKey, values: op.values ?? {}, position: position++ });
      } else if (op.op === 'update') {
        await tx
          .update(jobLines)
          .set({ values: sql`${jobLines.values} || ${JSON.stringify(op.values ?? {})}::jsonb` })
          .where(and(eq(jobLines.id, op.lineId), eq(jobLines.jobId, id)));
      } else {
        await tx.delete(jobLines).where(and(eq(jobLines.id, op.lineId), eq(jobLines.jobId, id)));
      }
    }

    await tx
      .update(jobs)
      .set({ ...jobPatch, version: sql`${jobs.version} + 1`, updatedAt: new Date() })
      .where(eq(jobs.id, id));

    return { job: await getJob(id, tx), skipped };
  });
}
export type { ProposalSet };
