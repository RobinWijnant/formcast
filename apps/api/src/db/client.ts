import { attachDatabasePool } from '@neon/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env';
import * as schema from './schema';

// Created once per isolate and reused across requests.
export const pool = new Pool({ connectionString: env.databaseUrl.replace('sslmode=require', 'sslmode=verify-full'), max: 5 });
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
