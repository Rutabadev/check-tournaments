import { createRequire } from "module"; const require = createRequire(import.meta.url);

// src/config/index.mjs
var isLocal = process.env.NODE_ENV === "local";
var SUBDOMAINS = [
  "toulousepadelclub",
  "toppadel",
  "acepadelclub",
  "the-country-club-toulouse"
];
var DAY_ABBREV_MAP = {
  "lun.": "lundi",
  "mar.": "mardi",
  "mer.": "mercredi",
  "jeu.": "jeudi",
  "ven.": "vendredi",
  "sam.": "samedi",
  "dim.": "dimanche"
};
var WEEKEND_DAYS = ["samedi", "dimanche"];
var TARGET_LEVELS = ["P50", "P100", "P250"];
var ADMIN_EMAIL = "etienner37@gmail.com";
var SENDER_EMAIL = "izi.rutabaga@gmail.com";
function getConfig() {
  const { MAILING_LIST, EMAIL, PASSWORD, EMAIL_APP_PASS } = process.env;
  if (!MAILING_LIST || !EMAIL || !EMAIL_APP_PASS || !PASSWORD) {
    throw new Error(
      "Missing env variables, required: MAILING_LIST, EMAIL, PASSWORD, EMAIL_APP_PASS"
    );
  }
  return {
    mailingList: MAILING_LIST.split(","),
    email: EMAIL,
    password: PASSWORD,
    emailAppPass: EMAIL_APP_PASS,
    awsRegion: process.env.AWS_REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    debug: !!process.env.DEBUG
  };
}
var wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// src/scraping/browser.mjs
var puppeteer;
var chromium;
var isProduction = false;
async function initBrowser() {
  if (isLocal) {
    puppeteer = (await import("puppeteer")).default;
  } else {
    try {
      await import("dotenv/config");
    } catch {
      isProduction = true;
    }
    puppeteer = (await import("puppeteer-core")).default;
    chromium = (await import("@sparticuz/chromium")).default;
  }
  console.log(
    "Running in",
    isLocal ? "local" : `lambda${isProduction ? " (production)" : ""}`,
    "mode"
  );
  return { puppeteer, chromium, isProduction };
}
async function launchBrowser() {
  const { puppeteer: puppeteer2, chromium: chromium2 } = await initBrowser();
  if (isLocal) {
    return puppeteer2.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
  }
  return puppeteer2.launch({
    args: [
      ...chromium2.args,
      "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor"
    ],
    defaultViewport: chromium2.defaultViewport,
    executablePath: await chromium2.executablePath(),
    headless: chromium2.headless,
    ignoreHTTPSErrors: true
  });
}
function getIsProduction() {
  return isProduction;
}

// src/email/admin.mjs
import nodemailer from "nodemailer";
async function sendAdminNotification(subject, html) {
  try {
    const config = getConfig();
    const transporter2 = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: SENDER_EMAIL,
        pass: config.emailAppPass
      }
    });
    await transporter2.sendMail({
      from: SENDER_EMAIL,
      to: ADMIN_EMAIL,
      subject,
      html
    });
    console.log(`Admin notification sent: ${subject}`);
  } catch (error) {
    console.error("Failed to send admin notification:", error);
  }
}

// src/scraping/login.mjs
async function login(page, subdomain) {
  const { email, password } = getConfig();
  const baseUrl = `https://${subdomain}.gestion-sports.com`;
  try {
    await page.goto(baseUrl);
    console.log(`[${subdomain}] Go to login page`);
    await page.type("input[type=text][name=email]", email);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await wait(2e3);
    await page.keyboard.press("Tab");
    await page.keyboard.type(password);
    await page.$$eval("button", (buttons) => {
      buttons.filter(
        (button) => button.innerText.toLowerCase().includes("connecter")
      )[0].click();
    });
    await page.waitForNavigation({
      waitUntil: "networkidle0",
      timeout: 1e4
    });
    console.log(`[${subdomain}] Login done`);
  } catch (error) {
    console.error(`[${subdomain}] Login failed:`, error);
    await sendAdminNotification(
      `[Check Tournaments] Login failed on ${subdomain}`,
      `<p>Login failed for <strong>${subdomain}</strong>.</p><p>Error: ${error.message}</p>`
    );
    throw new Error(`Login failed for ${subdomain}`);
  }
  await closeWelcomePopup(page, subdomain);
  return baseUrl;
}
async function closeWelcomePopup(page, subdomain) {
  try {
    console.log(`[${subdomain}] Close welcome popup`);
    const closePopupButton = await page.waitForSelector(
      "app-welcome-popup button",
      { timeout: 2e3 }
    );
    if (closePopupButton) {
      await closePopupButton.click();
    }
  } catch (error) {
    console.log(
      `[${subdomain}] Welcome popup not found (this is okay, continuing...)`
    );
    await sendAdminNotification(
      `[Check Tournaments] No popup found on ${subdomain}`,
      `<p>The welcome popup was not found when scraping <strong>${subdomain}</strong>. This may indicate a site change or issue with the scraper.</p>`
    );
  }
}

// src/scraping/parser.mjs
function parseTournament(elementData, subdomain) {
  const text = elementData.innerText.replace(/\n/g, " ").trim();
  const levelMatch = text.match(/\b(P\s?\d+)\b/i);
  const level = levelMatch ? levelMatch[1].toUpperCase().replaceAll(" ", "") : null;
  const dateMatch = text.match(/([a-zé]{3}\.)\s+(\d{1,2})\s+([a-zé]{3,4}\.)/i);
  const dayAbbrev = dateMatch?.[1]?.toLowerCase() || "";
  const dayNum = dateMatch?.[2] || "";
  const month = dateMatch?.[3] || "";
  const timeMatch = text.match(/(\d{2})h(\d{2})(?:\s*-\s*(\d{2})h(\d{2}))?/);
  const startHour = timeMatch ? parseInt(timeMatch[1]) : null;
  const time = timeMatch ? timeMatch[3] ? `${timeMatch[1]}h${timeMatch[2]}-${timeMatch[3]}h${timeMatch[4]}` : `${timeMatch[1]}h${timeMatch[2]}` : "";
  const spotsMatch = elementData.spots?.match(/(\d+)/);
  const spots = elementData.hasButton && spotsMatch ? parseInt(spotsMatch[1]) : 0;
  const textLower = text.toLowerCase();
  const isNocturne = textLower.includes("soir\xE9e") || textLower.includes("soiree") || textLower.includes("nocturne") || startHour !== null && startHour >= 18;
  const category = textLower.includes("femme") ? "femme" : textLower.includes("mixte") ? "mixte" : "homme";
  const ageMatch = text.match(/\+\s*(\d+)/);
  const ageGroup = ageMatch ? `+${ageMatch[1]}` : null;
  const youthMatch = text.match(/\bU\s?(\d+)\b/i);
  const youthGroup = youthMatch ? `U${youthMatch[1]}` : null;
  const isWaitlist = ["liste", "attente"].every(
    (word) => textLower.includes(word)
  );
  const baseId = `${dayAbbrev}${dayNum}${month}-${level}-${time}`.replace(
    /\s+/g,
    ""
  );
  const id = isWaitlist ? `${baseId}_waitlist` : baseId;
  return {
    subdomain,
    level,
    date: `${dayNum} ${month}`,
    dayOfWeek: DAY_ABBREV_MAP[dayAbbrev] || dayAbbrev,
    time,
    spots,
    isNocturne,
    isFull: spots === 0,
    category,
    ageGroup,
    youthGroup,
    isWaitlist,
    rawText: text,
    id
  };
}

// src/scraping/scraper.mjs
async function scrapeTournaments(browser, subdomain) {
  const page = await browser.newPage();
  try {
    const baseUrl = await login(page, subdomain);
    console.log(`[${subdomain}] Go to events page`);
    await page.goto(`${baseUrl}/appli/\xC9v\xE8nements`);
    await page.waitForSelector(
      "app-evenements .w-100.contain app-input-search"
    );
    const tournamentsDivs = await page.$$(
      "app-evenements .w-100.contain app-input-search ~ div.mb-20"
    );
    if (tournamentsDivs.length === 0) {
      console.log(`[${subdomain}] No tournament divs found`);
      await sendAdminNotification(
        `[Check Tournaments] No tournaments found on ${subdomain}`,
        `<p>No tournament elements found on <strong>${subdomain}</strong>. The selector may have changed.</p>`
      );
    }
    const tournaments = await Promise.all(
      tournamentsDivs.map(async (tournamentDiv) => {
        try {
          const elementData = await tournamentDiv.evaluate((el) => {
            if (!el) return null;
            return {
              innerText: el.innerText || "",
              spots: el.querySelector("div.fd-column.ai-end > p")?.innerText || null,
              hasButton: el.querySelector("div.fl.jc-center .button") !== null
            };
          });
          if (!elementData) return null;
          return parseTournament(elementData, subdomain);
        } catch (error) {
          console.error(`[${subdomain}] Error parsing tournament:`, error);
          return null;
        }
      })
    ).then((results) => results.filter(Boolean));
    console.log(`[${subdomain}] Found ${tournaments.length} tournaments`);
    return tournaments;
  } catch (error) {
    console.error(`[${subdomain}] Scraping failed:`, error);
    throw error;
  } finally {
    await page.close();
  }
}

// src/storage/dynamodb.mjs
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand
} from "@aws-sdk/client-dynamodb";
var TABLE_NAME = "tournaments";
function createDynamoClient() {
  const config = getConfig();
  const isProduction2 = getIsProduction();
  return new DynamoDBClient({
    region: config.awsRegion,
    ...(isLocal || !isProduction2) && {
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    }
  });
}
async function getTournamentIds(client, subdomain) {
  try {
    const { Items } = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "id = :id",
        ExpressionAttributeValues: {
          ":id": { S: `latest-${subdomain}` }
        }
      })
    );
    return JSON.parse(Items?.[0]?.tournaments?.S || "[]");
  } catch (error) {
    console.log(
      `[${subdomain}] No previous tournaments in DB (first run or error):`,
      error.message
    );
    return [];
  }
}
async function putTournamentIds(client, subdomain, tournamentIds) {
  await client.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        id: { S: `latest-${subdomain}` },
        tournaments: { S: JSON.stringify(tournamentIds) }
      }
    })
  );
  console.log(`[${subdomain}] DB updated`);
}
async function updateDatabase(client, updates) {
  const config = getConfig();
  if (config.debug) {
    console.log("DEBUG mode: skipping DB updates");
    return;
  }
  if (updates.length === 0) {
    return;
  }
  console.log(`Updating DB for ${updates.length} subdomain(s)`);
  for (const update of updates) {
    await putTournamentIds(client, update.subdomain, update.tournamentIds);
  }
}

// src/filtering/rules.mjs
var isNotFull = (t) => !t.isFull;
var isMen = (t) => t.category === "homme";
var isNotSenior = (t) => t.ageGroup !== "+45";
var isNotYouth = (t) => t.youthGroup === null;
var isTargetLevel = (t) => TARGET_LEVELS.includes(t.level);
var isNotWaitlist = (t) => !t.isWaitlist;
var defaultFilters = [
  isNotFull,
  isMen,
  isNotSenior,
  isNotYouth,
  isTargetLevel,
  isNotWaitlist
];

// src/filtering/index.mjs
function applyFilters(tournaments) {
  return tournaments.filter((t) => defaultFilters.every((filter) => filter(t)));
}
function findNewTournaments(currentTournaments, previousIds) {
  const previousIdSet = new Set(previousIds);
  const filtered = applyFilters(currentTournaments);
  return filtered.filter((t) => {
    const wasKnown = previousIdSet.has(t.id);
    const wasFullId = t.id + "_full";
    const wasFullBefore = previousIdSet.has(wasFullId);
    return !wasKnown || wasFullBefore;
  }).map((tournament) => {
    const wasFullId = tournament.id + "_full";
    const isFreedSpot = previousIds.includes(wasFullId);
    return { tournament, isFreedSpot };
  });
}
function getTournamentIdsForStorage(tournaments) {
  return tournaments.map((t) => t.isFull ? t.id + "_full" : t.id);
}

// src/email/transport.mjs
import nodemailer2 from "nodemailer";
var transporter = null;
function getTransporter() {
  if (!transporter) {
    const config = getConfig();
    transporter = nodemailer2.createTransport({
      service: "gmail",
      auth: {
        user: SENDER_EMAIL,
        pass: config.emailAppPass
      }
    });
  }
  return transporter;
}

// src/email/formatter.mjs
function formatTournament(tournament, options = {}) {
  const parts = [];
  if (tournament.isNocturne) {
    parts.push("<b>nocturne</b>");
  }
  const day = WEEKEND_DAYS.includes(tournament.dayOfWeek) ? `<b>${tournament.dayOfWeek}</b>` : tournament.dayOfWeek;
  parts.push(`${day} ${tournament.date}`);
  parts.push(tournament.level);
  parts.push(tournament.time);
  parts.push(`${tournament.spots} places`);
  const prefix = options.isFreedSpot ? "Places lib\xE9r\xE9es: " : "";
  return prefix + parts.filter(Boolean).join(" ");
}
function formatEmailHtml(tournamentsBySubdomain) {
  const sections = [];
  for (const [subdomain, tournaments] of tournamentsBySubdomain) {
    const tournamentHtml = tournaments.map(
      ({ tournament, isFreedSpot }) => `<p style="font-size:1rem;line-height:1.5rem">${formatTournament(tournament, { isFreedSpot })}</p>`
    ).join("");
    sections.push(`<h2>${subdomain}</h2>${tournamentHtml}`);
  }
  return sections.join("<hr />");
}

// src/email/sender.mjs
async function sendTournamentEmail(tournamentsBySubdomain) {
  const config = getConfig();
  const transporter2 = getTransporter();
  const allTournaments = [...tournamentsBySubdomain.values()].flat();
  const onlyFreedSpots = allTournaments.every((t) => t.isFreedSpot);
  const mailOptions = {
    from: SENDER_EMAIL,
    to: config.mailingList.join(", "),
    subject: onlyFreedSpots ? "Places lib\xE9r\xE9es" : "Nouveaux tournois",
    html: formatEmailHtml(tournamentsBySubdomain)
  };
  const sentMessageInfo = await transporter2.sendMail(mailOptions);
  console.log("Email sent:", sentMessageInfo);
}

// src/handler.mjs
async function handler() {
  console.log("Handler started");
  let browser;
  try {
    browser = await launchBrowser();
    const dynamoDbClient = createDynamoClient();
    const processResults = await Promise.allSettled(
      SUBDOMAINS.map(
        (subdomain) => processSubdomain(browser, subdomain, dynamoDbClient)
      )
    );
    const newTournamentsBySubdomain = /* @__PURE__ */ new Map();
    const dbUpdates = [];
    for (const result of processResults) {
      if (result.status === "rejected") {
        console.error("Failed to process subdomain:", result.reason);
        continue;
      }
      const { subdomain, newTournaments, tournamentIds, needsDbUpdate } = result.value;
      if (newTournaments.length > 0) {
        newTournamentsBySubdomain.set(subdomain, newTournaments);
      }
      if (needsDbUpdate) {
        dbUpdates.push({ subdomain, tournamentIds });
      }
    }
    const totalNew = [...newTournamentsBySubdomain.values()].flat().length;
    if (totalNew === 0) {
      console.log("No new tournaments after filtering");
    } else {
      await sendTournamentEmail(newTournamentsBySubdomain);
    }
    await updateDatabase(dynamoDbClient, dbUpdates);
    console.log("Done checking new tournois with success");
    return {
      statusCode: 200,
      body: JSON.stringify(
        totalNew > 0 ? "Done checking new tournois" : "No new tournaments"
      )
    };
  } catch (error) {
    console.error("Handler error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify(`Error: ${error.message}`)
    };
  } finally {
    if (browser) {
      await browser.close();
      console.log("Browser closed");
    }
  }
}
async function processSubdomain(browser, subdomain, dynamoDbClient) {
  const tournaments = await scrapeTournaments(browser, subdomain);
  const previousIds = await getTournamentIds(dynamoDbClient, subdomain);
  const currentIds = getTournamentIdsForStorage(tournaments);
  const newTournaments = findNewTournaments(tournaments, previousIds);
  const needsDbUpdate = JSON.stringify(currentIds.sort()) !== JSON.stringify(previousIds.sort());
  console.log(
    `[${subdomain}] ${newTournaments.length} new tournaments, DB update: ${needsDbUpdate}`
  );
  return {
    subdomain,
    newTournaments,
    tournamentIds: currentIds,
    needsDbUpdate
  };
}
export {
  handler
};
