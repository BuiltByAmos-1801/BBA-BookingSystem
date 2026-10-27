# Appwrite TablesDB setup

This project uses **TablesDB (databases, tables, rows, columns, and indexes)** throughout. Do not configure it with legacy Collections/Documents.

## 1. Create or choose the database and bookings table

In Appwrite Console, open **Databases** and select the existing booking database (`6adfa0090028209ef27e`). Its `bookings` Table ID is `6adfa24c001e8454ed7e`. Do not use a legacy collection ID.

Add these columns (set the required flag only where marked):

| Key | Type | Size / allowed values | Required |
|---|---|---:|:---:|
| `customerName` | `varchar` | 120 | Yes |
| `customerEmail` | `varchar` | 254 | Yes |
| `customerPhone` | `varchar` | 32 | No |
| `businessName` | `varchar` | 120 | No |
| `projectBrief` | `text` | 2000 | No |
| `service` | `varchar` | 64 | Yes |
| `startsAt` | `datetime` | | Yes |
| `endsAt` | `datetime` | | Yes |
| `timezone` | `varchar` | 64 | Yes |
| `status` | `varchar` | 16 | Yes |
| `reference` | `varchar` | 32 | Yes |
| `slotKey` | `varchar` | 32 | Yes |
| `createdAt` | `datetime` | | Yes |
| `cancellationReason` | `varchar` | 500 | No |

The Functions validate service against `website-development`, `ecommerce-website`, `mobile-app-development`, and `custom-software-automation`. The server sets `status = confirmed` and `timezone = Asia/Kolkata`; it does not trust a client-provided reference or status.

## 2. Add indexes

In the Table's **Indexes** tab, create these indexes and wait for each to become available:

| Index key | Type | Columns (in order) |
|---|---|---|
| `unique_slot_key` | Unique | `slotKey` |
| `unique_booking_reference` | Unique | `reference` |
| `status_starts_at` | Key | `status`, `startsAt` |
| `starts_at` | Key | `startsAt` |
| `ends_at` | Key | `endsAt` |

The `status_starts_at` index supports availability queries. `unique_slot_key` prevents duplicate starts, but does not alone prevent overlapping start times. The additional slot-lock table below is the concurrency guard for overlapping appointments and buffers.

## 3. Permissions and Function access

- Leave Table-level permissions empty. Do not grant anonymous or guest read/write access.
- Rows are created with an empty permissions array.
- The Functions use Appwrite's per-execution `x-appwrite-key`, not a long-lived API key. Both `available-slots` and `create-booking` have `rows.read` and `rows.write`; admin actions hosted by `available-slots` also verify the JWT and server allowlist before accessing data.

Set the public availability and create-booking Functions' Execute access to `Any`. Availability responses contain no customer records. The project is limited to two Functions, so the protected `admin-api` route is hosted by `available-slots`; its admin actions verify the user JWT and server-side allowlist on every request.

## 4. Function environment variables

The existing Appwrite Functions already have `APPWRITE_DATABASE_ID`, `APPWRITE_BOOKINGS_TABLE_ID`, and `ALLOWED_ORIGINS`. The availability Function also has the admin Table IDs and `ADMIN_USER_IDS` configured. The create-booking Function needs its three schedule/exception/lock Table IDs before its updated deployment can be activated:

```text
APPWRITE_DATABASE_ID=6adfa0090028209ef27e
APPWRITE_BOOKINGS_TABLE_ID=6adfa24c001e8454ed7e
APPWRITE_SCHEDULE_TABLE_ID=6ae0b5fd00049abd6821
APPWRITE_EXCEPTIONS_TABLE_ID=6ae0b5fd000491fce3bb
APPWRITE_SLOT_LOCKS_TABLE_ID=6ae0b5fd00049819919a
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

The admin route also uses `APPWRITE_BOOKING_AUDIT_TABLE_ID=6ae0b5fd000483442624` and the secret `ADMIN_USER_IDS` variable on `available-slots`. Appwrite provides the Function endpoint, project ID, temporary execution key, and authenticated user's JWT at runtime; no permanent API key is required. Add each deployed website's exact origin to `ALLOWED_ORIGINS` and Appwrite **Platforms → Web**.

For optional CAPTCHA, set `TURNSTILE_ENABLED=false` and omit Turnstile keys to disable it. To enable it, configure **both** variables in `create-booking` and the matching site key in frontend/Vercel environment:

```text
TURNSTILE_SITE_KEY=<cloudflare-turnstile-public-site-key>
TURNSTILE_SECRET_KEY=<cloudflare-turnstile-secret>
```

Set `TURNSTILE_ENABLED=true` in `create-booking` when configuring those keys. If Turnstile is not configured, set `TURNSTILE_ENABLED=false`, omit both key variables, and leave `VITE_TURNSTILE_SITE_KEY` blank. The server then accepts submissions without CAPTCHA. A missing flag or mismatched key/flag setup causes submissions to fail closed. Add the local and deployed hostnames to the Turnstile widget configuration.

The existing Functions use Node.js 26. Deploy the shared source root `.\appwrite\functions` so the common schedule and admin modules are included. The admin module is imported by `available-slots/src/main.js`, not deployed as a separate Function. Admin calls use the same public Function ID as `VITE_APPWRITE_AVAILABLE_SLOTS_FUNCTION_ID`; the `ADMIN_USER_IDS` JWT allowlist is the authorization control.

## 5. IDs and local environment

The existing `.env.example` and `.env.local` contain the confirmed endpoint, project, database, Table, and Function IDs. Browser-side database/Table values are reference-only; the matching server Function variables are configured in Appwrite.

## 6. Deployment and testing

The linked project configuration is in `appwrite.config.json`. Install/sign in to the CLI and link the existing project only if using a different local machine:

```powershell
npx.cmd --yes appwrite-cli@latest login
npx.cmd --yes appwrite-cli@latest init project --project-id '<APPWRITE_PROJECT_ID>' --project-name 'Built By Amos Booking'
```

The linked project already has its two Function records. Push the availability/admin Function from the repository root; the shared package includes both modules:

```powershell
appwrite.cmd push function --function-id '6adfa2fc00132fa712b6' --activate=true --force
```

### Admin TablesDB additions

These additive Tables have been created in the existing database (`6adfa0090028209ef27e`) and are tracked in `appwrite.config.json`. Leave Table permissions empty and do not enable anonymous row access. Table IDs: weekly schedule `6ae0b5fd00049abd6821`, date exceptions `6ae0b5fd000491fce3bb`, slot locks `6ae0b5fd00049819919a`, and booking audit `6ae0b5fd000483442624`.

| Table purpose | Column key | Type and size | Required | Index |
|---|---|---|:---:|---|
| Weekly schedule | `scheduleJson` | `text` | Yes | |
| Date exceptions | `date` | `varchar(10)` | Yes | Unique `date` |
| Date exceptions | `type` | `varchar(16)` | Yes | |
| Date exceptions | `startTime` | `varchar(5)` | No | |
| Date exceptions | `endTime` | `varchar(5)` | No | |
| Date exceptions | `reason` | `text` | No | |
| Slot locks | `lockKey` | `varchar(32)` | Yes | Unique `lockKey` |
| Slot locks | `bookingId` | `varchar(64)` | Yes | Key `bookingId` |
| Booking audit | `bookingId` | `varchar(64)` | Yes | Key `bookingId` |
| Booking audit | `reference` | `varchar(32)` | Yes | |
| Booking audit | `action` | `varchar(32)` | Yes | |
| Booking audit | `fromStatus` | `varchar(16)` | Yes | |
| Booking audit | `toStatus` | `varchar(16)` | Yes | |
| Booking audit | `reason` | `text` | Yes | |
| Booking audit | `actorUserId` | `varchar(64)` | Yes | |
| Booking audit | `detailsJson` | `text` | Yes | |
| Booking audit | `createdAt` | `datetime` | Yes | Key `createdAt` |

Use the exact table roles above; Function source names the columns. The schedule row is created by the admin Function with row ID `weekly-settings`. The unique date exception index permits one exception per date; remove/replace that exception to change its hours. Reasons exist only in private TablesDB rows and authorized admin responses.

Before deploying the updated create-booking Function, backfill one unique slot-lock row for every 15-minute unit covered by every existing `pending` or `confirmed` booking and its configured buffer. The lock key format is `YYYY-MM-DDT` plus four-digit local minutes, such as `2026-10-28T0600`; `bookingId` must match that booking row ID. Two confirmed rows existed when the Tables were created; verify the current bookings and backfill them before deploying the updated booking Function.

### Admin identity and Function variables

1. Use an existing Appwrite user for administration; do not add a public admin sign-up page.
2. Set the user's immutable `$id` in the server-only `ADMIN_USER_IDS` variable on `available-slots`. The current project owner is allowlisted. Never place this value in a `VITE_` variable.
3. Keep `VITE_APPWRITE_ADMIN_FUNCTION_ID` equal to `VITE_APPWRITE_AVAILABLE_SLOTS_FUNCTION_ID`; the project plan does not allow creating a third Function.
4. The availability/admin Function's database, Table, audit, and allowlist variables are configured. Configure the schedule/exception/lock Table IDs on `create-booking` before its updated deployment. `create-booking` still requires explicit `TURNSTILE_ENABLED=true|false`; do not provide CAPTCHA secrets when disabled.
5. Add local app origins in Appwrite **Platforms → Web**. Add exact production origins only when authorized to launch.

The admin API verifies the invocation's forwarded user JWT against Appwrite `Account.get()` before every action, then compares the verified user ID with the server allowlist. It uses only Appwrite's per-execution `x-appwrite-key` for TablesDB access. Customer-facing Functions never return contact details or exception reasons.

TablesDB has no multi-row transaction. The unique lock table serializes all schedule-changing admin actions and public booking commits, and per-15-minute unique lock rows block overlaps across differing appointment start times. If a Function crashes mid-operation, orphan locks can deny availability until reviewed and removed. This is a safe-denial limitation, not a claim of transactional rollback. Never remove a lock until confirming no active booking owns its time.

### Deploy only after manually reviewing setup

The Tables, their indexes, cancellation-reason column, server-side variables, and availability/admin Function have been deployed. Do not deploy the updated create-booking Function until the two existing confirmed bookings have their lock rows backfilled:

```powershell
npx.cmd --yes appwrite-cli@latest functions create-deployment --function-id '<EXISTING_CREATE_BOOKING_FUNCTION_ID>' --code '.\appwrite\functions' --entrypoint 'create-booking/src/main.js' --commands 'npm ci' --activate
```

Confirm both public availability and an authorized admin read-only dashboard before accepting customer bookings. Separately test a non-allowlisted user and a missing JWT; both must be rejected. Do not create a real booking solely as a smoke test without approval.
