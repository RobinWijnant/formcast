# Formcast: tech stack (proposal)

## Overview

```
Expo app (React Native, TS)
  │  REST (jobs, commit)            ─┐
  │  WebSocket /sessions/:jobId      │  Bearer JWT (Neon Auth)
  ▼                                  │
API: Hono (TypeScript) on Neon Functions ◄┘
  ├─ STT: streaming ASR (Deepgram), PCM 16 kHz in, interim + final transcripts out
  ├─ Proposal engine: Claude (structured output → field/line ops), runs on a 1–1.5 s debounce
  ├─ Proposal store: in-memory per session (patch list over a form snapshot)
  └─ Commit: one Postgres transaction
        ▼
Neon Postgres (Drizzle ORM) + Neon Auth (Managed Better Auth)
```

## Choices

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces: `apps/mobile`, `apps/api`, `packages/shared` | Form schema and op types (Zod) shared by app, API and LLM schema |
| Mobile | Expo (dev build, not Expo Go), Expo Router, TypeScript | Required by the brief; a dev build is needed for native audio streaming |
| Mobile UI | Reanimated (sweep/pop/countdown), `expo-blur` (glass phone tile), `react-native-maps` | Matches the designs |
| Mobile state | Zustand for the live session/proposal store, TanStack Query for REST | Proposal layer stays separate from committed server state |
| Mic capture | `@siteed/expo-audio-studio` (PCM chunks every ~100 ms) | `expo-audio` records files only; we need a live stream |
| Transport | One WebSocket per speaking session: binary audio up, JSON events down (`transcript.partial`, `proposals.snapshot`, `status`) | Full-duplex, one connection, easy reconnect |
| API | Hono on **Neon Functions** (WebSocket support via `upgradeWebSocket`) | Same branch as the DB; Neon injects auth/JWKS env vars. Fallback: same Hono app on Node (Fly/Render) if a runtime limit bites |
| STT | Deepgram streaming (`nova` family, `nl`/`en`, interim results, endpointing) | Mature streaming API with Dutch; ElevenLabs Scribe realtime is the drop-in alternative the brief mentions |
| LLM | Claude via `@anthropic-ai/sdk`, model `claude-opus-5-5`, `effort: "low"`, structured outputs (`output_config.format` with a JSON schema of ops), prompt caching on the system prompt + form schema | Reliable structured ops and revision handling ("scrap that", "make that 15") |
| DB | Neon Postgres + Drizzle ORM / drizzle-kit migrations, Neon branches for dev | Real DB as required; branching gives a throwaway DB per PR/demo |
| Auth | **Neon Auth** (Managed Better Auth), email + password, JWT plugin | Requested; see the caveat below |
| Validation | Zod everywhere: op payloads from the LLM are validated before they reach the store | An invalid op is dropped, never applied |
| Tests | Vitest: `applyOps` reducer unit tests + a replay test that feeds the demo script transcript through the engine | Proves the revision logic without a microphone |

## Proposal engine (the core)

- Every ~1–1.5 s, after a final transcript segment (or when the speaker pauses), call Claude with:
  committed form snapshot + **full session transcript so far** + current proposal set.
- Claude returns the **complete desired proposal set** (`fieldOps`, `lineOps`), not a delta. The server diffs it against the current set and pushes a snapshot to the app.
  Recomputing from the whole transcript makes corrections idempotent: "no scrap that" simply results in a set without that op.
- Line ops reference proposal-local ids (`tmp_1`) for new rows and DB ids for existing rows.
- Each field/row keeps a `heardAt` timestamp; the app runs the 5 s heard→filled timer. A changed value resets it.
- Commit (`POST /jobs/:id/commit`) applies the ops in one transaction with an optimistic `version` check on the job.

## Migrations

Not inside Neon Functions. Migrations run as a deploy step from the laptop or CI, before the function is deployed:

```
pnpm db:migrate   # drizzle-kit migrate against DATABASE_URL_UNPOOLED of the target branch
neon deploy       # applies neon.ts (auth, functions) to the same branch
```

`neon.ts` provisions services and branch settings but does not run schema migrations. A new Neon branch (`neon checkout`) gets the parent's schema copy-on-write, so only new migrations run on it.

## Neon Auth caveat

Managed Better Auth officially supports Next.js and Vite/React today; separate frontend + backend (which includes a native app) is listed as "coming soon", because sessions are HTTP-only cookies. The supported workaround is the **JWT plugin**:

1. The app posts credentials to our API (`/auth/sign-in`); the API signs in against Neon Auth server-side and keeps the session.
2. The API fetches a JWT (EdDSA, 15 min) and returns it to the app, which stores it in `expo-secure-store`.
3. Every REST call and the WebSocket handshake (`?token=`) carry the JWT; the API verifies it with `jose` against `NEON_AUTH_JWKS_URL`.
4. `/auth/refresh` mints a new JWT before expiry.

If this costs too much time, the fallback is self-hosted Better Auth inside the API (tables in the same Neon DB), or a single seeded demo user (allowed by the brief).

## Data model (first cut)

`users` (Neon Auth) · `clients` · `appliances` (client_id) · `jobs` (client_id, appliance_id, scheduled_start/end, priority, tags[], description, status, version) · `job_values` (job_id, field_key, value jsonb) · `job_lines` (job_id, group_key, values jsonb, position) · history is past `jobs` for the same client/appliance (used to prefill Appliance).
