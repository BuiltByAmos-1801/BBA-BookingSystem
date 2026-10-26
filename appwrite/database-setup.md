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

The `status_starts_at` index supports availability queries; the unique `slotKey` index is the database-level race guard. The Functions accept only fixed 30-minute starts (`:00` / `:30`) from 10:00 through 17:30 IST. Valid slots are disjoint; the server also checks persisted intervals before writing. Appwrite's unique index allows at most one concurrent write for a slot key; the losing request returns a conflict, not a confirmation.

## 3. Permissions and Function access

- Leave Table-level permissions empty. Do not grant anonymous or guest read/write access.
- Rows are created with an empty permissions array.
- The Functions use Appwrite's per-execution `x-appwrite-key`, not a long-lived API key. Set `rows.read` on `available-slots`, and `rows.read` plus `rows.write` on `create-booking`.

Set both Functions' Execute access to `Any`; browser callers access only the Functions and never query the Table directly.

## 4. Function environment variables

Set these variables in both Appwrite Functions:

```text
APPWRITE_DATABASE_ID=6adfa0090028209ef27e
APPWRITE_BOOKINGS_TABLE_ID=6adfa24c001e8454ed7e
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

Appwrite provides the Function endpoint, project ID, and temporary execution key at runtime; do not create or store a permanent API key for these Functions. Add each deployed website's exact origin to `ALLOWED_ORIGINS` and Appwrite **Platforms → Web**.

For optional CAPTCHA, set `TURNSTILE_ENABLED=false` and omit Turnstile keys to disable it. To enable it, configure **both** variables in `create-booking` and the matching site key in frontend/Vercel environment:

```text
TURNSTILE_SITE_KEY=<cloudflare-turnstile-public-site-key>
TURNSTILE_SECRET_KEY=<cloudflare-turnstile-secret>
```

Set `TURNSTILE_ENABLED=true` in `create-booking` when configuring those keys. If Turnstile is not configured, set `TURNSTILE_ENABLED=false`, omit both key variables, and leave `VITE_TURNSTILE_SITE_KEY` blank. The server then accepts submissions without CAPTCHA. A missing flag or mismatched key/flag setup causes submissions to fail closed. Add the local and deployed hostnames to the Turnstile widget configuration.

The existing Functions use Node.js 26, `src/main.js`, and `npm install`. Keep **Execute access: Any** because the booking page has no login, while retaining only the row scopes listed above.

## 5. IDs and local environment

The existing `.env.example` and `.env.local` contain the confirmed endpoint, project, database, Table, and Function IDs. Browser-side database/Table values are reference-only; the matching server Function variables are configured in Appwrite.

## 6. Deployment and testing

The linked project configuration is in `appwrite.config.json`. Install/sign in to the CLI and link the existing project only if using a different local machine:

```powershell
npx.cmd --yes appwrite-cli@latest login
npx.cmd --yes appwrite-cli@latest init project --project-id '<APPWRITE_PROJECT_ID>' --project-name 'Built By Amos Booking'
```

After confirming the Function IDs and configuration, deploy from the booking project root:

```powershell
npx.cmd --yes appwrite-cli@latest functions create-deployment --function-id '<AVAILABLE_SLOTS_FUNCTION_ID>' --code '.\appwrite\functions\available-slots' --entrypoint 'src/main.js' --commands 'npm install' --activate
npx.cmd --yes appwrite-cli@latest functions create-deployment --function-id '<CREATE_BOOKING_FUNCTION_ID>' --code '.\appwrite\functions\create-booking' --entrypoint 'src/main.js' --commands 'npm install' --activate
```

The Functions' Table IDs, local origins, row scopes, and disabled Turnstile setting are configured. Both Functions have been deployed and are active; the availability Function returned live slot data and the local page displayed it. No booking row has been created. Only after explicit approval, submit one controlled booking for a known free slot; confirm the row exists and has the expected server-generated fields.
