# HR TA Onboarding Input Portal

Internal web app for HR Talent Acquisition to enter new-hire information (fast Excel copy/paste), manage onboarding **Create / Update / Cancelled** requests, and send onboarding emails from the system mailbox `hr.support@masterisegroup.com` — immediately (Urgent) or on a schedule (Normal).

**Stack:** Next.js 14 (App Router) · TypeScript · TailwindCSS · TanStack Table · Prisma (SQLite dev / PostgreSQL prod) · NextAuth (Microsoft Entra ID) · Microsoft Graph sendMail · node-cron.

---

## 1. Features

- **Microsoft SSO only** — every page redirects to `/login` until signed in; email-domain allow-list.
- **RBAC** — `ADMIN` (config + everything), `TA` (create/update/cancel, own or all records per config), `VIEWER` (read/export only).
- **Entry pages** (`/create`, `/update`, `/cancelled`) — spreadsheet-like grid:
  - Paste many rows from Excel (tabs/newlines auto-split, header row auto-detected, Vietnamese preserved).
  - Dates accepted as `dd/MM/yyyy`, `d/M/yyyy`, `dd-MMM-yyyy`, `yyyy-MM-dd` — stored **date-only**, never shifted by timezone.
  - Cell-level validation with red highlighting; phone numbers stay text.
  - **Cc auto-fills from Line Manager email** but stays editable (`;` or `,` separated).
  - **Priority** — `Normal` → queued for scheduled send; `Urgent` → sent immediately (confirmation modal).
  - Buttons: Add row · Delete selected · Validate · Preview Email · Save Draft · Submit to Queue · Send Urgent Now.
- **Dashboard** (`/dashboard`) — summary cards, quick filters (All/Pending/Scheduled/Sent/Failed/Urgent/Create/Update/Cancelled), global search, column filters, sort, hide/unhide columns, CSV/XLSX export (UTF-8 BOM), multi-select + bulk edit / bulk submit / send now / retry failed, email preview, per-record audit log, DOB & phone masking toggle.
- **Config** (`/config`, admin only) — Email Settings, Schedule Settings (send times, timezone, working days), Templates (Create/Update/Cancelled with `{{Placeholders}}` + sample preview), Columns (rename/hide/reorder/required), Roles.
- **Scheduler** — in-process node-cron (every minute) sends due `SCHEDULED` requests, grouping rows of the same type + starting date + office location into one email. Manual flush: `POST /api/scheduler/run-once` or the button in Config → Schedule.
- **Audit** — `createdByEmail`, `updatedByEmail`, `submittedByEmail`, timestamps, full action log and email send log per record. No passwords stored, no secrets hardcoded.

---

## 2. Quick start (local, no Azure needed)

Requires **Node.js 18+** (20/22 recommended).

```bash
# 1. Install
npm install

# 2. Configure env
copy .env.example .env      # Windows  (cp on macOS/Linux)
```

Edit `.env` minimally for a local trial:

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="any-long-random-string-here"
NEXTAUTH_URL="http://localhost:3000"
AUTH_DEV_MODE="true"                # dev sign-in form, no Azure required
NEXT_PUBLIC_AUTH_DEV_MODE="true"
ALLOWED_EMAIL_DOMAINS=""            # empty = allow any email in dev
ADMIN_EMAILS="you@yourcompany.com"  # this email becomes ADMIN
EMAIL_MODE="log"                    # emails are printed to console, not sent
```

```bash
# 3. Create the database & seed default config
npm run db:push
npm run db:seed

# 4. Run
npm run dev
```

Open http://localhost:3000 → you are redirected to `/login` → use **Dev sign in** with the email you put in `ADMIN_EMAILS`. Submitted **Urgent** requests are "sent" to the server console (`EMAIL_MODE=log`).

Run the unit tests (date parsing / Excel paste):

```bash
npm test
```

---

## 3. Azure App Registration (production SSO + Graph sendMail)

### 3.1 Create the app registration

1. Go to **Azure Portal → Microsoft Entra ID → App registrations → New registration**.
2. Name: `HR TA Onboarding Portal`.
3. Supported account types: **Accounts in this organizational directory only**.
4. Redirect URI: platform **Web**, value:
   - Dev: `http://localhost:3000/api/auth/callback/azure-ad`
   - Prod: `https://YOUR_DOMAIN/api/auth/callback/azure-ad`
5. After creation, note **Application (client) ID** and **Directory (tenant) ID**.

### 3.2 Client secret

1. **Certificates & secrets → New client secret**, choose an expiry, copy the **Value** immediately.
2. Put it in `.env` as `AZURE_AD_CLIENT_SECRET`. Never commit it.

### 3.3 Sign-in (delegated) permissions

`openid`, `profile`, `email`, `User.Read` (Microsoft Graph, delegated) — usually present by default. Grant admin consent if your tenant requires it.

### 3.4 Mail.Send (application permission) for the system mailbox

1. **API permissions → Add a permission → Microsoft Graph → Application permissions → Mail.Send** → Add.
2. Click **Grant admin consent for <tenant>** (requires a Global/Privileged admin).
3. **Strongly recommended:** restrict the app to only the HR mailbox with an
   [application access policy](https://learn.microsoft.com/en-us/graph/auth-limit-mailbox-access) (Exchange Online PowerShell):

   ```powershell
   New-ApplicationAccessPolicy -AppId <AZURE_AD_CLIENT_ID> `
     -PolicyScopeGroupId hr.support@masterisegroup.com `
     -AccessRight RestrictAccess `
     -Description "HR Onboarding Portal - only hr.support mailbox"
   ```

4. `.env`:

   ```env
   EMAIL_MODE="graph"
   GRAPH_TENANT_ID="<tenant id>"        # can reuse AZURE_AD_TENANT_ID
   GRAPH_CLIENT_ID="<client id>"        # can reuse AZURE_AD_CLIENT_ID
   GRAPH_CLIENT_SECRET="<secret>"
   GRAPH_SENDER_MAILBOX="hr.support@masterisegroup.com"
   ```

### 3.4b Alternative: Delegated Mail.Send + ROPC (when Application permission can't be granted)

Some tenants only allow **Delegated** `Mail.Send` (no Global Admin willing/able to grant the **Application**
permission from §3.4). In that case the app can authenticate as the mailbox itself using its own
username/password — the **Resource Owner Password Credentials (ROPC)** flow — instead of the
client-credentials flow.

**Trade-offs vs. §3.4 (read before using this in production):**
- The mailbox's real password lives in `.env` as a plaintext credential — a leak here is more sensitive
  than a leaked client secret because the password may be reused elsewhere. Rotate it periodically and
  restrict its use with a Conditional Access **Named Location** scoped to your server's IP if possible.
- **Fails outright if the mailbox account has MFA enabled or is subject to a Conditional Access policy**
  that blocks legacy/password auth (`AADSTS50076`/`50079`/`50158`). The account must be excluded from
  those policies — coordinate with your security team.
- Microsoft's own docs mark ROPC as a legacy flow they discourage for new integrations; prefer §3.4
  (Application permission) whenever a Global Admin is available to grant consent.

Setup:

1. Confirm `Mail.Send` is already granted under **API permissions → Delegated permissions** (no admin
   consent needed if your tenant allows user self-consent for non-admin-restricted scopes).
2. `.env`:

   ```env
   EMAIL_MODE="ropc"
   GRAPH_TENANT_ID="<tenant id>"
   GRAPH_CLIENT_ID="<client id>"
   GRAPH_CLIENT_SECRET="<secret>"          # optional for ROPC, but keep it if the app is confidential
   GRAPH_SENDER_MAILBOX="hr.support@masterisegroup.com"
   GRAPH_SENDER_PASSWORD="<mailbox password>"
   ```

3. Submit an Urgent request and check the server log — a successful send returns Graph status 202. A
   failure due to MFA/Conditional Access will show a clear error naming the exact AADSTS code; ask your
   tenant admin to exclude the mailbox account from that policy, or fall back to §3.4.

### 3.5 Full production `.env`

`DATABASE_URL` follows Prisma's standard PostgreSQL connection string format — your own DB user, password,
host, port, and database name (see §4 above and the [Prisma docs](https://www.prisma.io/docs/orm/reference/connection-urls)).

```env
DATABASE_URL="<your PostgreSQL connection string>"
NEXTAUTH_SECRET="any-long-random-string-here"
NEXTAUTH_URL="https://onboarding.yourcompany.com"
AZURE_AD_CLIENT_ID="..."
AZURE_AD_CLIENT_SECRET="..."
AZURE_AD_TENANT_ID="..."
ALLOWED_EMAIL_DOMAINS="masterisegroup.com,masterisehomes.com"
ADMIN_EMAILS="hr.admin@masterisegroup.com"
AUTH_DEV_MODE="false"
NEXT_PUBLIC_AUTH_DEV_MODE="false"
EMAIL_MODE="graph"
GRAPH_TENANT_ID="..."
GRAPH_CLIENT_ID="..."
GRAPH_CLIENT_SECRET="..."
GRAPH_SENDER_MAILBOX="hr.support@masterisegroup.com"
SCHEDULER_ENABLED="true"
```

---

## 4. Database

### SQLite (default, dev)

```bash
npm run db:push     # create/update dev.db from prisma/schema.prisma
npm run db:seed     # default config + ADMIN_EMAILS users
```

### Switch to PostgreSQL (prod)

1. In `prisma/schema.prisma` change `provider = "sqlite"` → `provider = "postgresql"`.
2. Set `DATABASE_URL` to your PostgreSQL connection string.
3. Run migrations:

   ```bash
   npm run db:migrate   # prisma migrate dev  (dev)
   npx prisma migrate deploy          # prod
   npm run db:seed
   ```

No schema changes are needed — enums are strings and JSON is stored as text specifically so both providers work.

### Tables

`users`, `onboarding_requests`, `app_config`, `email_send_logs`, `audit_logs` — see [prisma/schema.prisma](prisma/schema.prisma).

---

## 5. Running

```bash
npm run dev     # development, http://localhost:3000
npm run build   # production build
npm start       # production server (starts the cron scheduler too)
npm test        # vitest unit tests (date + Excel paste helpers)
```

The scheduler runs **inside the Next.js server process** (see `src/instrumentation.ts`). If you deploy to a serverless platform where no process stays alive, disable it (`SCHEDULER_ENABLED=false`) and call `POST /api/scheduler/run-once` from an external cron (with an admin session) instead.

### 5b. Running with Docker

Requires Docker with Compose v2 (`docker compose`, not the older `docker-compose`).

```bash
cp .env.example .env   # fill in the values as in §2/§3
docker compose up --build
```

This builds two images from the same multi-stage [Dockerfile](Dockerfile):
- **`migrate`** — a one-off container (uses the `builder` stage, which still has the Prisma CLI and `tsx`) that runs `prisma db push` + the seed script against the SQLite file on a named volume, then exits. Safe to run on every `up` — both steps are idempotent.
- **`app`** — the slim `runner` stage (Next.js standalone output), starts only after `migrate` finishes successfully, serves on `http://localhost:3001`.

The SQLite file lives on the `db-data` named volume (mounted at `/app/data`, with `DATABASE_URL` overridden to match — see [docker-compose.yml](docker-compose.yml)), so data survives `docker compose down` / rebuilds. To wipe it and start fresh:

```bash
docker compose down -v   # -v also removes the db-data volume
```

Useful commands:

```bash
docker compose logs -f app      # tail app logs
docker compose exec app sh      # shell into the running app container
docker compose down             # stop (keeps the volume)
```

For PostgreSQL in Docker instead of SQLite, add a `postgres` service to `docker-compose.yml` and point `DATABASE_URL` at it (see §4 for the schema.prisma provider change).

---

## 6. Email sending logic

- **Submit (Normal)** → status `SCHEDULED` with `scheduledSendAt` = next configured slot (e.g. 08:30 / 11:30 / 15:30 Asia/Ho_Chi_Minh; weekends skipped when "working days only"). If today's slots have passed, it queues for the next day's first slot. If scheduling is disabled → `PENDING`.
- **Submit (Urgent)** → sent immediately via Graph from the system mailbox (config can disable urgent send).
- **Scheduler** (every minute) → picks due `SCHEDULED` rows, groups by *type + starting date + office location* so one email carries many rows, sends, marks each row `SENT`/`FAILED` and writes `email_send_logs`.
- **To** = Config → Email Settings → Default To. **Cc** = union of each row's Cc (unique, case-insensitive).
- **No duplicates** — every request has an idempotency key; `SENT` rows are refused unless the user explicitly confirms **Resend**. Failed rows can be retried from the dashboard.

## 7. Date-safety rules (DOB / Starting Date)

- Stored as **date-only strings** (`yyyy-MM-dd`) — never `Date`/UTC datetimes, so no ±1-day shift.
- Parsed by `parseDateOnly()` (`src/lib/dates.ts`) accepting `dd/MM/yyyy`, `d/M/yyyy`, `dd-MM-yyyy`, `dd-MMM-yyyy`, `yyyy-MM-dd`, `dd.MM.yyyy`, Excel serials.
- Displayed by `formatDateOnly()` as `dd/MM/yyyy` (pure string ops).
- Covered by unit tests in `tests/dates.test.ts`.

## 8. Security notes

- No passwords stored; sessions are NextAuth JWTs from Microsoft SSO.
- No secrets in code — everything via `.env` (`.env` is git-ignored).
- Email-domain allow-list (`ALLOWED_EMAIL_DOMAINS`) enforced at sign-in.
- All API routes check session + role server-side (middleware only guards pages).
- DOB / phone masked in the dashboard by default (toggle to reveal).
- Full audit trail: who created/updated/submitted, when, what changed, every send attempt with error details.
- `AUTH_DEV_MODE` must be `false` in production.

## 9. API overview

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/auth/session` | — | NextAuth session |
| GET | `/api/dashboard/summary` | any | Card counters |
| GET | `/api/requests` | any (TA scope per config) | List/filter requests |
| POST | `/api/requests/bulk` | TA/Admin | Create rows (`mode: draft\|submit\|urgent`) |
| PATCH | `/api/requests/bulk` | TA/Admin | Bulk edit selected rows |
| POST | `/api/requests/submit` | TA/Admin | Submit drafts to queue |
| POST | `/api/requests/send-urgent` | TA/Admin | Send now (`resend: true` to force) |
| POST | `/api/requests/retry` | TA/Admin | Retry FAILED rows |
| GET | `/api/requests/:id/audit` | any | Audit + send logs |
| GET / PUT | `/api/config` | any / Admin | Read / update config |
| POST | `/api/email/preview` | any | Render template preview |
| POST | `/api/scheduler/run-once` | Admin | Flush due queue now |

## 10. Project structure

```
prisma/schema.prisma        # DB schema (SQLite/PostgreSQL portable)
prisma/seed.ts              # default config + admin bootstrap
src/middleware.ts           # SSO page guard
src/instrumentation.ts      # starts node-cron with the server
src/lib/
  auth/    options.ts rbac.ts guard.ts
  db/      prisma.ts
  email/   templates.ts graph.ts send.ts
  scheduler/ index.ts       # slot computation + cron
  validation/ request.ts
  columns.ts dates.ts parseExcel.ts requests.ts config.ts audit.ts utils.ts
src/app/
  login/ dashboard/ create/ update/ cancelled/ config/
  api/ ...                  # route handlers (see table above)
src/components/             # AppShell, EntryGrid, DashboardView, modals, toast
tests/                      # vitest: dates + Excel paste
```
