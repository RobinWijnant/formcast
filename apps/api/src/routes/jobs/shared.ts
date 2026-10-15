import { and, asc, desc, eq, ne } from 'drizzle-orm';
import type { FieldValue, JobDetailDto, JobSummaryDto, LineValues } from '@formcast/shared';
import { db, schema, type Db, type Tx } from '../../db/client';
import { NotFoundError } from '../../errors';

// Used by more than one job route.

const { jobs, clients, appliances, jobValues, jobLines } = schema;

/** Schedules are planned in Brussels time; day boundaries are computed there. */
export const TZ = 'Europe/Brussels';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anything that isn't a UUID can't be a job; rejected here instead of failing the uuid cast in Postgres. */
export function parseJobId(raw: string | undefined): string {
  if (!raw || !UUID.test(raw)) throw new NotFoundError('Job not found');
  return raw;
}

export type JobRow = typeof jobs.$inferSelect;

/**
 * Form fields stored as columns on the job row instead of in job_values, so the
 * Today list can show them. Everything outside this map treats them like any field.
 */
export const JOB_COLUMNS: Record<string, { read: (j: JobRow) => FieldValue; write: (v: FieldValue | undefined) => Partial<JobRow> } | undefined> = {
  priority: { read: (j) => j.priority, write: (v) => ({ priority: String(v) }) },
  tags: { read: (j) => j.tags, write: (v) => ({ tags: (v as string[] | undefined) ?? [] }) },
};

export const toSummary = (j: JobRow, clientName: string): JobSummaryDto => ({
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

export async function loadJob(id: string, tx: Tx | Db = db): Promise<JobDetailDto> {
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
    ...toSummary(row.job, row.client.name),
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
