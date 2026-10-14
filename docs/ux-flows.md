# Formcast — UX flows (proposal)

Goal: while the technician talks, the screen always answers one question:
**"What will be saved if I stop now?"**

## Design principles

1. **The form is the canvas, not a chat.** Proposals render *in place* on the field/row they touch. No separate "AI output" panel to cross-reference.
2. **Three visual states, never mixed up**
   | State | Look |
   |---|---|
   | Committed (DB) | Normal row, solid border |
   | Proposed set / create | Amber fill, dashed border, `set` / `new` badge; committed value shown struck-through next to it when overwriting |
   | Proposed clear / delete | Red dashed border, value struck through, `remove` badge |
3. **Revisions mutate, not append.** "Make that 15" animates the existing amber chip from 12 → 15 (brief pulse). "Scrap that" fades the chip out. The user should *see* the correction land.
4. **One-thumb, glove-friendly.** Big bottom controls, nothing important in the top corners. Works with screen glance only — the user is looking at a boiler, not the phone.
5. **Finish is safe, Cancel is cheap.** Finish shows a count ("Save 3 changes"); Cancel with >0 proposals asks a one-tap confirm.

## Form schema (boiler maintenance)

Based on the Flemish maintenance certificate for central heating boilers. Firm, technician and distance travelled live on later screens and are out of this form.

**Job context header** (prefilled from the job): job id, job name, client name, priority (low/medium/high), tags (warranty, follow-up, parts-needed; urgency is expressed by priority only). Priority and tags stay voice-editable so the brief's demo script works ("Set priority to high", "Tag this as warranty…").

| Section | Field | Type |
|---|---|---|
| Appliance | brand, model, serialNumber | text |
| | yearBuilt | number |
| | ratedOutputKw | number |
| | fuel | single select: gas, oil, pellets, wood |
| Measurements | coPpm, co2Percent, flueGasTempC, efficiencyPercent | number |
| Materials used | *line group*: material (text), quantity (number), unit (pcs, m, l, kg) | lines |
| Conclusion | status | single select: OK, defects, unsafe (taken out of service) |
| | nextMaintenanceBefore | date |
| | remarks | free text |
| Job | arrivalTime, endTime (duration shown in section header) | time |
| | jobComplete | boolean |

**Prefill rule (implementation):** when the client/appliance has job history, the Appliance section is prefilled from the most recent visit (section header shows "From visit of <date>"). Prefilled values count as committed values: voice can still update them, which shows the normal *heard → filled* flow.

## Sign in and settings
- **Sign in:** email + password (single hardcoded demo user is fine), "Forgot password?". → microphone priming.
- **Microphone priming:** explains voice filling with a mini example before the OS permission prompt; "Allow microphone" / "Not now". → Today.
- **Profile and settings** (user icon top right on Today): profile (name, email, technician id), voice settings (speech language, auto-fill delay = 5 s, live transcript on/off, vibrate on fill), microphone status, app version, sign out.

## Revised model (supersedes Finish/Cancel below)

Speaking is just a way of filling the form. There are no Finish/Cancel buttons in the speaking dock; the "Finish" from the brief is a **Save button top right** in the header (with a count badge of unsaved changes).

| Stage | Look | Moves on when |
|---|---|---|
| **Heard** | Field temporarily highlighted: amber, dashed border, countdown ring (with ×) | 5 s without a new revision for this field |
| **Filled** | When the timer completes: green sweeps in left → right (~0.1 s, in sync with the check), solid green border, card pops (scale 1 → 1.07 → 0.98 → 1, ~0.4 s) like a stamp, check appears. Green holds 1 s, then background and border fade to transparent: normal row + check (unsaved) | Tap **Save** → one DB transaction, checks disappear |
| **Saved** | Normal row, check disappears; Save button shows "✓ Saved" | — |

- Any revision of the field ("make that 15") re-highlights it and restarts the ring.
- Tapping the ring rejects the proposal (optional, only touch interaction).
- Incomplete lines (missing required column) stay highlighted with `Needs unit`, no ring.
- Speaking dock: transcript, status, level meter and a single **stop** button. Stopping does not save or discard.
- Cancel from the brief = **Back** with unsaved changes → sheet "Leave without saving?" (Save and leave / Discard changes / Stay).
- While recording, Save stays quiet (white, secondary, no count); it only becomes the primary dark button when recording is stopped and there are unsaved changes.
- No separate undo toast: corrections happen by voice or by tapping the ring.

The Finish review sheet (option B below) is dropped.

## Screens

### 1. Today's jobs (overview)
- Header: "Today", date + job count, calendar button, week strip (Mon–Sun, dot = has jobs) — pattern from [Remote](https://mobbin.com/screens/b0d71abb-d98d-4155-a3ad-9598abee93ab) / [Runna](https://mobbin.com/screens/20751c4f-c638-4561-8220-00beafe536e7).
- Timeline list in schedule order: start time in a left gutter, card on the right ([Open](https://mobbin.com/screens/1e339d42-4e73-4aab-b876-429c65c0a3d7), [Structured](https://mobbin.com/screens/e914a470-e0f3-47da-baf8-3fe508898d7e)).
- Card mirrors the job context header: `JOB-id · start–end`, job name, client, priority + tags pills.
- Between cards: travel time / break rows (Tiimo-style gaps, [Tiimo](https://mobbin.com/screens/2e5e28b9-c537-46b3-89fe-5d46c59fe6a3)).
- States: done (muted, `Done` chip), up next (dark outline, `Up next` chip), upcoming (plain).
- Tap a card → job detail.

### 1b. Job detail (before start)
- Job context: `JOB-id · time slot`, job name, priority/tags, short description.
- Client card: name, address, access note ("boiler in the attic, ring side door"), **Navigate · ETA** (primary) + **Call** — patterns from [Jobber](https://mobbin.com/screens/1717a0a9-386f-4bfc-a4f6-3d9550db0778) and [Fresha "Getting there"](https://mobbin.com/screens/a5961d42-aa86-4eb1-a59d-cb43a662c483).
- History: past visits for this client/appliance (date, job, outcome), appliance on file in the section header.
- Sticky **Start job** CTA → job form.

### 2. Job form — idle
- Header: job title, customer, address.
- Sections: **Fields** (arrival, distance, priority, tags, job complete, remarks) and one section per **line group** (Materials).
- Empty values show `—`; empty line group shows an inviting empty state ("Say what you used, e.g. '12 meters of cable'").
- Primary sticky CTA at the bottom: **Start speaking** (mic).
- Manual editing: tap any field, line, priority or tag pill (when not recording) to open an edit sheet. Manual edits become pending changes like voice ones (shown with a check) and are saved with Save.

### 3. Job form — listening (the core screen)
Bottom area turns into a **live dock** (Granola-style sheet with a Fabric-style transcript card on top; see References):
- Partial transcript line (last ~1–2 sentences); older words grey, newest words dark (ABY Journal).
- Level meter / waveform so the user knows the mic hears them.
- Status: `Listening` → `Updating…` (model in flight) → back to `Listening`.
- Actions: **Cancel** (secondary) and **Finish · N changes** (primary).

Form above stays scrollable and:
- Header shows a running badge: `3 changes`.
- Auto-scrolls to the field/row that just changed (only if off-screen) — keeps the "live" feeling without jumping around.
- Proposed rows appear in place in the line group with a `new` badge; updated existing rows show `old → new`.
- Line rows missing required columns show a subtle `needs unit` hint instead of being silently dropped.

### 4. Finish
Two options — I propose **A** for the demo, **B** as a toggle/stretch:
- **A. Direct commit** — tap Finish → spinner on the button → toast `3 changes saved` → proposal layer clears, values turn normal. Fastest, matches the brief ("Finish → persist").
- **B. Review sheet** (Deel-style "Edits summary") — bottom sheet listing each op: new value highlighted, `Previous: —` underneath, trash icon to drop a single op; buttons "Save N changes" / "Keep talking". Strong trust pattern, costs one extra tap. Reuses the same proposal list component, so cheap to add once A works.

### 5. Cancel
- 0 proposals → stop immediately.
- \>0 proposals → action sheet "Discard 3 changes?" → Discard / Keep talking. DB untouched.

### 6. Committed → round 2
Form shows saved values, success toast, mic CTA ready again. Second recording session builds proposals on top of the new snapshot (priority + tags part of the demo script). Removing the `follow-up` tag shows the tags chip-set as `warranty` + struck-through `follow-up`.

## Edge / error states
| Case | UX |
|---|---|
| Mic permission denied | Inline card with explanation + "Open settings" button; Start button stays visible |
| No speech for ~8s | Dock hint: "Didn't catch anything — still listening" |
| Silence / empty session then Finish | Finish disabled-looking with "Nothing to save", tapping just closes |
| Socket / backend drop | Dock turns red: "Connection lost — your proposals are kept"; Retry. Proposals live client-side so nothing is lost |
| Model returns invalid op (unknown field, bad enum) | Ignore op, optionally show grey "Couldn't apply: …" chip in dock (debug-ish, good for demo) |
| Ambiguous ("make that 15" with 2 rows) | Model picks most recent mention; UI pulse makes the choice visible so user can correct by voice |

## Flow (happy path, demo script)

```
Job list → Job form (idle)
  → [Start speaking]
     Listening ──speech──▶ proposals update in place (loop every ~1–2s)
       ├─ [Cancel] → confirm if N>0 → Job form (unchanged)
       └─ [Finish] → (review sheet?) → commit → toast → Job form (committed)
  → [Start speaking] again for round 2 (priority, tags)
```

## References (Mobbin, iOS)

| Pattern | Reference | What we take from it |
|---|---|---|
| Live dock over content | [Granola – recording sheet](https://mobbin.com/screens/e96bd18e-eec7-49cf-87c3-ff38ab46a47e) | Bottom sheet with `Pause · 00:05 · level · End`; content stays visible above it. Our dock = `Cancel · level · Finish` |
| Transcript above a compact pill | [Fabric – voice note](https://mobbin.com/screens/325b348f-5710-41f7-a879-dd9e18c494b3) | Transcript card sits directly above a slim recording pill with timer + Stop |
| Newest words emphasised | [ABY Journal – recording](https://mobbin.com/screens/d818141b-7c83-40e2-b1ad-28e86e9cbc36) | Older transcript greyed, newest word dark → shows "it's hearing me *now*" |
| Proposal card with op badge | [Structured – AI task](https://mobbin.com/screens/2e36f6e3-a873-400a-a2ee-2a32c508290a) | Tinted card, small `CREATE` badge top-right, per-item Discard + "Accept all" → our `new` / `set` / `remove` badges, tap-to-discard (stretch) |
| Edits summary before commit | [Deel – edits summary](https://mobbin.com/screens/24e6701c-9308-4db6-81b8-fa1fc94c65f2) | "Edits summary (2)": new value highlighted, `Previous: Not specified` underneath, trash per edit, `Confirm & update` → exactly our review sheet (option B) |
| Old → new diff | [Acorns – confirm customization](https://mobbin.com/screens/fb0b77bd-7f78-4a4b-b268-b785e14a8044) | `55% → 54%` inline diff for updates of existing values |
| Job detail layout | [Jobber – task detail](https://mobbin.com/screens/96d24bf8-5eaa-44cb-b687-f7c353419b42) | Title + address header, sectioned body, one dominant bottom action |
| Line item rows | [Jobber – line item](https://mobbin.com/screens/63cb6d8e-3288-4a4a-8887-ca65d7906551) | Name on top, `1 × …` quantity line underneath → `Cable` / `15 m` |
| Undo after AI change | [Spark Mail – +AI undo toast](https://mobbin.com/screens/776c7236-d0fb-456c-9bea-b089ca3bdb5c) | Dark toast with `Undo` → "Undo last proposal" stretch goal |
