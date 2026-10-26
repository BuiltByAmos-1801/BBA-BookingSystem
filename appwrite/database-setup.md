# Appwrite TablesDB setup

This project uses **TablesDB (databases, tables, rows, columns, and indexes)** throughout. Do not configure it with legacy Collections/Documents.

## 1. Create or choose the database and bookings table

In Appwrite Console, open **Databases** and select the database used by this booking project. Create a Table named `bookings` if one does not already exist. Do not use the old collection ID as a Table ID; the existing `.env.example` contains no confirmed Table ID.

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

## 3. Permissions and API key

- Leave Table-level permissions empty. Do not grant anonymous or guest read/write access.
- Rows are created with an empty permissions array.
- Create a server API key with the least-privilege TablesDB database/table read and row create/write scopes supported by your Appwrite Console.
- Put the key only in Appwrite Function environment variables as `APPWRITE_API_KEY`. Never put it in a `VITE_` variable or in Vercel's frontend build variables.

The Functions use the server Node SDK and an API key; browser callers access only the public Function executions and never query the Table directly.

## 4. Function environment variables

Set these variables in both Appwrite Functions:

```text
APPWRITE_ENDPOINT=https://<REGION>.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=<project-id>
APPWRITE_API_KEY=<server-only-key>
APPWRITE_DATABASE_ID=<database-id>
APPWRITE_BOOKINGS_TABLE_ID=<table-id>
ALLOWED_ORIGINS=http://localhost:5173,https://<your-preview>.vercel.app
```

For optional CAPTCHA, configure **both** variables in `create-booking` and the matching site key in frontend/Vercel environment:

```text
TURNSTILE_SITE_KEY=<cloudflare-turnstile-public-site-key>
TURNSTILE_SECRET_KEY=<cloudflare-turnstile-secret>
```

Set `TURNSTILE_ENABLED=true` in `create-booking` when configuring those keys. If Turnstile is not configured, set `TURNSTILE_ENABLED=false`, omit both key variables, and leave `VITE_TURNSTILE_SITE_KEY` blank. The server then accepts submissions without CAPTCHA. A missing flag or mismatched key/flag setup causes submissions to fail closed. Add the local and deployed hostnames to the Turnstile widget configuration.

Set the Functions to Node.js 22, `src/main.js` entrypoint, `npm install` build command, and **Execute access: Any** because the booking page has no login. Also add the exact frontend origins to Appwrite **Platforms → Web** and to each Function's `ALLOWED_ORIGINS`.

## 5. IDs and local environment

The existing `.env.example` has configured endpoint, project, and Function IDs from this workspace, and now leaves `VITE_APPWRITE_BOOKINGS_TABLE_ID` blank because a Table ID was not found. Verify those IDs in Appwrite Console before using them; do not infer a Table ID from the former collection ID. The browser-side database and Table values are reference-only; set the matching `APPWRITE_DATABASE_ID` and `APPWRITE_BOOKINGS_TABLE_ID` in Function variables.

## 6. Deployment and testing

There is no Appwrite CLI project configuration or deployment metadata in this workspace, so Functions must be created/selected in the Appwrite Console. Install/sign in to the CLI and link the existing project without creating or replacing it:

```powershell
npx.cmd --yes appwrite-cli@latest login
npx.cmd --yes appwrite-cli@latest init project --project-id '<APPWRITE_PROJECT_ID>' --project-name 'Built By Amos Booking'
```

After creating each Function in the Console and setting its variables, deploy from the booking project root:

```powershell
npx.cmd --yes appwrite-cli@latest functions create-deployment --function-id '<AVAILABLE_SLOTS_FUNCTION_ID>' --code '.\appwrite\functions\available-slots' --entrypoint 'src/main.js' --commands 'npm install' --activate
npx.cmd --yes appwrite-cli@latest functions create-deployment --function-id '<CREATE_BOOKING_FUNCTION_ID>' --code '.\appwrite\functions\create-booking' --entrypoint 'src/main.js' --commands 'npm install' --activate
```

Verify deployments are active, then invoke `available-slots` for a valid date and inspect its JSON response. Only after that test, submit one controlled booking for a known free slot; confirm the row exists and has the expected `status`, `startsAt`, `endsAt`, `slotKey`, and server-generated `reference`. Do not claim an end-to-end test passed without checking the deployed execution and stored row.
