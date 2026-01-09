# Refactoring Plan: check-tournaments

## Goals

1. **Simpler tournament data structure** - Extract structured data during scraping instead of raw strings
2. **Domain-based folder structure** - Separate concerns into focused modules
3. **Simplified email formatting** - Trivial formatting since data is already structured
4. **Fix duplicate DB update** - Single update path

---

## 1. New Tournament Data Structure

### Current (problematic)

```javascript
// During scraping - confusing "stripped" vs "full"
{ stripped: "lun. 10 jan. P100 18h00_complet", full: "lun. 10 jan. P100 18h00 0 places restantes", subdomain }

// Then fullTournoisMap to lookup full from stripped
// Then newTournamentsBySubdomain groups by subdomain
// Then formatTournament re-parses everything with regex
```

### New (structured from the start)

```javascript
{
  subdomain: "toulousepadelclub",
  level: "P100",           // P50, P100, P250
  date: "lun. 10 jan.",    // Raw date string for display
  dayOfWeek: "lundi",      // Full day name (for weekend highlighting)
  time: "18h00-20h00",     // Time range
  spots: 4,                // Number of available spots (0 = full)
  isNocturne: true,        // Computed: time >= 18h or text contains "nocturne"
  isFull: false,           // Computed: spots === 0
  category: "homme",       // "homme", "femme", "mixte"
  ageGroup: null,          // "+45" or null
  rawText: "...",          // Original text for debugging/logging
  id: "tpc-lun-10-jan-P100-18h00"  // Unique ID for DB comparison
}
```

### Benefits

- **No more "stripped" vs "full"** - one object has everything
- **No fullTournoisMap** - data already contains what we need
- **Filtering becomes readable**: `tournament.level === "P100" && !tournament.isFull`
- **Email formatting is trivial**: just template the fields
- **DB storage**: store array of `id` strings, compare by ID

---

## 2. Folder Structure

```
src/
  config/
    index.mjs           # Env vars, subdomains, constants
  
  scraping/
    browser.mjs         # Browser launch (local vs lambda)
    login.mjs           # Login to gestion-sports
    parser.mjs          # Parse tournament HTML into structured data
    scraper.mjs         # Orchestrates: login → navigate → parse
  
  storage/
    dynamodb.mjs        # Client init, get/put operations
  
  email/
    transport.mjs       # Nodemailer setup
    formatter.mjs       # Tournament → HTML (simple template)
    sender.mjs          # Send tournament notifications
    admin.mjs           # Send admin error notifications
  
  filtering/
    rules.mjs           # Filter functions (level, gender, age, full)
    index.mjs           # Apply all filters, detect freed spots
  
  handler.mjs           # Main Lambda handler (orchestration only)

index.mjs               # Entry point, exports handler
run-local.mjs           # Local runner (unchanged)
```

---

## 3. Simplified Email Formatting

### Current (60+ lines of regex)

```javascript
const formatTournament = (data, fullTournoisMap) => {
  const prefixMatch = data.match(/^Places libérées\s*:\s*/i);
  // ... 50 more lines of regex parsing
}
```

### New (simple template)

```javascript
export function formatTournament(tournament, options = {}) {
  const parts = [];
  
  if (tournament.isNocturne) {
    parts.push('<b>nocturne</b>');
  }
  
  // Highlight weekends
  const day = ['samedi', 'dimanche'].includes(tournament.dayOfWeek) 
    ? `<b>${tournament.dayOfWeek}</b>` 
    : tournament.dayOfWeek;
  
  parts.push(`${day} ${tournament.date}`);
  parts.push(tournament.level);
  parts.push(tournament.time);
  parts.push(`${tournament.spots} places`);
  
  const prefix = options.isFreedSpot ? 'Places libérées: ' : '';
  return prefix + parts.join(' ');
}
```

---

## 4. Fix Duplicate DB Update

### Current Issue

DB updates happen in two places:
- Lines 330-346: When no new tournaments after filtering
- Lines 471-486: After email sent

### Solution

Single update function called once at the end of handler:

```javascript
// In handler.mjs
async function updateDatabase(dynamoDbClient, updatesToMake) {
  if (process.env.DEBUG) {
    console.log('DEBUG mode: skipping DB updates');
    return;
  }
  
  for (const update of updatesToMake) {
    await putTournaments(dynamoDbClient, update.subdomain, update.tournamentIds);
    console.log(`[${update.subdomain}] DB updated`);
  }
}

// Called once, after all processing (whether email sent or not)
await updateDatabase(dynamoDbClient, updatesToMake);
```

---

## 5. Implementation Tasks

### Phase 1: Create folder structure and move code

1. Create `src/config/index.mjs` - extract env vars, subdomains, constants
2. Create `src/scraping/browser.mjs` - browser launch logic
3. Create `src/scraping/login.mjs` - login flow
4. Create `src/scraping/parser.mjs` - HTML → structured tournament object
5. Create `src/scraping/scraper.mjs` - orchestrate scraping
6. Create `src/storage/dynamodb.mjs` - DB operations
7. Create `src/email/transport.mjs` - nodemailer setup
8. Create `src/email/formatter.mjs` - tournament formatting
9. Create `src/email/sender.mjs` - send notifications
10. Create `src/email/admin.mjs` - admin error emails
11. Create `src/filtering/rules.mjs` - individual filter functions
12. Create `src/filtering/index.mjs` - apply filters
13. Create `src/handler.mjs` - main handler (lean orchestration)
14. Update `index.mjs` - simple entry point

### Phase 2: Refactor data flow

1. Implement new tournament parser that extracts structured data
2. Update filtering to use structured fields
3. Update email formatting to use structured fields
4. Update DB storage to use tournament IDs
5. Remove fullTournoisMap and stripped/full distinction
6. Consolidate DB update to single location

### Phase 3: Testing and cleanup

1. Test locally with `npm start`
2. Test with `RUN_MODE=test npm start` (writes to DB)
3. Verify email format is correct
4. Remove dead code
5. Update AGENTS.md if needed

---

## 6. Key Files After Refactor

### src/scraping/parser.mjs (core change)

```javascript
/**
 * Parse tournament HTML element into structured data
 * @param {string} innerText - Raw text from tournament div
 * @param {string} subdomain
 * @returns {Tournament}
 */
export function parseTournament(innerText, subdomain) {
  const text = innerText.replace(/\n/g, ' ').trim();
  
  // Extract level
  const levelMatch = text.match(/\b(P\d+)\b/i);
  const level = levelMatch ? levelMatch[1].toUpperCase() : null;
  
  // Extract date: "lun. 10 jan."
  const dateMatch = text.match(/([a-zé]{3}\.)\s+(\d{1,2})\s+([a-zé]{3,4}\.)/i);
  const dayAbbrev = dateMatch?.[1]?.toLowerCase() || '';
  const dayNum = dateMatch?.[2] || '';
  const month = dateMatch?.[3] || '';
  
  // Extract time range
  const timeMatch = text.match(/(\d{2})h(\d{2})(?:\s*-\s*(\d{2})h(\d{2}))?/);
  const startHour = timeMatch ? parseInt(timeMatch[1]) : null;
  const time = timeMatch 
    ? (timeMatch[3] ? `${timeMatch[1]}h${timeMatch[2]}-${timeMatch[3]}h${timeMatch[4]}` : `${timeMatch[1]}h${timeMatch[2]}`)
    : '';
  
  // Extract spots
  const spotsMatch = text.match(/(\d+)\s*places?\s*restantes?/i);
  const spots = spotsMatch ? parseInt(spotsMatch[1]) : 0;
  
  // Detect category
  const category = text.toLowerCase().includes('femme') ? 'femme'
    : text.toLowerCase().includes('mixte') ? 'mixte'
    : 'homme';
  
  // Detect age group
  const ageMatch = text.match(/\+\s*(\d+)/);
  const ageGroup = ageMatch ? `+${ageMatch[1]}` : null;
  
  // Generate unique ID
  const id = `${subdomain}-${dayAbbrev}${dayNum}${month}-${level}-${time}`.replace(/\s+/g, '');
  
  return {
    subdomain,
    level,
    date: `${dayNum} ${month}`,
    dayOfWeek: DAY_ABBREV_MAP[dayAbbrev] || dayAbbrev,
    time,
    spots,
    isNocturne: (startHour !== null && startHour >= 18) || text.toLowerCase().includes('nocturne'),
    isFull: spots === 0,
    category,
    ageGroup,
    rawText: text,
    id,
  };
}
```

### src/filtering/rules.mjs

```javascript
export const isNotFull = (t) => !t.isFull;
export const isMen = (t) => t.category === 'homme';
export const isNotSenior = (t) => t.ageGroup !== '+45';
export const isTargetLevel = (t) => ['P50', 'P100', 'P250'].includes(t.level);
export const isNotWaitlist = (t) => !t.rawText.toLowerCase().includes("liste d'attente");

export const defaultFilters = [isNotFull, isMen, isNotSenior, isTargetLevel, isNotWaitlist];
```

### src/handler.mjs (lean orchestration)

```javascript
export async function handler() {
  const browser = await launchBrowser();
  const dynamoDbClient = createDynamoClient();
  
  try {
    // 1. Scrape all subdomains in parallel
    const results = await Promise.allSettled(
      SUBDOMAINS.map(subdomain => scrapeTournaments(browser, subdomain))
    );
    
    // 2. For each successful scrape: compare with DB, filter, collect updates
    const { newTournaments, dbUpdates } = await processResults(results, dynamoDbClient);
    
    // 3. Send email if new tournaments found
    if (newTournaments.length > 0) {
      await sendTournamentEmail(newTournaments);
    }
    
    // 4. Update DB (single location)
    await updateDatabase(dynamoDbClient, dbUpdates);
    
    return { statusCode: 200, body: 'OK' };
  } finally {
    await browser.close();
  }
}
```

---

## 7. Migration Notes

- **No breaking changes to external API** - handler signature unchanged
- **DB format change** - will store tournament IDs instead of stripped strings. First run after deploy will treat all tournaments as "new" since IDs won't match old format. This is acceptable (one extra email).
- **Environment variables unchanged**
