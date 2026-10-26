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
- Cloudflare Turnstile is optional. If enabled, configure the site key in the frontend and matching site/secret keys in the create-booking Function.
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

The existing `.env.example` preserves the project, endpoint, and Function IDs already present in the workspace. The Table ID is blank because no Table ID was present in the project. Fill that value from the Appwrite Console; do not use the old collection ID as a table ID. `.env.local` is not present in this workspace. The copy command above creates it only if absent and never overwrites it. If it already exists, edit it only after reviewing its current values.

The browser invokes only Appwrite Functions; it does not use the database or Table ID directly. `VITE_APPWRITE_DATABASE_ID` and `VITE_APPWRITE_BOOKINGS_TABLE_ID` are included as public reference values for setup, while the actual database/table IDs must also be configured as `APPWRITE_DATABASE_ID` and `APPWRITE_BOOKINGS_TABLE_ID` in both Functions. No Appwrite API key or Turnstile secret may be stored in a `VITE_` variable.

Create the Appwrite Table and indexes using [appwrite/database-setup.md](./appwrite/database-setup.md). Then create and deploy the two Functions using the instructions below. The booking Functions require Appwrite IDs, a least-privilege server API key, and allowed origins before they can serve real requests. Turnstile keys are required only when CAPTCHA is enabled.

## Appwrite Functions

In the Appwrite Console, create two Functions in the selected Appwrite project:

| Name | Runtime | Execute access | Entrypoint | Build command |
|---|---|---|---|---|
| `available-slots` | Node.js 22 | Any | `src/main.js` | `npm install` |
| `create-booking` | Node.js 22 | Any | `src/main.js` | `npm install` |

Set the Function environment variables in the Console, not in Vite:

| Variable | Both Functions | `create-booking` only |
|---|:---:|:---:|
| `APPWRITE_ENDPOINT` | Yes | |
| `APPWRITE_PROJECT_ID` | Yes | |
| `APPWRITE_API_KEY` | Yes | |
| `APPWRITE_DATABASE_ID` | Yes | |
| `APPWRITE_BOOKINGS_TABLE_ID` | Yes | |
| `ALLOWED_ORIGINS` | Yes | |
| `TURNSTILE_SITE_KEY` | | Optional |
| `TURNSTILE_SECRET_KEY` | | Optional |

`ALLOWED_ORIGINS` is a comma-separated exact-origin list, for example `http://localhost:5173,https://your-preview.vercel.app`. Add the final Vercel production origin after deployment. The Functions reject a mismatched `Origin`; also add local and deployed origins under the Appwrite project's **Platforms → Web** settings.

Create a server API key with only the TablesDB read and row write scopes required by these Functions. Store it only as `APPWRITE_API_KEY` in each Function's environment. Never expose it to Vite, Vercel's frontend build variables, or source control. Set both Turnstile keys in the create-booking Function if `VITE_TURNSTILE_SITE_KEY` is configured; omit both on the Function to leave CAPTCHA disabled. Supplying only one server-side key is a configuration error and booking requests fail closed.

### Deploy with the Appwrite CLI

Install and sign in once:

```powershell
npx.cmd --yes appwrite-cli@latest login
npx.cmd --yes appwrite-cli@latest init project --project-id '<APPWRITE_PROJECT_ID>' --project-name 'Built By Amos Booking'
```

`init project` may ask for the organization if it cannot infer one. Use your existing Appwrite project; do not create a replacement project or modify the official website's project.

Create the two Function records in the Console as shown above, then deploy each source folder from the project root:

```powershell
npx.cmd --yes appwrite-cli@latest functions create-deployment --function-id '<AVAILABLE_SLOTS_FUNCTION_ID>' --code '.\appwrite\functions\available-slots' --entrypoint 'src/main.js' --commands 'npm install' --activate
npx.cmd --yes appwrite-cli@latest functions create-deployment --function-id '<CREATE_BOOKING_FUNCTION_ID>' --code '.\appwrite\functions\create-booking' --entrypoint 'src/main.js' --commands 'npm install' --activate
```

The CLI packages the selected source directory; Appwrite installs `node-appwrite` in its Node runtime. Check each deployment reaches **Ready** and is active. After changing Function source, deploy again and activate the new deployment. A Ready state alone does not verify behavior: invoke the availability Function with a valid date and a booking test only after configuring a safe test slot and CAPTCHA (if enabled).

There is no `appwrite.config.json` or existing deployment metadata in this workspace, and no deployment was verified during project setup. Use the actual Function IDs from your Appwrite Console; the example's existing IDs are retained, but their deployed source and status still need Console/CLI verification.

## Run and build locally

After Appwrite project origin settings, collection, Functions, and environment variables are configured:

```powershell
npm.cmd run dev
```

Open the printed local URL (normally `http://localhost:5173`). For a production bundle:

```powershell
npm.cmd run build
npm.cmd run preview
```

The Vite build can be checked before Appwrite is configured, but live slot reads and confirmed bookings require the external Appwrite and Turnstile configuration.

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

Turnstile keys are optional as a pair. If a site key is set in Vercel, configure the matching public `TURNSTILE_SITE_KEY` and secret `TURNSTILE_SECRET_KEY` in the `create-booking` Function before accepting real bookings.

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
- [ ] Confirm anonymous direct collection reads and writes are denied.
- [ ] If Turnstile is enabled, confirm the Function rejects missing/invalid tokens and accepts a valid token. If disabled, confirm both keys are omitted and submission is allowed without the widget.

Do not mark an item passed until you have actually run it against your configured deployment.

## Security and privacy notes

- The collection has no anonymous read or write permissions; the browser only executes the public Functions.
- Function API keys and Turnstile secrets stay in Appwrite Function environment variables.
- Function responses contain the booking confirmation fields only, never customer details.
- Availability responses contain start times only, never customer records.
- Customer values are bounded, normalized, and validated by the Function before persistence.
- Turnstile must be configured before launch. Add only actual booking origins in Appwrite and Cloudflare.
- Function request/response bodies are not logged; logs report execution errors without intentionally including customer input.
- No rate-limit datastore is included; Turnstile is the public anti-bot control. For higher-volume use, add a persistent rate limiter and operational alerting.

## Troubleshooting

- **“Booking is not configured yet”**: check the required Vite variables in `.env.local`, then restart Vite.
- **No live times / availability service error**: confirm the Function is active, its Node runtime/build succeeded, the collection ID is correct, the indexes exist, and `ALLOWED_ORIGINS` plus Appwrite Web platforms include the current origin.
- **Booking cannot be confirmed / 503**: check the Function execution logs and verify API-key scopes, IDs, Turnstile secret, and Function deployment state. No success is shown when the write fails.
- **Security verification failed**: verify the Vite site key and Function secret are a matching Turnstile pair, and that the current preview/production hostname is allowed by the Turnstile widget.
- **Every slot appears unavailable**: check the Function's date window and that the Appwrite server returns the expected `startsAt`, `endsAt`, and `status` values. Only documents with `status = confirmed` occupy a time.
- **Duplicate booking conflict**: expected if another request wins the unique `slotKey` index first. Refresh the date's availability and pick a different time.
- **Build fails on Node version**: use Node 22.12 or newer, then run `npm.cmd install` and `npm.cmd run build`.

## External configuration still required

Appwrite project/database/Table IDs, Table columns and indexes, Function deployments and deployed source, Function secrets and API-key scopes, project and Function origins, optional Cloudflare Turnstile keys/hostnames, Vercel deployment, and Google Business Profile Booking URL are not marked configured. Values present in `.env.example` came from the existing workspace config; the Table ID remains blank and must be supplied from Appwrite Console.
"# BBA-BookingSystem" 
