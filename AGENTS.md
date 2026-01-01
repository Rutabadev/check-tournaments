# AGENTS.md - check-tournaments

## Project Overview

A web scraping tool that monitors padel tournament availability across three club websites. Runs on AWS Lambda, scrapes tournament listings, tracks changes in DynamoDB, and sends email notifications when new tournaments matching specific criteria are available.

## Architecture

```
Puppeteer (headless browser automation)
  ↓
Login to gestion-sports.com subdomains
  ↓
Scrape tournament listings (HTML parsing)
  ↓
Compare with previous state (DynamoDB)
  ↓
Apply filters (level, gender, time category)
  ↓
Send email notifications
```

## Key Files

- **index.mjs** - Main handler and all business logic
- **package.json** - Dependencies (puppeteer-core, chromium, nodemailer, AWS SDK)
- **run-local.mjs** - Local test runner
- **Dockerfile** - AWS Lambda environment for local testing
- **.env** - Runtime configuration (credentials, email lists)

## Core Concepts

### Subdomains Being Monitored

Three padel club subdomains are scraped:
- `toulousepadelclub.gestion-sports.com`
- `toppadel.gestion-sports.com`
- `acepadelclub.gestion-sports.com`

These are hardcoded in the `SUBDOMAINS` array. Changes here require code modification.

### Tournament Filtering Logic

After scraping, tournaments are filtered by:
1. **Not full** - exclude tournaments ending with `_complet`
2. **Gender** - exclude "femme" and "mixte" categories
3. **Age** - exclude "+45" tournaments
4. **Level** - only include P50, P100, or P250 level tournaments

The rationale: the user is interested in men's amateur padel tournaments at specified skill levels.

If filtering rules need to change, modify the filter chain around line 276-287 in index.mjs.

### Scraping Strategy

- Uses Puppeteer to automate login
- Navigates to `/appli/Évènements` on each subdomain
- Extracts tournament info from HTML using CSS selector: `app-evenements .w-100.contain app-input-search ~ div.mb-20`
- Parses tournament text to extract: date, time, level, available slots, nocturne flag

**Important**: CSS selectors and text parsing patterns are brittle. If the website HTML changes, selectors will fail silently or throw errors.

### State Tracking

DynamoDB table `tournaments` stores:
- **Key**: `id: "latest"`
- **Value**: JSON string of tournaments found in last run, organized by subdomain

On each run:
1. Fetch latest tournaments from DB
2. Compare with current scrape
3. Identify new tournaments (not in previous state, not full, passes filters)
4. Update DB only if changes detected
5. Send email if new tournaments found

## Error Handling & Notifications

### When to Notify Admin

Email admin at `etienner37@gmail.com` if:

1. **Login fails** for any subdomain - CSS selectors may have changed
2. **Navigation fails** (can't reach `/appli/Évènements`) - site structure changed
3. **Scraping fails** when extracting tournament info - HTML parsing needs debugging

### Notification Format

Keep emails simple:
- **Subject**: `[Check Tournaments] Error on {subdomain}`
- **Body**: Clear description of what failed + relevant error message
- Do NOT include full stack traces or irrelevant logs

Example existing pattern (line 105-110): notification when welcome popup is missing.

### Example: Adding Error Detection

If a CSS selector fails and returns empty list, detect it and email:
```javascript
if (tournoisDivs.length === 0) {
  await sendAdminNotification(`[${subdomain}] No tournaments found. Selector may have changed.`);
  throw new Error(`No tournaments found for ${subdomain}`);
}
```

Use the existing `sendMail` pattern with nodemailer (see lines 316-322 for transport setup).

## Common Tasks for Agents

### Debugging Scraping Issues

1. Run locally: `npm start`
2. Browser launches with `headless: false` so you can watch interactions
3. Check console logs for which step fails
4. If it's a selector issue, inspect the live page and update the CSS selector

### Handling HTML Structure Changes

1. User will receive admin notification email (once implemented)
2. Agent should:
   - Log into the website manually
   - Inspect the HTML structure with DevTools
   - Identify the new CSS selector or text pattern
   - Update the selector/regex in index.mjs
   - Test with `npm start`
   - Verify email was sent on successful run

### Adding a New Subdomain

1. Add to `SUBDOMAINS` array (line 37)
2. Verify login works (username/password same across clubs)
3. Verify `/appli/Évènements` path exists
4. Test locally with `npm start`
5. Deploy (currently manual)

### Modifying Tournament Filters

Edit the filter chain (lines 276-287). Example: to also include mixte tournaments:

```javascript
// Remove this line:
.filter((tournoi) => !tournoi.toLowerCase().includes("mixte"))
```

## Email Formatting

The `formatTournament` function (lines 333-396) parses raw tournament text and formats it for email. It extracts:
- Level (P50, P100, P250)
- Date and time
- Available slots
- Nocturne flag (matches time >= 18h)
- "Places libérées" prefix if tournament was previously full

This is complex but working. Only modify if email output format needs to change.

## Local Testing

```bash
npm start
```

Launches with `NODE_ENV=local`, uses regular Puppeteer (not puppeteer-core). Browser headless is `false` so you see what's happening.

For Docker/Lambda environment testing:
```bash
docker build -t check .
docker run -p 9000:8080 check:latest
curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{}' -H "Content-Type: application/json"
```

## Deployment

Currently **manual** via AWS Console:
- Code pushed to `check-tournaments` Lambda
- Dependencies in `padelito` layer
- Environment variables set in Lambda config

Future: CI/CD with Terraform or similar tool (not yet implemented).

## Environment Variables Required

```
EMAIL              - Login email for padel websites
PASSWORD           - Login password
MAILING_LIST       - Comma-separated emails to notify
EMAIL_APP_PASS     - Gmail app-specific password for sending emails
AWS_REGION         - DynamoDB region
ACCESS_KEY_ID      - AWS credentials (local/non-production only)
SECRET_ACCESS_KEY  - AWS credentials (local/non-production only)
NODE_ENV           - "local" or unset for Lambda
DEBUG              - If set, prevents writing to DynamoDB (useful for testing)
```

## Code Style Notes

- Using ES modules (`.mjs` files)
- JSDoc comments for function signatures
- Error messages include `[subdomain]` prefix for clarity
- All async operations use `await` (no floating promises)
