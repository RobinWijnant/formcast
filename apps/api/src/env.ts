import { existsSync } from 'node:fs';

// Scripts run outside `neon dev`; give them the same variables.
for (const file of ['../../.env.local', '.env.local', 'apps/api/.env.local']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const read = (name: string) => process.env[name] ?? '';

export const env = {
  databaseUrl: read('DATABASE_URL'),
  authBaseUrl: read('NEON_AUTH_BASE_URL'),
  authJwksUrl: read('NEON_AUTH_JWKS_URL'),
  geminiApiKey: read('GEMINI_API_KEY'),
  geminiModel: read('GEMINI_MODEL') || 'gemini-3.1-flash-lite',
  geminiFallbackModel: read('GEMINI_FALLBACK_MODEL') || 'gemini-3.5-flash-lite',
  deepgramApiKey: read('DEEPGRAM_API_KEY'),
};
