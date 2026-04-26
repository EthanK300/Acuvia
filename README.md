# Acuvia

Acuvia is a patient intake and nurse triage coordination platform designed for fast-moving care settings (such as urgent care events, pop-up clinics, and constrained hospital intake flows). It helps teams move from "first come, first served" toward clinically prioritized care while keeping patients informed.

At a high level, patients submit their condition details (and optional media), the backend uses AI to suggest severity and queue placement, and nurses retain final control over triage-impacting updates through approve/reject review actions.

## Why This Helps

### For patients

- Faster recognition of worsening conditions instead of waiting for manual re-triage.
- Clearer communication path for updates after initial check-in.
- Better transparency through wait-time feedback and nurse-call alerts.

### For nurses and triage staff

- A live prioritized queue that reflects severity and urgency rather than arrival order alone.
- A focused "pending updates" review lane so meaningful patient condition changes are surfaced quickly.
- Final clinical authority: AI proposes, nurse approves or rejects.

### For operations and care quality

- More consistent triage suggestions with structured AI output.
- Better traceability of updates, decisions, and media-linked evidence.
- Reduced manual overhead in identifying which updates should trigger reprioritization.

## Project Components

Acuvia is implemented as a monorepo with:

- `apps/backend`: Node.js + Express API, WebSocket patient alerts, Supabase Postgres + Storage, Gemini AI triage/ranking.
- `apps/nurse-ui`: React Native (Expo) nurse interface.
- `apps/patient-ui`: React + Vite patient web portal.

This repo is an npm workspace monorepo managed from the root.

## Monorepo Layout

```txt
.
├── apps/
│   ├── backend/
│   ├── nurse-ui/
│   └── patient-ui/
├── package.json
└── README.md
```

## Prerequisites

- Node.js 20+ (Node 22 is in use in current dev logs)
- npm
- Supabase project with:
  - Postgres access (direct connection string)
  - Storage bucket named `patient-data`
- Gemini API key

## Environment

Backend env file: `apps/backend/.env`

Required keys:

- `PORT` (default `4000`)
- `SUPABASE_DB_URL` (direct Postgres connection string)
- `SUPABASE_SERVICE_ROLE_KEY` (used for Storage)
- `GEMINI_KEY`
- `PATIENT_UI_BASE_URL` (used for QR target base URL)

Notes:

- Backend infers `SUPABASE_URL` from DB URL/service key if not explicitly provided.
- QR endpoints auto-resolve LAN host when `PATIENT_UI_BASE_URL` is localhost.

## Install

From repo root only:

```bash
npm install
```

Dependencies are managed via workspaces under `apps/*`.

## Run

From repo root:

```bash
npm run dev:backend
npm run dev:nurse
npm run dev:patient
```

Useful variants:

```bash
npm run dev:patient-network
npm run build:patient
npm run check:structure
```

## Database Schema (Current)

Migration file: `apps/backend/src/db/migrations/001_initial_schema.sql`

### `patients`

- `uuid` (PK)
- `number_rank` (integer, rank within category)
- `category` (integer, constrained `1..5`)
- `first_name`, `last_name`, `birthday`
- `description`
- `session_start`, `session_expires_at`
- `created_at`

ESI mapping:

- `1`: Immediate (Resuscitation)
- `2`: Emergent (High risk)
- `3`: Urgent
- `4`: Less urgent
- `5`: Non-urgent

### `patient_data`

- `id` (PK)
- `patient_uuid` (FK -> `patients.uuid`)
- `payload` (jsonb)
- `updated_at`

### Storage

- Bucket: `patient-data`
- Object key format: `<patient_uuid>/<timestamp_ms>.<ext>`

## Backend API Overview

Base routes:

- `/api/patients`
- `/api/nurses`
- `/api/ai`

### Patient Routes

- `GET /api/patients/session`
  - Checks active cookie session (`patient_session_uuid`).
- `POST /api/patients`
  - Validates intake fields.
  - AI classifies intake (`category`, summary `description`).
  - AI-assisted ranking picks initial rank.
  - Inserts `patients` + `patient_data`, uploads media, sets session cookie.
- `PATCH /api/patients/:patientUuid`
  - Requires valid patient cookie session.
  - Processes text/media update.
  - AI re-classifies + re-ranks proposal.
  - If no category/rank change: returns unchanged.
  - If changed: queues pending nurse review update (does not directly alter triage row).

### Nurse Routes

- `GET /api/nurses/queue`
  - Returns top 50 prioritized patients + stats.
- `GET /api/nurses/patient/:patientUuid/summary`
- `GET /api/nurses/patient/:patientUuid/history`
- `GET /api/nurses/pending-updates`
  - Pending AI proposals requiring nurse decision.
- `POST /api/nurses/update-webhook`
  - `decision: approve|reject`
  - Approve: persists update, applies proposed triage/rank, enqueues ranking event.
  - Reject: persists update with rejected review metadata, does not change triage/ranking.
- `POST /api/nurses/call`
  - Sends WebSocket alert to connected patient.
- `POST /api/nurses/clear`
  - Removes patient records and storage media for specified patient UUID.
- `GET /api/nurses/qr-code`
  - Returns QR as data URL JSON.
- `GET /api/nurses/qr-pdf`
  - Returns printable QR PDF.
- `POST /api/nurses/move`
  - Placeholder (`501`).

## Workflow Summary

1. Patient submits intake.
2. Backend AI classifies and ranks.
3. Patient is inserted into queue.
4. Patient later submits updates (text/media).
5. Backend AI proposes recategorization/rank change.
6. Only meaningful changes become pending nurse updates.
7. Nurse approves/rejects:
   - approve -> triage/rank updated
   - reject -> data stored, no triage/rank change

## Frontend Status Notes

- Nurse UI includes:
  - live queue polling
  - patient detail/history modal
  - pending update approval/rejection actions
  - in-app QR modal
  - update cards showing category and overall queue rank proposal change
- Patient UI includes:
  - intake and follow-up update flows
  - media attachment
  - estimated wait display on submit confirmation

## Troubleshooting

- If backend appears to hang on startup, it is usually waiting on DB connectivity in startup verification.
- Common issues are DNS/network reachability to Supabase Postgres host.
- Ensure `SUPABASE_DB_URL` is valid and reachable from your machine.

## Security Note

Do not commit secrets (especially `.env` values like service role key or API keys).
