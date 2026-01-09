# AGENTS.md - check-tournaments

## Project Overview

A web scraping tool that monitors padel tournament availability across four club websites. Runs on AWS Lambda, scrapes tournament listings, tracks changes in DynamoDB, and sends email notifications when new tournaments matching specific criteria are available.

## Architecture

```
Handler launches browser
  ↓
processSubdomain runs in parallel for each subdomain
  ├─ Login to gestion-sports.com (login.mjs)
  ├─ Scrape & parse tournaments into structured data (scraper.mjs, parser.mjs)
  ├─ Fetch previous IDs from DynamoDB (dynamodb.mjs)
  ├─ Filter & find new tournaments (filtering/index.mjs)
  └─ Return {subdomain, newTournaments, tournamentIds, needsDbUpdate}
  ↓
Collect results (failed subdomains skipped)
  ↓
Send email if any new tournaments (email/sender.mjs)
  ↓
Update DynamoDB once at the end (single update path)
  ↓
Close browser and return
```

## Folder Structure

```
src/
  config/
    index.mjs           # Env vars, subdomains, constants (SUBDOMAINS, DAY_ABBREV_MAP, etc.)
  
  scraping/
    browser.mjs         # Browser launch (local vs lambda)
    login.mjs           # Login to gestion-sports
    parser.mjs          # Parse tournament HTML into structured Tournament object
    scraper.mjs         # Orchestrates: login → navigate → parse
  
  storage/
    dynamodb.mjs        # Client init, get/put operations
  
  email/
    transport.mjs       # Nodemailer setup
    formatter.mjs       # Tournament → HTML (simple template)
    sender.mjs          # Send tournament notifications
    admin.mjs           # Send admin error notifications
  
  filtering/
    rules.mjs           # Filter functions (isNotFull, isMen, isNotSenior, etc.)
    index.mjs           # Apply filters, find new tournaments, detect freed spots
  
  handler.mjs           # Main Lambda handler (orchestration only)

index.mjs               # Entry point, exports handler
run-local.mjs           # Local runner
```

## Tournament Data Structure

Tournaments are parsed into structured objects (see `src/scraping/parser.mjs`):

```javascript
{
  subdomain: "toulousepadelclub",
  level: "P100",           // P50, P100, P250
  date: "10 jan.",         // Day + month for display
  dayOfWeek: "lundi",      // Full day name
  time: "18h00-20h00",     // Time range
  spots: 4,                // Available spots (0 = full)
  isNocturne: true,        // time >= 18h or text contains "nocturne"
  isFull: false,           // spots === 0
  category: "homme",       // "homme", "femme", "mixte"
  ageGroup: null,          // "+45" or null
  youthGroup: null,        // "U14", "U16", etc. or null
  isWaitlist: false,       // Contains "liste d'attente"
  rawText: "...",          // Original text for debugging
  id: "tpc-lun.10jan.-P100-18h00-20h00"  // Unique ID for DB comparison
}
```

## Key Files

- **src/handler.mjs** - Main Lambda handler (orchestration only)
- **src/config/index.mjs** - Environment variables, constants, subdomain list
- **src/scraping/parser.mjs** - Core parsing logic (HTML text → structured data)
- **src/filtering/rules.mjs** - Tournament filter functions
- **src/email/formatter.mjs** - Simple email formatting (uses structured fields)
- **run-local.mjs** - Local test runner

## Core Concepts

### Subdomains Being Monitored

Four padel club subdomains (defined in `src/config/index.mjs`):
- `toulousepadelclub.gestion-sports.com`
- `toppadel.gestion-sports.com`
- `acepadelclub.gestion-sports.com`
- `the-country-club-toulouse.gestion-sports.com`

### Tournament Filtering Logic

Filters are defined in `src/filtering/rules.mjs`:

```javascript
export const isNotFull = (t) => !t.isFull;
export const isMen = (t) => t.category === "homme";
export const isNotSenior = (t) => t.ageGroup !== "+45";
export const isNotYouth = (t) => t.youthGroup === null;
export const isTargetLevel = (t) => ["P50", "P100", "P250"].includes(t.level);
export const isNotWaitlist = (t) => !t.isWaitlist;
```

To modify filters, edit `defaultFilters` array in `rules.mjs`.

### State Tracking

DynamoDB stores tournament IDs per subdomain:
- **Key**: `id: "latest-{subdomain}"`
- **Value**: JSON array of tournament IDs

Full tournaments are stored with `_full` suffix to detect freed spots.

### Single DB Update Path

DB updates happen once at the end of handler, after email is sent. No duplicate updates.

## Error Handling & Notifications

Admin notifications (`src/email/admin.mjs`) are sent for:
1. **Login failures** - credentials or site changes
2. **Missing welcome popup** - site structure may have changed
3. **No tournaments found** - CSS selector may need update

## Common Tasks

### Adding a New Subdomain

1. Add to `SUBDOMAINS` array in `src/config/index.mjs`
2. Test with `npm start`

### Modifying Filters

Edit `src/filtering/rules.mjs`. Example to include mixte:
```javascript
export const isMen = (t) => t.category === "homme" || t.category === "mixte";
```

### Updating CSS Selectors

If scraping breaks, update selectors in `src/scraping/scraper.mjs`.

### Updating Text Parsing

If tournament text format changes, update regex patterns in `src/scraping/parser.mjs`.

## Local Testing

```bash
npm start
```

Browser opens in visible mode. Set `DEBUG=1` in `.env` to skip DB writes.

For production test (writes to DB):
```bash
RUN_MODE=test npm start
```

## Environment Variables Required

```
EMAIL              - Login email for padel websites
PASSWORD           - Login password
MAILING_LIST       - Comma-separated emails to notify
EMAIL_APP_PASS     - Gmail app-specific password
AWS_REGION         - DynamoDB region
ACCESS_KEY_ID      - AWS credentials (local only)
SECRET_ACCESS_KEY  - AWS credentials (local only)
NODE_ENV           - "local" or unset for Lambda
DEBUG              - If set, skips DB writes
```

## Code Style

- ES modules (`.mjs`)
- JSDoc comments for types
- Error messages prefixed with `[subdomain]`
- Structured Tournament objects (no raw string parsing at email time)
