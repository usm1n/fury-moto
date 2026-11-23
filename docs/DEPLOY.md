# Deploying The Gear Doctor

This is the from-scratch guide: accounts, services, secrets, first deploy, first admin login, rollback, and running it on your own machine.

Read the status box first. Some of the deployment path has not been run yet.

> **Status (2026-11-24)**
>
> - **Verified in the repo (read in the code, not run):** environment variable names and their roles, the migration and seed behaviour, the rule that `JWT_SIGNING_KEY` is mandatory outside Development, the port and environment set in `Dockerfile.vercel`, and the service layout in `vercel.json`. `.github/workflows/ci.yml` passes YAML syntax checks.
> - **Not verified (needs doing):** the Vercel multi-service setup (container API + static web + static admin under one domain). This is a **Beta** feature and the spike in `docs/backend/PLAN.md` §4.2 has **not been run**. The static-service config keys are not documented on the pages we read.
> - **Not verified:** `ci.yml` has never run on GitHub. The EF migration bundle has never been run against Neon. The R2 CORS rule has not been tested in a browser.
> - **Dashboard details** (button names, plan limits, prices) are written from the planning research in `docs/backend/PLAN.md` and general knowledge of the consoles. Check each one in the dashboard before you rely on it.
> - **Not built yet:** the admin app (`admin/`). The `vercel.json` admin service points at a folder that does not exist yet, so a deploy will fail on that service until Phase 1 adds it.

---

## 0. What you will end up with

One Vercel project, one domain:

| URL | Served by |
|---|---|
| `https://<domain>/` and storefront pages | `web/` (static) |
| `https://<domain>/api/...` | `api/` (ASP.NET Core 10 container) |
| `https://<domain>/admin/...` | `admin/` (Angular, static) |
| `https://images.<domain>/...` | Cloudflare R2 (product images, not Vercel) |

Data lives in Neon (Postgres). Images live in Cloudflare R2. Bot protection on the order and contact forms is Cloudflare Turnstile.

Full design and reasoning: `docs/backend/PLAN.md`.

---

## 1. Prerequisites

- A GitHub account and this repository, pushed to GitHub. The repo is currently public; `PLAN.md` §6 recommends making it private before launch.
- Accounts: **Vercel**, **Neon**, **Cloudflare**. Cloudflare asks for a **payment card to enable R2, even on the free tier**.
- A **domain** you control (for `<domain>` and `images.<domain>`). Without one you can only use the `*.vercel.app` URL and the dev-only `r2.dev` URL for images.
- For local work: the **.NET 10 SDK**, and **PostgreSQL 17**. Docker is not required.
- Keep a password manager open. You will create several secrets, and some of them are shown only once.

Write down these placeholders as you go. You will use them in the steps below:

| Placeholder | Meaning |
|---|---|
| `<domain>` | your domain, e.g. `example.com` |
| `<neon-pooled-url>` | Neon pooled connection string |
| `<neon-direct-url>` | Neon direct connection string |

---

## 2. Create the Neon database

1. Sign up at Neon and create a **project**.
2. Choose the **region**:
   - **Vercel Hobby:** `aws-us-east-1` (N. Virginia). Hobby functions run in `iad1`, which is in the same area. Keeping the database there avoids a cross-region hop on every query.
   - **Vercel Pro:** pick the Neon region nearest to the Vercel function region `bom1` (Mumbai). `PLAN.md` names `aws-ap-southeast-1` (Singapore) as the example. Check Neon's region list for the closest option.
   - You cannot change the Vercel function region on Hobby, so this choice is effectively fixed for a Hobby launch.
3. Open **Connect** for the project and get **two** connection strings:
   - **Pooled connection** (tick the "Pooled connection" option). The host contains `-pooler`. This becomes `NEON_DATABASE_URL` and is used by the running app.
   - **Direct connection** (leave "Pooled connection" unticked). The host has no `-pooler`. This becomes `NEON_DIRECT_URL` and is used only for migrations and the seed.
4. Both strings should end in `?sslmode=require`. Keep them secret. They contain the password.

Notes:
- Neon scales to zero when idle, so the first request after a quiet period is slow. The app's retry settings already cover this.
- You do not need to create tables by hand. The migration job does it (step 8).

---

## 3. Set up Cloudflare R2 (product images)

1. In the Cloudflare dashboard, open **R2** and enable it. This is where the payment card is requested.
2. **Create a bucket**, for example `gear-doctor-media`. Keep the name lowercase, with no spaces.
3. **Create an API token** (R2 > Manage API tokens > Create API token):
   - Permission: **Object Read & Write**.
   - Scope: **Apply to specific buckets only**, and pick the bucket you just made. Do not use an account-wide token.
   - Save the **Access Key ID**, the **Secret Access Key** and the **Account ID** (the Account ID is also on the R2 overview page). The secret is shown only once.
4. **CORS rule on the bucket** (bucket > Settings > CORS policy). The admin's browser uploads images directly to R2 with presigned URLs, so R2 must accept the request from the site. Paste this JSON, replacing the origin with your real site origin (`https://<domain>`). Add a second origin if you also use a preview domain.

   ```json
   [
     {
       "AllowedOrigins": ["https://<domain>"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type", "Cache-Control"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   The `Content-Type` and `Cache-Control` headers must be listed because the presigned upload sends both. Do not use `*` for the origin in production.
5. **Custom domain for reads** (bucket > Settings > Custom domains): connect `images.<domain>`. The domain must be on Cloudflare DNS, which is the simplest setup. Set `R2_PUBLIC_BASE_URL=https://images.<domain>`.
6. The `pub-<hash>.r2.dev` public URL is **for development only**. Cloudflare rate-limits it and it is not meant for production traffic.

Free tier, as listed in `PLAN.md` at the time of writing: 10 GB of storage and no egress fees. Check the current operation quotas on the R2 pricing page.

---

## 4. Set up Cloudflare Turnstile (bot protection)

1. In the Cloudflare dashboard, open **Turnstile** and **Add widget**.
2. Add the hostnames it may run on: `<domain>`, and the `*.vercel.app` hostname of the project if you want preview deploys to work.
3. Copy two values:
   - **Site key** (public) becomes `TURNSTILE_SITE_KEY`.
   - **Secret key** (private) becomes `TURNSTILE_SECRET`.

**Important:** if `TURNSTILE_SECRET` is missing, the API quietly falls back to Cloudflare's public test secret, which accepts every token. That means no bot protection. Always set it in Vercel Production. It is in the table in step 7.

---

## 5. Create the Vercel project

1. In Vercel, choose **Add New > Project** and import the GitHub repository.
2. Vercel reads `/vercel.json`, which defines three services: `api` (container, root `api/`), `admin` (Angular, root `admin/`) and `web` (static, root `web/`). **Do not override build or root settings in the dashboard**; the file is the source of truth.
3. Before the first deploy, add the environment variables (step 7) for **Production**. Add preview values too if you want preview deploys.
4. Set `PORT=8080`. The container image already sets it, but keep it explicit in the project.
5. **Plan:**
   - **Hobby is for building and testing only.** Its terms say non-commercial, personal use. A store taking real orders must be on **Pro** (`PLAN.md` §6, about $20/month).
   - Hobby runs functions only in `iad1`. Pro can choose `bom1` (Mumbai), which is about 4x faster for API calls from Pakistan (`PLAN.md` §4.4).

---

## 6. Environment variables

Full list with comments: `.env.example` in the repo root. This table says where each one goes.

| Variable | Vercel Production | Vercel Preview | GitHub secret | Notes |
|---|---|---|---|---|
| `NEON_DATABASE_URL` | yes, pooled | yes, a Neon branch (optional) | no | Runtime connection |
| `NEON_DIRECT_URL` | **no** | no | yes | Migrations and seed only. The running app never reads it, so keep it out of Vercel. |
| `R2_ACCOUNT_ID` | yes | yes | no | |
| `R2_ACCESS_KEY_ID` | yes | yes | no | |
| `R2_SECRET_ACCESS_KEY` | yes | yes | no | |
| `R2_BUCKET` | yes | yes | no | |
| `R2_PUBLIC_BASE_URL` | yes, `https://images.<domain>` | yes | no | Dev bucket only for `r2.dev` |
| `JWT_SIGNING_KEY` | yes | yes | no | Generate a separate one per environment (below) |
| `TURNSTILE_SECRET` | yes | yes | no | Required, see step 4 |
| `TURNSTILE_SITE_KEY` | yes | yes | no | Public value |
| `ADMIN_EMAIL` | **no** | no | yes | Seed only |
| `ADMIN_INITIAL_PASSWORD` | **no** | no | yes | Seed only |
| `PORT` | `8080` | `8080` | no | |
| `ASPNETCORE_ENVIRONMENT` | `Production` | `Production` | no | Never `Development` on a public site |

Generate the JWT key on your own machine, once per environment:

```bash
openssl rand -base64 48
```

Use at least 32 bytes. Do not paste it into chat or commit it. Changing it logs every admin out, which is harmless but annoying.

The admin credentials are needed only by the seed job, so they stay out of Vercel.

---

## 7. GitHub secrets for the migrate job

The `migrate` job in `.github/workflows/ci.yml` needs three secrets:

1. In GitHub, open the repo, then **Settings > Environments > New environment**, name it **`production`**.
2. Under that environment, add these secrets:
   - `NEON_DIRECT_URL`: the direct Neon string from step 2.
   - `ADMIN_EMAIL`: the owner's email address.
   - `ADMIN_INITIAL_PASSWORD`: a strong password (at least 12 characters, with an uppercase letter, a lowercase letter and a digit). It is used once. The owner changes it on first login.
3. Optional but recommended: on the `production` environment, add yourself as a **required reviewer**, and restrict deployments to the `main` branch.

If `NEON_DIRECT_URL` is not set, the migrate job prints a notice and skips the steps. The rest of CI still runs.

The job runs only on pushes to `main`, and only after the `api` job passes.

---

## 8. First deploy: order of operations

1. Complete steps 2 to 7. Nothing is live yet, so there are no users to disturb.
2. Merge or push to `main`. Two things then start **independently**:
   - **GitHub Actions** runs `api` (build and test), then `migrate` (migrations, then seed).
   - **Vercel** builds and deploys from the same push.
3. **Vercel does not wait for GitHub Actions.** For the very first deploy this does not matter, because the database is empty and no one is using the site. Watch the `migrate` job in the Actions tab and wait for it to finish green before you test the site.
4. On every later release, the same race exists. A release that needs a new column can reach the API before the migration is applied, and requests fail for a short time. To prevent this:
   - Keep migrations **backward compatible**: add columns as nullable or with defaults, deploy the code that uses them, and only later remove old columns.
   - Avoid renaming or dropping columns in the same release that changes the code using them.
5. Check the deploy: `https://<domain>/api/health` should return a healthy response, and `https://<domain>/api/openapi.json` should return the API description.

If the `migrate` job fails, read its log before doing anything else. Migrations are safe to re-run because the seed is idempotent, but a half-applied migration needs attention (see Rollback).

---

## 9. First admin login and forced password change

1. Open `https://<domain>/admin/` (available once the admin app is built).
2. Sign in with `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD`.
3. The account is flagged `MustChangePassword`, so the app must send you to a change-password screen. Choose a new password, then log in again.
4. Then remove `ADMIN_INITIAL_PASSWORD` from GitHub secrets. The seed reads it only when no admin exists, so removing it is safe. Do not change the password through the seed; use the admin change-password screen.

The change-password flow depends on the admin UI, which does not exist yet. Confirm the forced change works once the admin app ships.

Lockout: five wrong passwords lock the account for 15 minutes.

---

## 10. Preview deploys and Neon branches (optional)

Vercel creates a preview for each pull request. Those previews need a database to talk to. Do **not** point previews at the production database.

1. In Neon, create a **branch** for previews, for example `preview`. Neon branches are copy-on-write. A branch created from production also copies production's data, including the admin account. Prefer a branch from an empty or schema-only state.
2. Set `NEON_DATABASE_URL` for the **Preview** environment in Vercel to that branch's pooled URL.
3. Apply migrations to that branch yourself (for example by running the migration bundle with `NEON_DIRECT_URL` set to the branch's direct URL). The `migrate` job in CI only targets production.
4. Set the Turnstile widget and R2 values for the preview hostname, or a preview bucket.

This is optional. Until you need it, previews can simply be skipped.

---

## 11. Rollback

There are three things you might need to roll back. They are separate.

**The application code (Vercel).** Open the project's **Deployments** list, pick the last good production deployment, and use the option to promote or roll back to it. Vercel calls this **Instant Rollback**; check the exact wording in your dashboard. This takes effect without a rebuild. It does not touch the database.

**The database schema.** Migrations are **forward-only** in this project. There are no automatic "down" migrations. Do not edit `__ef_migrations_history` by hand. If a migration must be undone, write a new forward migration that reverses it, or restore the database (below).

**The data.** Use Neon's **point-in-time restore**, or create a **branch** from a past point in time. Restoring is done in Neon, and the history window depends on your plan. Restoring to a branch does not switch production over. To move production to a restored database, you must change `NEON_DATABASE_URL` in Vercel and redeploy. Check the Neon restore flow in its console before you need it in an emergency.

Practical advice: before a risky release, create a named Neon branch as a snapshot. Delete it once the release has settled.

---

## 12. Costs

Figures are from `PLAN.md` as of 2026-11-24. Check current prices before you buy.

| Service | Development and testing | Live store |
|---|---|---|
| **Vercel** | Hobby, $0. **Non-commercial use only.** | **Pro, about $20/month.** Required for a store taking orders. |
| **Neon** | Free plan | Free plan at this scale, per `PLAN.md`. Upgrade if storage or compute outgrows it. |
| **Cloudflare R2** | Free tier: 10 GB storage, no egress fees. Needs a payment card. | Same tier at this scale. Operations beyond the free quota are billed. |
| **Cloudflare Turnstile** | Free | Free |
| **GitHub Actions** | Free for public repos. Private repos get a monthly minutes allowance. | Same |
| **Domain** | Your registrar's yearly fee | Same |

Expect roughly **$20 per month** for Vercel Pro once the store is live. Everything else is free at the expected scale.

---

## 13. The beta caveat and the fallback

The **container runtime** and **multi-service projects** that this setup depends on are **Beta on all Vercel plans** (`PLAN.md` §0). No documented example puts a static site and a container under one project. That is why the spike exists.

- If the spike (`PLAN.md` §4.2) fails, the agreed fallback is **two Vercel projects** (`PLAN.md` §4.3):
  - `web` (storefront and admin, static) at `<domain>`.
  - `api` (container) at `api.<domain>`.
  - Then CORS is locked to `https://<domain>`, the session cookie is set with `Domain=.<domain>; SameSite=Lax` (Strict breaks cross-subdomain requests), and CSRF stays double-submit.
- The fallback needs the owner's approval. Do not switch to it silently.

---

## 14. Local development

Full instructions are in `docs/backend/CONTRACTS-API.md` (section "Run locally") and `.env.example`. In short:

1. Install the .NET 10 SDK and PostgreSQL 17. Create a database `geardoctor` (and `geardoctor_test` for tests), with user `geardoctor`.
2. Copy `.env.example` to `.env` if you want. Local dev can use the `Host=localhost;...` form for `NEON_DATABASE_URL`.
3. From `api/`, apply migrations, seed, then run the API. Commands are in `CONTRACTS-API.md`.
4. Run the tests with `dotnet test` from `api/`. Set `TEST_DATABASE_URL` to the test database.
5. Health check: `http://127.0.0.1:5080/api/health`.

Local development uses `ASPNETCORE_ENVIRONMENT=Development`. In that mode the API uses a built-in dev-only JWT key if `JWT_SIGNING_KEY` is unset. Outside Development, a missing `JWT_SIGNING_KEY` stops the app from starting.

Turnstile is different: the dummy-secret fallback applies **in every environment** whenever `TURNSTILE_SECRET` is unset, so it is not blocked by environment. Production safety depends on setting the variable (step 4 and step 6).
