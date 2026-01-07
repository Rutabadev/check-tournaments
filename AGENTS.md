# AGENTS.md - check-tournaments

## Project Overview

A web scraping tool that monitors padel tournament availability across four club websites. Runs on AWS Lambda, scrapes tournament listings, tracks changes in DynamoDB, and sends email notifications when new tournaments matching specific criteria are available.

## Architecture

```
Handler launches browser
  ↓
processTournament runs in parallel for each subdomain
  ├─ Login to gestion-sports.com
  ├─ Scrape tournament listings (HTML parsing)
  ├─ Fetch previous state from DynamoDB (per-subdomain key)
  ├─ Compare and filter tournaments
  └─ Return {newTournaments, currentTournaments, needsDbUpdate, fullTournoisMap}
  ↓
Collect results (failed subdomains skipped, others aggregated)
  ↓
Send email (if any new tournaments after filtering)
  ↓
Update DynamoDB for successful subdomains with changes
  ↓
Close browser and return
```

## Key Files

- **index.mjs** - Main handler and all business logic
- **package.json** - Dependencies (puppeteer-core, chromium, nodemailer, AWS SDK)
- **run-local.mjs** - Local test runner
- **Dockerfile** - AWS Lambda environment for local testing
- **.env** - Runtime configuration (credentials, email lists)

## Core Concepts

### Subdomains Being Monitored

Four padel club subdomains are scraped:
- `toulousepadelclub.gestion-sports.com`
- `toppadel.gestion-sports.com`
- `acepadelclub.gestion-sports.com`
- `the-country-club-toulouse.gestion-sports.com`

These are hardcoded in the `SUBDOMAINS` array in index.mjs. To add/remove a subdomain, edit the array and re-deploy.

### Tournament Filtering Logic

After scraping, tournaments are filtered by:
1. **Not full** - exclude tournaments ending with `_complet`
2. **Gender** - exclude "femme" and "mixte" categories
3. **Age** - exclude "+45" tournaments
4. **Level** - only include P50, P100, or P250 level tournaments

The rationale: the user is interested in men's amateur padel tournaments at specified skill levels.

To modify filtering rules, edit the filter chain in the `processTournament` function. Each `.filter()` call is a rule—add, remove, or modify them as needed.

### Scraping Strategy

- Uses Puppeteer to automate login
- Navigates to `/appli/Évènements` on each subdomain
- Extracts tournament info from HTML using CSS selector: `app-evenements .w-100.contain app-input-search ~ div.mb-20`
- Parses tournament text to extract: date, time, level, available slots, nocturne flag

**Important**: CSS selectors and text parsing patterns are brittle. If the website HTML changes, selectors will fail silently or throw errors.

### State Tracking

DynamoDB table `tournaments` stores:
- **Key**: `id: "latest-{subdomain}"` (per-subdomain tracking)
- **Value**: JSON string of tournaments found in last run for that subdomain

On each run:
1. For each subdomain in parallel (via `processTournament`):
   - Fetch latest tournaments from DB using `latest-{subdomain}` key
   - Compare with current scrape
   - Identify new tournaments (not in previous state, not full, passes filters)
2. Collect all results (failed subdomains are skipped, successful ones aggregated)
3. Send email if any new tournaments found across all subdomains
4. Update DB only for subdomains with changes detected (after email is sent)

**Key benefit of per-subdomain keys**: If one subdomain's scrape fails, its DB record is not updated, preserving data for the next run. Other subdomains can still update independently.

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

Example existing pattern in `scrapeTournaments`: notification when welcome popup is missing.

### Example: Adding Error Detection

If a CSS selector fails and returns empty list, detect it and email:
```javascript
if (tournoisDivs.length === 0) {
  await sendAdminNotification(`[${subdomain}] No tournaments found. Selector may have changed.`);
  throw new Error(`No tournaments found for ${subdomain}`);
}
```

Use the existing nodemailer transport pattern with `nodemailer.createTransport()` to send admin notifications.

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

Edit the filter chain in the `processTournament` function. Example: to also include mixte tournaments:

```javascript
// Remove this line:
.filter((tournoi) => !tournoi.toLowerCase().includes("mixte"))
```

## Email Formatting

The `formatTournament` function parses raw tournament text and formats it for email. It extracts:
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

## Recent Refactorings

### Jan 2026: Per-Subdomain State Tracking

**Problem**: When one subdomain's scrape failed, the global DynamoDB record was overwritten with partial data, causing old tournaments to re-appear as new in subsequent runs.

**Solution**: Changed from single `id: "latest"` key to per-subdomain keys (`id: "latest-{subdomain}"`). Now each subdomain maintains independent state—if one fails, others can still update their records.

**Impact**: Eliminated duplicate tournament emails caused by state corruption.

### Jan 2026: Parallel Processing with `processTournament`

**Problem**: Code had nested loops that were hard to follow and made error handling unclear (which failures should prevent DB updates?).

**Solution**: Extracted `processTournament` function that encapsulates the full workflow for one subdomain: scrape → fetch DB → filter → return results. All subdomains run in parallel via `Promise.allSettled`, then results are collected once.

**Impact**: Clearer error boundaries, easier to test, failed subdomains no longer corrupt successful ones.
