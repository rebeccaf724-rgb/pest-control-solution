# Green Pest Management Solution — Google Ads IP Monitoring

## What is included
- `website/`: your original GitHub Pages website, all 23 existing HTML pages instrumented, plus `ads-dashboard.html`.
- `cloudflare-worker/`: Cloudflare Worker, D1 schema, deployment config, password hash generator.
- Threshold: **3 ad-attributed landing sessions per IP in the last 24 hours**. This is **not proof of fake clicks**.
- Password-protected admin, CSV export, review/approve/dismiss, and Google Ads API IP exclusion for **approved IPv4** only.
- **DRY_RUN=true** and **AUTO_EXCLUDE=false** by default. This design does **not** automatically ban an IP solely because it has 3 visits. A human must approve it and request exclusion in the dashboard.

## 1. Cloudflare prerequisites
Create a free Cloudflare account, install Node.js 20+, and open a terminal in `cloudflare-worker`.

```bash
npm install -g wrangler
wrangler login
wrangler d1 create pest-ads-monitor
```

Copy the `database_id` from the output into `wrangler.toml`. Set `ALLOWED_ORIGIN` to your exact GitHub Pages origin, for example `https://myusername.github.io` (NO trailing slash, NO repository path). For a custom domain use `https://yourdomain.example`. Only one origin is supported by this starter.

```bash
wrangler d1 execute pest-ads-monitor --remote --file=./schema.sql
node create-password-hash.mjs
wrangler secret put ADMIN_PASSWORD_HASH
wrangler secret put SESSION_SECRET
wrangler deploy
```

Paste the generated password hash as `ADMIN_PASSWORD_HASH`. For `SESSION_SECRET`, generate a unique 32+ character random string and paste it; do not reuse your dashboard password. **Never commit secrets to GitHub.**

## 2. Connect your GitHub website
Copy the deployed Worker URL shown by `wrangler deploy` (e.g. `https://pest-ads-monitor.youraccount.workers.dev`). Replace the exact placeholder `https://REPLACE-WORKER.YOUR-SUBDOMAIN.workers.dev` in BOTH:
- `website/assets/js/ads-monitor.js`
- `website/ads-dashboard.html`

Upload the **contents of the `website` folder** to the GitHub repository root, preserving the existing files. Commit and wait for GitHub Pages to publish. The private dashboard is at `https://YOURUSERNAME.github.io/YOUR-REPO/ads-dashboard.html` (or your custom domain path). The HTML is public, but its data and actions require a password-verified session at the Worker.

If your GitHub Pages URL is `https://YOURUSERNAME.github.io/YOUR-REPO/`, the allowed origin is **only** `https://YOURUSERNAME.github.io`, not the full URL.

## 3. Verify tracking
1. Visit your site using a test landing URL with `?gclid=test123&utm_campaign=trial`. The click ID value is never sent to the Worker.
2. Open the dashboard and sign in. The ad-attributed visit should appear in the table.
3. Open new browser sessions to test the threshold. Each browser tab session is deduplicated for 30 minutes. For testing, use fresh private windows or clear session storage.
4. Confirm CSV export works. Note that the system tracks ad-tagged landing sessions, **not confirmed billable clicks**.
5. If data does not appear, check browser developer tools and Worker logs: `wrangler tail`.

## 4. Optional Google Ads API setup
This step requires an approved Google Ads developer token with the required access level, OAuth client ID and secret, a refresh token authorized for the account, the customer ID, and an allowlist of campaign IDs. Access may be restricted for Explorer/basic-access accounts; verify your Google Ads API eligibility first. Campaigns must support IP exclusions. Google Ads API version and IP exclusion support can change; verify the `campaignCriteria:mutate` endpoint and IP_BLOCK criterion for the version you select.

Set these Cloudflare Worker secrets (one by one):
```bash
wrangler secret put GOOGLE_ADS_DEVELOPER_TOKEN
wrangler secret put GOOGLE_ADS_CLIENT_ID
wrangler secret put GOOGLE_ADS_CLIENT_SECRET
wrangler secret put GOOGLE_ADS_REFRESH_TOKEN
wrangler secret put GOOGLE_ADS_CUSTOMER_ID
```

If operating through an MCC, also set `GOOGLE_ADS_LOGIN_CUSTOMER_ID` using `wrangler secret put GOOGLE_ADS_LOGIN_CUSTOMER_ID`.

Set these **non-secret** values in `wrangler.toml` under `[vars]`:
```toml
GOOGLE_ADS_CAMPAIGN_IDS = "1234567890,9876543210"
GOOGLE_ADS_API_VERSION = "v22"
AUTO_EXCLUDE = "false"
DRY_RUN = "true"
MAX_EXCLUSIONS_PER_DAY = "5"
```

Use your real campaign IDs; the sample IDs are not real. Run `wrangler deploy` after editing. First approve a flagged IPv4 in the dashboard and click **Exclude from Ads**. The result should be `dry_run`. No real exclusion is sent.

**Only after verifying OAuth permissions, campaign IDs, supported API version, and successful dry-run behavior:** change `AUTO_EXCLUDE="true"` and `DRY_RUN="false"`, then `wrangler deploy`. A user must still approve the IP and click Exclude. No background exclusions happen. The dashboard will report API errors rather than pretending an exclusion succeeded. Submitted means the API accepted the mutation; check Google Ads to confirm.

## Safeguards and limitations
- 3 tracked ad visits can be legitimate. Never treat this as proven click fraud.
- No automatic exclusion of unreviewed IPs. Manual approval plus explicit exclusion action is mandatory.
- IPv4 only for exclusions in this starter. IPv6 can be monitored, but not submitted for exclusion.
- Campaign allowlist, per-day cap, duplicate-submission guard, dry-run default.
- Cookies use `Secure; HttpOnly; SameSite=None` because GitHub Pages and Workers are cross-origin. Some browsers block third-party cookies. For reliable dashboard sign-in, use a same-site custom-domain reverse proxy or Cloudflare Access. Do not weaken cookie security.
- This starter uses Cloudflare's trusted `CF-Connecting-IP` header and does not trust browser-supplied IPs. Tracking endpoints are publicly callable by browsers from the allowlisted origin; origin checks are not strong bot authentication. Automated or forged traffic can still poison analytics.
- D1 logs IP addresses, page paths, session IDs and shortened user agents. Update your privacy notice, set appropriate consent rules, and restrict access. This starter does not implement automatic data deletion; set up scheduled retention cleanup before production. The CSV covers 30 days, but old database rows remain until deleted.
- A Cloudflare Worker does not see GitHub Pages traffic unless the tracking JavaScript executes. Browser blockers may suppress tracking.
- IP exclusion may not stop all invalid traffic; use Google Ads' invalid-click reports and support channels as well.
- The sample `v22` API version must be checked against Google's currently supported versions at deployment.

## Troubleshooting
- **No visits:** check exact Worker URL in both files, `ALLOWED_ORIGIN`, page source for injected script, and browser console.
- **Login fails:** check password hash and session secret, and third-party cookie restrictions.
- **401 on stats:** session cookie not retained or expired.
- **403 on exclusion:** IP not approved, campaign not allowlisted, or threshold no longer met.
- **Google Ads API error:** inspect returned error, token permissions, API version, customer/login-customer IDs, and campaign type.
- **Reset password:** rerun the password hash generator, replace `ADMIN_PASSWORD_HASH` using `wrangler secret put`, then redeploy.
