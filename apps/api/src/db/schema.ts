import { sql } from 'drizzle-orm';
import { date, doublePrecision, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  contactName: text('contact_name').notNull(),
  phone: text('phone').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  accessNote: text('access_note'),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
});

export const appliances = pgTable('appliances', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  yearBuilt: integer('year_built'),
});

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  applianceId: uuid('appliance_id').references(() => appliances.id),
  scheduledStart: timestamp('scheduled_start', { withTimezone: true }).notNull(),
  scheduledEnd: timestamp('scheduled_end', { withTimezone: true }).notNull(),
  status: text('status', { enum: ['scheduled', 'in_progress', 'done'] }).notNull().default('scheduled'),
  // Header fields of the form live on the job itself.
  priority: text('priority').notNull().default('medium'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  /** One-line result shown in a client's history. */
  outcome: text('outcome'),
  appliancePrefilledFrom: date('appliance_prefilled_from'),
  /** Optimistic concurrency for commits. */
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Scalar form fields, one row per field. */
export const jobValues = pgTable(
  'job_values',
  {
    jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
    fieldKey: text('field_key').notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.fieldKey] })],
);

/** Repeating rows, e.g. materials used. */
export const jobLines = pgTable('job_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  groupKey: text('group_key').notNull(),
  values: jsonb('values').notNull(),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
