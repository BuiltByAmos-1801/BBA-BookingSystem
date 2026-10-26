# Built By Amos booking

A standalone React + Vite consultation booking page backed by Appwrite Functions and **TablesDB (tables and rows)**. It does not read or modify the existing agency website. Booking records are private; browser code can only invoke the two public Functions.

## What is implemented

- Responsive booking UI with service selection, a navigable calendar, IST display, customer form, live availability, and a confirmation screen.
- `available-slots`: reads confirmed booking rows on the requested date and excludes past/too-soon slots.
- `create-booking`: validates the request, optionally verifies Cloudflare Turnstile (required when the site key is configured), checks interval overlap, then writes a private row.
- The unique `slotKey` index is the concurrency guard for simultaneous attempts. The API only accepts fixed, half-hour-aligned 30-minute slots, so distinct valid slots cannot partially overlap. An Appwrite unique-index conflict is returned as HTTP 409 and never as a confirmation.
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

Create the Appwrite Table and indexes using [appwrite/database-setup.md](./appwrite/database-setup.md). Then create and deploy the two Functions using the instructions below. The booking Functions use Appwrite's per-execution key with least-privilege `rows.read` / `rows.write` scopes; no long-lived API key is needed. Turnstile keys are required only when CAPTCHA is enabled.

## Appwrite Functions

In the Appwrite Console, create two Functions in the selected Appwrite project:

| Name | Runtime | Execute access | Entrypoint | Build command |
|---|---|---|---|---|
| `available-slots` | Node.js 26 | Any | `src/main.js` | `npm install` |
| `create-booking` | Node.js 26 | Any | `src/main.js` | `npm install` |

Set the Function environment variables in the Console, not in Vite:

| Variable | Both Functions | `create-booking` only |
|---|:---:|:---:|
| `APPWRITE_DATABASE_ID` | Yes | |
| `APPWRITE_BOOKINGS_TABLE_ID` | Yes | |
| `ALLOWED_ORIGINS` | Yes | |
| `TURNSTILE_ENABLED` | | Yes |
| `TURNSTILE_SITE_KEY` | | Optional |
| `TURNSTILE_SECRET_KEY` | | Optional |

Appwrite provides the endpoint, project ID, and short-lived `x-appwrite-key` at Function runtime. `available-slots` has `rows.read`; `create-booking` has `rows.read` and `rows.write`. `ALLOWED_ORIGINS` is a comma-separated exact-origin list; both local Vite origins are configured. Add any deployed website origin to each Function and the Appwrite project's **Platforms → Web** settings.

The create-booking Function currently has `TURNSTILE_ENABLED=false`, with both Turnstile keys omitted. To enable CAPTCHA, set `TURNSTILE_ENABLED=true` and the matching public site and secret keys. Never place the secret in a `VITE_` variable.

### Deploy with the Appwrite CLI

Install and sign in once:

```powershell
npx.cmd --yes appwrite-cli@latest login
npx.cmd --yes appwrite-cli@latest init project --project-id '<APPWRITE_PROJECT_ID>' --project-name 'Built By Amos Booking'
```

`init project` may ask for the organization if it cannot infer one. Use your existing Appwrite project; do not create a replacement project or modify the official website's project. This workspace has already been linked; its IDs and Function scopes are in `appwrite.config.json`.

Create the two Function records in the Console as shown above, then deploy each source folder from the project root:

```powershell
npx.cmd --yes appwrite-cli@latest functions create-deployment --function-id '<AVAILABLE_SLOTS_FUNCTION_ID>' --code '.\appwrite\functions\available-slots' --entrypoint 'src/main.js' --commands 'npm install' --activate
npx.cmd --yes appwrite-cli@latest functions create-deployment --function-id '<CREATE_BOOKING_FUNCTION_ID>' --code '.\appwrite\functions\create-booking' --entrypoint 'src/main.js' --commands 'npm install' --activate
```

The CLI packages the selected source directory; Appwrite installs `node-appwrite` in its Node runtime. Check each deployment reaches **Ready** and is active. A Ready state alone does not verify behavior: invoke the availability Function with a valid date and inspect the actual JSON response. Do not submit a booking unless a controlled test is explicitly approved.

Both booking Functions now have the TablesDB source deployed and active. A read-only availability request returned the expected date, IST timezone, and live slots, and the browser at `http://127.0.0.1:5173` displayed those slots. The database/Table, required columns and indexes, Function variables, execute access, row scopes, and local origins are configured. No booking was created.

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

The Vite build can be checked before Appwrite is configured. Live slot reads require the deployed Functions and local origins in Appwrite **Platforms → Web**. Turnstile and real booking submission remain disabled/unverified.

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

Do not mark an item passed until you have actually run it against your configured deployment.

## Security and privacy notes

- The Table has no anonymous read or write permissions; the browser only executes the public Functions.
- Function API keys and Turnstile secrets stay in Appwrite Function environment variables.
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
- **Build fails on Node version**: use Node 22.12 or newer, then run `npm.cmd install` and `npm.cmd run build`.

## External configuration still required

Appwrite project/database/Table IDs, Table columns and indexes, Function variables/scopes, local origins, active Function deployments, and live availability are verified. No booking row has been created. Production website origins, optional Cloudflare Turnstile keys/hostnames, Vercel deployment, and Google Business Profile Booking URL remain to be configured if needed.
