import { existsSync } from 'node:fs';
import { defineConfig } from '@neon/config/v1';

// Secrets for the API live in apps/api/.env.local (gitignored). Load them while
// neon.ts is evaluated so `neon dev` and `neon deploy` can pass them on.
if (existsSync('apps/api/.env.local')) process.loadEnvFile('apps/api/.env.local');

export default defineConfig({
  auth: true,
  functions: {
    api: {
      name: 'Formcast API',
      source: './apps/api/src/index.ts',
      env: {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
        GEMINI_MODEL: process.env.GEMINI_MODEL ?? '',
        GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL ?? '',
        DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY ?? '',
      },
      dev: { port: 8787 },
    },
  },
});
