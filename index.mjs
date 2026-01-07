const isLocal = process.env.NODE_ENV === "local";
let puppeteer, chromium;
let isProduction = false;
if (isLocal) {
  puppeteer = (await import("puppeteer")).default;
} else {
  try {
    await import("dotenv/config");
  } catch {
    // dotenv not available, assume production environment
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
import nodemailer from "nodemailer";
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";

const { MAILING_LIST, EMAIL, PASSWORD, EMAIL_APP_PASS } = process.env;

if (!MAILING_LIST || !EMAIL || !EMAIL_APP_PASS || !PASSWORD) {
  throw new Error(
    "Missing env variables, required: MAILING_LIST, EMAIL, PASSWORD, EMAIL_APP_PASS"
  );
}

const mailingList = MAILING_LIST.split(",");
const SUBDOMAINS = [
  "toulousepadelclub",
  "toppadel",
  "acepadelclub",
  "the-country-club-toulouse",
];

/**
 * @param {number} ms
 * @returns
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Scrape tournaments for a given subdomain
 * @param {import("puppeteer-core").Browser} browser
 * @param {string} subdomain
 * @returns {Promise<{stripped: string, full: string, subdomain: string}[]>}
 */
async function scrapeTournaments(browser, subdomain) {
  const page = await browser.newPage();
  const baseUrl = `https://${subdomain}.gestion-sports.com`;

  try {
    await page.goto(baseUrl);
    console.log(`[${subdomain}] Go to login page`);

    await page.type("input[type=text][name=email]", EMAIL);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await wait(2000);
    await page.keyboard.press("Tab");
    await page.keyboard.type(PASSWORD);
    await page.$$eval("button", (buttons) => {
      buttons
        .filter((button) =>
          button.innerText.toLowerCase().includes("connecter")
        )[0]
        .click();
    });
    await page.waitForNavigation({
      waitUntil: "networkidle0",
      timeout: 10000,
    });
    console.log(`[${subdomain}] Login done`);
  } catch (error) {
    console.error(`[${subdomain}] Login failed:`, error);
    throw new Error(`Login failed for ${subdomain}`);
  }

  // Close welcome popup (optional, may not always appear)
  try {
    console.log(`[${subdomain}] Close welcome popup`);
    const closePopupButton = await page.waitForSelector(
      "app-welcome-popup button",
      { timeout: 2000 }
    );
    if (closePopupButton) {
      await closePopupButton.click();
    }
  } catch (error) {
    console.log(
      `[${subdomain}] Welcome popup not found (this is okay, continuing...)`
    );
    // Notify admin about missing popup
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: "izi.rutabaga@gmail.com",
          pass: EMAIL_APP_PASS,
        },
      });
      await transporter.sendMail({
        from: "izi.rutabaga@gmail.com",
        to: "etienner37@gmail.com",
        subject: `[Check Tournaments] No popup found on ${subdomain}`,
        html: `<p>The welcome popup was not found when scraping <strong>${subdomain}</strong>. This may indicate a site change or issue with the scraper.</p>`,
      });
    } catch (emailError) {
      console.error(
        `[${subdomain}] Failed to send popup notification email:`,
        emailError
      );
    }
  }

  // Evenements page navigation
  try {
    console.log(`[${subdomain}] Go to reservation page`);
    await page.goto(`${baseUrl}/appli/Évènements`);
  } catch (error) {
    console.error(`[${subdomain}] Navigation failed:`, error);
    throw new Error(`Failed to navigate for ${subdomain}`);
  }

  await page.waitForSelector("app-evenements .w-100.contain app-input-search");
  const tournoisDivs = await page.$$(
    "app-evenements .w-100.contain app-input-search ~ div.mb-20"
  );

  const tournoisFull = await Promise.all(
    tournoisDivs.map(async (tournoiDiv) => {
      try {
        const tournoiInfo = await tournoiDiv.evaluate(
          (node) => /** @type {HTMLElement} */ (node).innerText
        );
        const tournoiInfoProcessed = tournoiInfo.replace(/\n/g, " ");
        const slotsSectionMatch = tournoiInfoProcessed.match(
          /\d{2}h\d{2}\s*-\s*\d{2}h\d{2}\s+(.+?)(?:\s+Je m'inscris)?$/i
        );
        const slotsSection = slotsSectionMatch ? slotsSectionMatch[1] : "";
        const firstNumberMatch = slotsSection.match(/^(\d+)/);
        const isFull = firstNumberMatch && firstNumberMatch[1] === "0";

        const tournoiWithoutSlots = tournoiInfoProcessed
          .replace(/(\d{2}h\d{2})\s+.+?(?:\s+Je m'inscris)?$/i, "$1")
          .replace(/\s+/g, " ")
          .trim();

        return {
          stripped: `${tournoiWithoutSlots}${isFull ? "_complet" : ""}`,
          full: tournoiInfoProcessed,
          subdomain,
        };
      } catch (error) {
        console.error(`[${subdomain}] Error parsing tournament:`, error);
        return null;
      }
    })
  ).then((results) => results.filter(Boolean));

  console.log(`[${subdomain}] Found ${tournoisFull.length} tournaments`);
  await page.close();
  return tournoisFull;
}

/**
 * Process tournaments for a subdomain: scrape, fetch DB, compare, filter
 * @param {import("puppeteer-core").Browser} browser
 * @param {string} subdomain
 * @param {DynamoDBClient} dynamoDbClient
 * @returns {Promise<{subdomain: string, newTournaments: string[], currentTournaments: string[], needsDbUpdate: boolean}>}
 */
async function processTournament(browser, subdomain, dynamoDbClient) {
  // Scrape tournaments
  const tournoisFull = await scrapeTournaments(browser, subdomain);
  const currentTournaments = tournoisFull.map((t) => t.stripped);

  // Fetch latest from DB
  let latestTournaments = [];
  try {
    const { Items } = await dynamoDbClient.send(
      new QueryCommand({
        TableName: "tournaments",
        KeyConditionExpression: "id = :id",
        ExpressionAttributeValues: {
          ":id": { S: `latest-${subdomain}` },
        },
      })
    );
    latestTournaments = JSON.parse(Items?.[0]?.tournaments?.S || "[]");
  } catch (error) {
    console.log(
      `[${subdomain}] No previous tournaments in DB (first run or error):`,
      error.message
    );
  }

  // Create map from stripped to full for email formatting
  const fullTournoisMap = new Map(
    tournoisFull.map((t) => [t.stripped, t.full])
  );

  // Filter new tournaments
  const newTournaments = currentTournaments
    .filter((tournoi) => !latestTournaments.includes(tournoi))
    .filter((tournoi) => !tournoi.endsWith("_complet"))
    .filter((tournoi) => !tournoi.toLowerCase().includes("femme"))
    .filter((tournoi) => !tournoi.toLowerCase().includes("mixte"))
    .filter((tournoi) => !tournoi.toLowerCase().match(/\+\s*45/))
    .filter((tournoi) => !tournoi.toLowerCase().includes("liste d'attente"))
    .filter((tournoi) =>
      ["p50", "p100", "p250"]
        .map((level) => `${level} `)
        .some((level) => tournoi.toLowerCase().includes(level))
    )
    .map((tournoi) => {
      // Notify if tournoi was previously full but now has spots
      if (latestTournaments.includes(`${tournoi}_complet`)) {
        return `Places libérées : ${tournoi}`;
      }
      return tournoi;
    });

  // Check if DB update needed
  const needsDbUpdate =
    JSON.stringify(currentTournaments) !== JSON.stringify(latestTournaments);

  return {
    subdomain,
    newTournaments,
    currentTournaments,
    needsDbUpdate,
    fullTournoisMap,
  };
}

export const handler = async () => {
  console.log("Handler started");
  let browser;
  try {
    if (isLocal) {
      browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    } else {
      browser = await puppeteer.launch({
        args: [
          ...chromium.args,
          "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
          "--disable-blink-features=AutomationControlled",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
        ],
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
    }
    // Initialize DynamoDB client
    const dynamoDbClient = new DynamoDBClient({
      region: process.env.AWS_REGION,
      ...((isLocal || !isProduction) && {
        credentials: {
          accessKeyId: process.env.ACCESS_KEY_ID,
          secretAccessKey: process.env.SECRET_ACCESS_KEY,
        },
      }),
    });

    // Process all subdomains in parallel
    const processResults = await Promise.allSettled(
      SUBDOMAINS.map((subdomain) =>
        processTournament(browser, subdomain, dynamoDbClient)
      )
    );

    // Collect results
    const newTournamentsBySubdomain = {};
    const updatesToMake = [];
    const fullTournoisMaps = {};

    for (const result of processResults) {
      if (result.status === "rejected") {
        console.error(`Failed to process subdomain:`, result.reason);
        continue;
      }

      const {
        subdomain,
        newTournaments,
        currentTournaments,
        needsDbUpdate,
        fullTournoisMap,
      } = result.value;

      if (newTournaments.length > 0) {
        newTournamentsBySubdomain[subdomain] = newTournaments;
      }

      if (needsDbUpdate) {
        updatesToMake.push({
          subdomain,
          tournaments: currentTournaments,
        });
      }

      fullTournoisMaps[subdomain] = fullTournoisMap;
    }

    console.log("newTournamentsBySubdomain", newTournamentsBySubdomain);

    const newTournaments = Object.values(newTournamentsBySubdomain).flat();

    if (newTournaments.length === 0) {
      console.log("No new tournaments after filtering");
      // Still update DB for successful subdomains with changes
      if (!process.env.DEBUG && updatesToMake.length > 0) {
        console.log(
          `Updating DB for ${updatesToMake.length} subdomain(s) with tournament changes`
        );
        for (const update of updatesToMake) {
          await dynamoDbClient.send(
            new PutItemCommand({
              TableName: "tournaments",
              Item: {
                id: { S: `latest-${update.subdomain}` },
                tournaments: { S: JSON.stringify(update.tournaments) },
              },
            })
          );
          console.log(`[${update.subdomain}] DB updated`);
        }
      }
      return {
        statusCode: 200,
        body: JSON.stringify("No new tournaments"),
      };
    }

    const onlyFreedSpots = newTournaments.every((tournoi) =>
      tournoi.toLowerCase().includes("places libérées")
    );

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "izi.rutabaga@gmail.com",
        pass: EMAIL_APP_PASS, // app-specific password since 2FA is enabled
      },
    });
    const dayAbbrevMap = {
      "lun.": "lundi",
      "mar.": "mardi",
      "mer.": "mercredi",
      "jeu.": "jeudi",
      "ven.": "vendredi",
      "sam.": "<b>samedi</b>",
      "dim.": "dimanche",
    };

    /**
     * Format a tournament for email display
     * @param {string} data - Tournament string
     * @param {Map} fullTournoisMap - Map from stripped to full tournament data
     * @returns {string} Formatted tournament HTML
     */
    const formatTournament = (data, fullTournoisMap) => {
      // Extract prefix if present (e.g., "Places libérées : ")
      const prefixMatch = data.match(/^Places libérées\s*:\s*/i);
      const prefix = prefixMatch ? "Places libérées: " : "";
      const cleanData = data.replace(/^Places libérées\s*:\s*/i, "");

      // Extract level (P50, P100, P250)
      const levelMatch = cleanData.match(/(P\d+)/i);
      const level = levelMatch ? levelMatch[1] : "";

      // Extract nocturne
      const nocturneMatchedFromText = cleanData.match(/nocturne/i);

      // Extract remaining slots from the full tournament data
      const fullTournamentData = fullTournoisMap.get(cleanData) || "";
      const spotsMatch = fullTournamentData.match(
        /\d{2}h\d{2}\s+(.+?)(?:\s+Je m'inscris)?$/i
      );
      const spots = spotsMatch ? spotsMatch[1].trim() : "";

      // Extract date and time
      let processedDate = "";
      let timeStr = "";
      const dateMatch = cleanData.match(
        /([A-Za-zÀ-ÿ]{3}\.)\s+(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,4}\.)\s+(\d{2})h(\d{2})/i
      );
      if (dateMatch) {
        const [_fullMatch, dayAbbrev, dayNum, monthAbbrev, hour, min] =
          dateMatch;
        const dayLower = dayAbbrev.toLowerCase();
        const day = dayAbbrevMap[dayLower] || dayLower;

        timeStr = `${hour}h${min}`;

        const timeEndMatch = cleanData.match(
          /(\d{2})h(\d{2})\s*-\s*(\d{2})h(\d{2})/
        );
        if (timeEndMatch) {
          const [, , , endHour, endMin] = timeEndMatch;
          timeStr = `${hour}h${min}-${endHour}h${endMin}`;
        }

        processedDate = `${day} ${dayNum} ${monthAbbrev}`;
      }

      // Check if nocturnal
      const isNocturnal =
        (cleanData.match(/(\d{2})h\d{2}/) &&
          parseInt(cleanData.match(/(\d{2})h\d{2}/)[1]) >= 18) ||
        cleanData.toLowerCase().includes("nocturne");

      // Build final output
      let outputParts = [];
      if (isNocturnal || nocturneMatchedFromText) {
        outputParts.push(`<b>nocturne</b>`);
      }
      outputParts.push(processedDate);
      outputParts.push(level);
      outputParts.push(timeStr);
      outputParts.push(spots);

      const output = outputParts.filter(Boolean).join(" ");
      return prefix + output;
    };

    const mailOptions = {
      from: "izi.rutabaga@gmail.com",
      to: mailingList.join(", "),
      subject: onlyFreedSpots ? "Places libérées" : "Nouveaux tournois",
      html: `
        ${Object.entries(newTournamentsBySubdomain)
          .map(
            ([subdomain, tournaments]) =>
              `<h2>${subdomain}</h2>
              ${tournaments
                .map(
                  (data) =>
                    `<p style="font-size:1rem;line-height:1.5rem">${formatTournament(
                      data,
                      fullTournoisMaps[subdomain]
                    )}</p>`
                )
                .join("")}`
          )
          .join("<hr />")}
        `,
    };
    const sentMessageInfo = await transporter.sendMail(mailOptions);
    console.log("Email sent:", sentMessageInfo);

    // Update DB for all successful subdomains after email sent
    if (!process.env.DEBUG) {
      console.log(
        `Updating DB for ${updatesToMake.length} subdomain(s) with tournament changes`
      );
      for (const update of updatesToMake) {
        await dynamoDbClient.send(
          new PutItemCommand({
            TableName: "tournaments",
            Item: {
              id: { S: `latest-${update.subdomain}` },
              tournaments: { S: JSON.stringify(update.tournaments) },
            },
          })
        );
        console.log(`[${update.subdomain}] DB updated`);
      }
    }
  } catch (error) {
    console.error("Handler error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify(`Error: ${error.message}`),
    };
  } finally {
    if (browser) {
      await browser.close();
      console.log("Browser closed");
    }
  }
  console.log("Done checking new tournois with success");
  return {
    statusCode: 200,
    body: JSON.stringify("Done checking new tournois"),
  };
};
