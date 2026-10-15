# Formcast

Fill in a boiler maintenance job report by talking. While the technician speaks, the form shows what will be saved: every heard change lights up amber with a countdown, then settles into the form with a check. Nothing reaches the database until **Save**.

Built for the Highsail full-stack case (Live Voice Form Filler).

## What's in the box

| Screen | What it does |
|---|---|
| Sign in | Neon Auth account, via the API (JWT handoff, see below) |
| Microphone priming | Shows the fill animation before the OS permission prompt |
| Today | The technician's jobs in schedule order, week strip, travel gaps |
| Job detail | Client, access note, map tile (opens directions), glass phone tile (calls), visit history, **Start job** |
| Job form | Appliance (prefilled from the last visit), Measurements, Materials used, Conclusion, Job. Priority and tags in the header. **Start speaking** opens the live dock; tap any field, material or header pill to type instead; **Save** top right |
| Settings | Speech language, auto-fill delay, live transcript, vibrate on fill, demo script, sign out |

Designs: [docs/ux-flows.md](docs/ux-flows.md) · stack rationale: [docs/tech-stack.md](docs/tech-stack.md).

## Architecture

```
Expo app (iOS)                         Neon Functions (Hono, Node 24)                 External
───────────────                        ────────────────────────────                  ────────
expo-audio useAudioStream ─ PCM 16k ─▶ WS /v1/jobs/:id/session ── PCM ─────────────▶ Deepgram nova-3 (live STT)
                                         │  transcript segments ◀────────────────── interim + final text
drafts store (proposal layer) ◀─ proposals snapshot ── session: debounce 300 ms,
  heard → (5 s) → filled ✓                │  single flight ─ prompt ────────────────▶ Gemini 3.1 Flash Lite
                                         │  normalize + validate ◀─ full proposal set  (structured JSON)
Save ─ POST /v1/jobs/:id/commit ───────▶ one Postgres transaction (version check) ──▶ Neon Postgres (Drizzle)
Sign in ─ POST /v1/auth/sign-in ───────▶ Neon Auth (Managed Better Auth) → JWT (EdDSA, 15 min)
```

- **Proposal layer, not mutations.** The session keeps a proposal set (field ops `set/clear`, line ops `create/update/delete`) on top of the committed snapshot. The app renders committed values and proposals separately; Save sends the set, the API validates and applies it in one transaction with an optimistic `version` check (409 on conflict).
- **The model returns the whole desired set, never a delta.** Every run gets the committed form, the pending set and the full session transcript. "No scrap that" simply produces a set without the arrival time; "make the cable fifteen" produces the same `tmp_1` line with a new quantity. Corrections are idempotent by construction.
- **Nothing the model says is trusted.** `normalizeProposalSet` (shared package) coerces and validates every op against the form schema: unknown fields, bad enums, impossible times, updates to lines that don't exist are dropped and logged. No-op proposals (equal to the saved value) are filtered.
- **Heard → filled is a client concern.** The server marks which ops changed; the app restarts that row's 5 s timer. Tapping the ring rejects the proposal; the server remembers it and won't re-propose the same value.

## Run it

Prerequisites: Node 24, pnpm, Xcode (iOS Simulator), the Neon CLI (`npm i -g neon`), accounts for Neon, Gemini and Deepgram.

```bash
pnpm install
neon link                       # writes .env.local with DATABASE_URL, NEON_AUTH_* …
cp apps/api/.env.example apps/api/.env.local   # add GEMINI_API_KEY and DEEPGRAM_API_KEY
pnpm db:migrate && pnpm db:seed # schema + demo data for today (re-run before a demo)
pnpm dev:api                    # neon dev → http://localhost:8787
```

App (`apps/mobile/.env` points at the deployed API; set `EXPO_PUBLIC_API_URL=http://localhost:8787` to use `neon dev`):

```bash
cd apps/mobile && npx expo run:ios   # development build (expo-audio streaming needs native code)
```

Demo account: `tom.verhoeven@example.com` / `formcast-demo-2026`.

Deploy the API: `pnpm db:migrate && neon deploy` (migrations run as a deploy step, never inside the function).

## Tests

```bash
pnpm test                                   # shared: op validation, normalization, diffing
pnpm typecheck
pnpm --filter @formcast/mobile lint          # expo lint (incl. React hooks rules)
pnpm --filter @formcast/api replay          # demo script through the real model, step by step, with checks
pnpm --filter @formcast/api e2e:voice       # macOS `say` → PCM → WebSocket → Deepgram → Gemini → commit → DB checks
```

`e2e:voice` speaks both rounds of the brief's demo script in real time and asserts the saved result (arrival 10:00, one cable line of 15 m, priority high, tags `[warranty]`, stale commit → 409). The **Demo script** setting in the app streams the same recordings instead of the microphone, handy when a room is noisy or there's no mic (web).

## Tradeoffs

- **Streaming strategy:** PCM over one WebSocket into Deepgram's live API; the model runs on *final* transcript segments with a 300 ms debounce and single flight (speech during a run triggers one more run). Interim text is shown but not sent to the model: cheaper and avoids proposals flickering on half words. Typical refresh: 1–2 s after a sentence ends.
- **Model:** Gemini 3.1 Flash Lite at minimal thinking, temperature 0, JSON schema output. Fast enough for the 1–2 s target and passes the full demo replay. Its latency has a long tail, so slow calls are hedged with a second call on a fallback model (separate free-tier quota). The free tier allows 15 requests/min per model; the engine budgets per model and retries instead of failing.
- **Neon Auth with a native app:** Managed Better Auth only supports cookie sessions for web frameworks today. The API signs in server-side, keeps the session cookie as an opaque refresh token and hands the app a 15-minute JWT, verified against Neon's JWKS on every request and on the WebSocket handshake (`?token=`).
- **Neon Functions:** the API, WebSockets included, runs next to the database on the Free plan. Session state lives in memory per connection; an eviction drops the socket, the app keeps its unsaved proposals and offers Retry.
- **Form schema** is hardcoded (brief: no form builder). Scalar fields are rows in `job_values` (jsonb), repeating rows in `job_lines`; priority/tags live on `jobs`.

## Known limitations

- Verified on the iOS 27 Simulator with the real (Mac) microphone; not yet on a physical iPhone.
- iOS 27 requires the UIScene life cycle; Expo SDK 57's template doesn't adopt it yet, so `apps/mobile/plugins/withSceneLifecycle.js` wires up Expo's `ExpoAppSceneDelegate`.
- Unsaved proposals live in memory: killing the app loses them.
- One technician, no tenancy; every signed-in user sees every job.
- Travel time on the Today screen is the gap between jobs, not a real route ETA; the map tile ETA is static.
- Dutch speech isn't wired yet (Deepgram `language=en`).

## With another day

- Persist the draft locally (MMKV) and resume a session after an eviction.
- Server-side session timeline (transcript + every proposal set) for debugging and an eval set; run `replay` in CI.
- Paid Gemini tier and streaming JSON output, to show proposals while the model is still writing.
- Dutch + English speech, unit and number normalization tuned for the field.
