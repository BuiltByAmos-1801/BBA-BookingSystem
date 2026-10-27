# Built By Amos booking

A standalone React + Vite consultation booking page with a private Appwrite-authenticated admin panel, backed by Appwrite Functions and **TablesDB (tables and rows)**. It does not read or modify the existing agency website. Customers invoke public availability and booking routes; admin actions share the availability Function and require a verified Appwrite user ID on the server allowlist.

## What is implemented

- Responsive booking UI with service selection, a navigable calendar, IST display, customer form, live availability, and a confirmation screen.
- `available-slots`: reads server-owned weekly hours, date exceptions, active bookings, and reservation locks.
- `create-booking`: validates against the same current schedule and exceptions, optionally verifies Turnstile, reserves unique 15-minute lock rows, then writes a private booking row.
- `admin-api` route: hosted by `available-slots` to fit the project's two-Function limit. It verifies the Appwrite user JWT against a server-only `ADMIN_USER_IDS` allowlist on every request, then handles schedule, exceptions, booking updates, rescheduling, and audit records.
- Admin actions and public reservations use a unique schedule guard plus unique interval locks. Appwrite TablesDB has no multi-row transaction; an interrupted lock acquisition can temporarily block a time until an admin removes the stale lock. It fails closed rather than allowing overlaps. Existing confirmed bookings must be backfilled into the lock table before enabling the updated Functions.
- Booking confirmation is rendered only from the successful database write response. No confirmation email is sent.

Google Calendar and email delivery are not configured.

## Requirements

- Windows 10/11, PowerShell, Node.js 22.12+ (Node 24 LTS also works with Vite 8), and npm.
- An Appwrite Cloud project using **Databases → Tables** (TablesDB).
- Cloudflare Turnstile is optional and currently disabled for local development. If enabled, configure the site key in the frontend and matching site/secret keys in the create-booking Function.
- A Vercel account for deployment.

## Windows setup

The finished Vite project is already in `D:\BBA@BookingSystem`. If you are reproducing the scaffold in a different empty folder, create a React + Vite app first, then place this project's source/configuration files in that folder:

```powershell
Set-Location 'D:\'
npm.cmd create vite@latest built-by-amos-booking -- --template react
Set-Location '.\built-by-amos-booking'
```

For this generated project, run the installation/configuration commands from its existing directory:

```powershell
Set-Location 'D:\BBA@BookingSystem'
node --version
npm.cmd --version
npm.cmd install
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
if (-not (Test-Path .env.local)) { throw '.env.local was not created.' }
notepad .env.local
```

The `.env.example` and existing `.env.local` contain the confirmed endpoint, project, database, Table, and Function IDs. The current `.env.local` Turnstile site key is blank, so CAPTCHA is disabled locally. The example preserves the public Turnstile site key; if you copy it while the remote Function still has `TURNSTILE_ENABLED=false`, clear `VITE_TURNSTILE_SITE_KEY` in `.env.local`. The copy command above creates `.env.local` only if absent and never overwrites it; if it exists, review its values before editing.

The browser invokes only Appwrite Functions; it does not query the database or Table directly. `VITE_APPWRITE_DATABASE_ID` and `VITE_APPWRITE_BOOKINGS_TABLE_ID` are public reference values. The database/Table IDs and local allowed origins are configured in the Functions. No Appwrite API key or Turnstile secret is stored in the browser.

Create the existing bookings Table and the additional private Tables using [appwrite/database-setup.md](./appwrite/database-setup.md). The Functions use Appwrite's per-execution key with least-privilege row scopes; no long-lived API key is needed. Turnstile keys are required only when CAPTCHA is enabled.

## Appwrite Functions

The project has a two-Function plan limit. The private `admin-api` route is multiplexed into `available-slots`; this Function remains callable by anyone for public availability, while every admin action verifies the Appwrite user JWT and server-side allowlist:

| Name | Runtime | Execute access | Entrypoint | Build command |
|---|---|---|---|---|
| `available-slots` + `admin-api` route | Node.js 26 | Any (admin actions require allowlisted user JWT) | `available-slots/src/main.js` | `npm install` |
| `create-booking` | Node.js 26 | Any | `create-booking/src/main.js` | `npm ci` |

Function environment variables are configured server-side in Appwrite, not in Vite:

| Variable | `available-slots` (including admin route) | `create-booking` |
|---|:---:|:---:|
| `APPWRITE_DATABASE_ID` | Yes | Yes |
| `APPWRITE_BOOKINGS_TABLE_ID` | Yes | Yes |
| `APPWRITE_SCHEDULE_TABLE_ID` | Yes | Yes |
| `APPWRITE_EXCEPTIONS_TABLE_ID` | Yes | Yes |
| `APPWRITE_SLOT_LOCKS_TABLE_ID` | Yes | Yes |
| `APPWRITE_BOOKING_AUDIT_TABLE_ID` | Yes | |
| `ADMIN_USER_IDS` | Yes | |
| `ALLOWED_ORIGINS` | Yes | Yes |
| `TURNSTILE_ENABLED` | | Required (`true` or `false`) |
| `TURNSTILE_SITE_KEY` | | Optional |
| `TURNSTILE_SECRET_KEY` | | Optional |

Appwrite provides the endpoint, project ID, short-lived `x-appwrite-key`, and authenticated user's JWT at Function runtime. Both Functions have `rows.read` and `rows.write` scopes. Public availability returns only slot data; the admin route requires the verified user ID to match the secret `ADMIN_USER_IDS` variable. `ALLOWED_ORIGINS` is a comma-separated exact-origin list; both local Vite origins are configured. Add any deployed website origin to each Function and the Appwrite project's **Platforms → Web** settings. `ADMIN_USER_IDS` is server-only and contains Appwrite user IDs, never email/password credentials.

The create-booking Function currently has `TURNSTILE_ENABLED=false`, with both Turnstile keys omitted. To enable CAPTCHA, set `TURNSTILE_ENABLED=true` and the matching public site and secret keys. Never place the secret in a `VITE_` variable.

### Deploy with the Appwrite CLI

Install and sign in once:

```powershell
npx.cmd --yes appwrite-cli@latest login
npx.cmd --yes appwrite-cli@latest init project --project-id '<APPWRITE_PROJECT_ID>' --project-name 'Built By Amos Booking'
```

`init project` may ask for the organization if it cannot infer one. Use your existing Appwrite project; do not create a replacement project or modify the official website's project. This workspace has already been linked; its IDs and Function scopes are in `appwrite.config.json`.

The two Function records already exist in the linked project. Push the configured availability/admin Function from the repository root:

```powershell
appwrite.cmd push function --function-id '6adfa2fc00132fa712b6' --activate=true --force
```

The CLI packages the shared schedule and admin code. Check the deployment reaches **Ready** and is active. A Ready state alone does not verify behavior: invoke availability and confirm the exact date/time response before attempting a controlled booking. The admin frontend Function ID is the same as `VITE_APPWRITE_AVAILABLE_SLOTS_FUNCTION_ID`.

The schedule, exceptions, locks, and audit Tables and the `available-slots` admin route have been deployed to the linked Appwrite project. The existing `create-booking` Function has not been updated in this task. Two confirmed bookings were present when the Tables were added; backfill their 15-minute lock rows before deploying the updated booking Function.

## Private admin panel

- Admin routes: `/admin/login` and `/admin`. They are intentionally absent from public navigation.
- Sign-in uses Appwrite email/password sessions. There is no admin sign-up page; create the user in Appwrite Console and allowlist its immutable user ID.
- The `admin-api` route in `available-slots` verifies `x-appwrite-user-jwt` using the Appwrite Account service and compares the verified user ID with its server-only `ADMIN_USER_IDS` variable. The browser never supplies or controls the authorization list. A client-side route check alone is not authorization.
- `available-slots` remains executable by **Any** for public availability, so its admin routes perform server-side authorization on every request.
- Keep all TablesDB permissions private. Do not add a `VITE_` server key, API key, or Turnstile secret.
- The additive TablesDB schema and Function variables are tracked in [appwrite/database-setup.md](./appwrite/database-setup.md) and `appwrite.config.json`.
- `VITE_APPWRITE_ADMIN_FUNCTION_ID` is set in `.env.example` and `.env.local` to the existing availability Function ID. Set the same value in Vercel's build environment and redeploy the frontend.
- Admin actions cover schedule configuration, exceptions, booking search, pending confirmation, cancellation with reason, completion, rescheduling against live availability, and audit events. Cancellation reasons and exception reasons are never returned by public Functions.

The availability/admin Function is deployed with its required Table variables. The create-booking deployment still needs its updated code and Table variables; do not deploy it until the existing confirmed bookings have been backfilled into the lock Table.

## Run and build locally

With the local Table, Functions, and environment configuration in place:

```powershell
npm.cmd run dev
```

Open the printed local URL (normally `http://localhost:5173`). For a production bundle:

```powershell
npm.cmd run build
npm.cmd run preview
```

The Vite build can be checked before Appwrite is configured. Admin login and protected operations require the configured server allowlist. Live schedule-aware slot reads are deployed. Turnstile and a real booking submission remain unverified.

## Vercel

From the project root, authenticate and create a new Vercel project. Choose a new project for this booking app; do not import or overwrite the existing agency website:

```powershell
npx.cmd --yes vercel@latest login
npx.cmd --yes vercel@latest
```

Add these variables in the new Vercel project's **Settings → Environment Variables** for Preview and Production:

- `VITE_APPWRITE_ENDPOINT`
- `VITE_APPWRITE_PROJECT_ID`
- `VITE_APPWRITE_AVAILABLE_SLOTS_FUNCTION_ID`
- `VITE_APPWRITE_CREATE_BOOKING_FUNCTION_ID`
- `VITE_APPWRITE_ADMIN_FUNCTION_ID` (same value as `VITE_APPWRITE_AVAILABLE_SLOTS_FUNCTION_ID`)
- `VITE_TURNSTILE_SITE_KEY`
- `VITE_AGENCY_WEBSITE_URL`
- `VITE_WHATSAPP_NUMBER`

Do not add `APPWRITE_API_KEY` or `TURNSTILE_SECRET_KEY` to Vercel: those belong only in Appwrite Function variables. Add the Vercel preview origin to `ALLOWED_ORIGINS`, Appwrite Web platforms, and the Turnstile allowed-hostname list before testing that preview. Update the origin lists again when Vercel assigns the production URL.

Turnstile is optional. If a site key is set in Vercel, configure `TURNSTILE_ENABLED=true` and the matching public `TURNSTILE_SITE_KEY` and secret `TURNSTILE_SECRET_KEY` in the `create-booking` Function before accepting real bookings. If disabled, set `TURNSTILE_ENABLED=false` in that Function and leave its site/secret keys and the Vercel site key blank.

Deploy preview and production:

```powershell
npx.cmd --yes vercel@latest
npx.cmd --yes vercel@latest --prod
```

Test the resulting Vercel URL end-to-end before entering it in Google Business Profile's Booking URL field. The project does not edit DNS or the existing website. A custom domain/subdomain can be attached to this separate Vercel project later.

## Test checklist

Verify the production build, Function syntax, and the local no-configuration behavior before deploying. Live Appwrite availability and booking checks require your Appwrite account and TablesDB to be configured; they have not been marked as passed by this project.

- [ ] Reserve a real available slot and check the saved private document.
- [ ] Missing name/email, invalid email, and invalid optional phone are rejected.
- [ ] Past date, Sunday, out-of-hours time, and less than two hours' notice are rejected by the Function.
- [ ] A previously confirmed slot is not returned by availability and cannot be reserved.
- [ ] Two simultaneous requests for the same slot produce one confirmation and one conflict.
- [ ] Database/API failure returns an error, not a confirmation.
- [ ] Disconnecting the network does not show a false confirmation.
- [ ] Check the mobile layout and keyboard-only form/calendar use.
- [ ] Verify all required Vercel and Function environment variables are present.
- [ ] Confirm anonymous direct Table reads and writes are denied.
- [ ] If Turnstile is enabled, confirm the Function rejects missing/invalid tokens and accepts a valid token. If disabled, confirm both keys are omitted and submission is allowed without the widget.
- [ ] Create a non-allowlisted Appwrite account and verify the admin Function returns 403 even when called directly; verify a request without a user JWT is rejected.
- [ ] Verify authorized admin schedule changes, exceptions, booking status transitions, cancellation reasons, rescheduling, and audit rows.
- [ ] Test overlapping bookings starting at different 15-minute increments; the unique reservation locks should allow at most one.

Do not mark an item passed until you have actually run it against your configured deployment.

## Security and privacy notes

- All booking and admin tables have no anonymous read or write permissions; the browser invokes Functions only.
- Appwrite's per-execution Function key and Turnstile secrets stay server-side; this implementation requires no permanent API key.
- Function responses contain the booking confirmation fields only, never customer details.
- Availability responses contain start times only, never customer records.
- Customer values are bounded, normalized, and validated by the Function before persistence.
- Configure matching Turnstile keys in Vite and the Function if CAPTCHA is enabled; otherwise explicitly disable it in the Function. Add only actual booking origins in Appwrite and Cloudflare.
- Function request/response bodies are not logged; logs report execution errors without intentionally including customer input.
- No rate-limit datastore is included. If Turnstile is disabled, the public Functions have no CAPTCHA/rate limiting; add a persistent rate limiter before a high-volume public launch.

## Troubleshooting

- **“Booking is not configured yet”**: check the required Vite variables in `.env.local`, then restart Vite.
- **No live times / availability service error**: confirm the Function is active, its Node runtime/build succeeded, the Table ID is correct, the indexes exist, and `ALLOWED_ORIGINS` plus Appwrite Web platforms include the current origin.
- **Booking cannot be confirmed / 503**: check the Function execution logs and verify the row scopes, IDs, `TURNSTILE_ENABLED`, matching CAPTCHA keys if enabled, and Function deployment state. No success is shown when the write fails.
- **Security verification failed**: verify the Vite site key and Function secret are a matching Turnstile pair, and that the current preview/production hostname is allowed by the Turnstile widget.
- **Every slot appears unavailable**: check the Function's date window and that the Appwrite server returns the expected `startsAt`, `endsAt`, and `status` values. Only rows with `status = confirmed` occupy a time.
- **Duplicate booking conflict**: expected if another request wins the unique `slotKey` index first. Refresh the date's availability and pick a different time.
- **Admin access not configured**: set `ADMIN_USER_IDS` on the `available-slots` Function to comma-separated Appwrite user IDs. Never set it in a `VITE_` variable.
- **Availability unavailable after updating the frontend**: the public Functions must be deployed with the shared schedule code and all new TablesDB IDs. Previously deployed versions do not support schedule settings or lock rows.
- **A time stays blocked after a failed execution**: a lock may have been left by a runtime interruption. Verify there is no active booking for that interval before an admin removes a stale row.
- **Build fails on Node version**: use Node 22.12 or newer, then run `npm.cmd install` and `npm.cmd run build`.

## External configuration still required

Existing Appwrite project/database/booking Table IDs and legacy booking columns/indexes are known. The admin Tables, cancellation-reason column, Function variables, allowlist, and availability/admin deployment are configured remotely. The create-booking Function has not been updated; production website origins, optional Cloudflare Turnstile keys/hostnames, Vercel deployment, and Google Business Profile Booking URL remain to be configured if needed.
