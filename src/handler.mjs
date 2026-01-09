import { SUBDOMAINS } from "./config/index.mjs";
import { launchBrowser } from "./scraping/browser.mjs";
import { scrapeTournaments } from "./scraping/scraper.mjs";
import {
  createDynamoClient,
  getTournaments,
  updateDatabase,
} from "./storage/dynamodb.mjs";
import { findNewTournaments } from "./filtering/index.mjs";
import { sendTournamentEmail } from "./email/sender.mjs";

export async function handler() {
  console.log("Handler started");
  let browser;

  try {
    browser = await launchBrowser();
    const dynamoDbClient = createDynamoClient();

    const processResults = await Promise.allSettled(
      SUBDOMAINS.map((subdomain) =>
        processSubdomain(browser, subdomain, dynamoDbClient)
      )
    );

    const newTournamentsBySubdomain = new Map();
    const dbUpdates = [];

    for (const result of processResults) {
      if (result.status === "rejected") {
        console.error("Failed to process subdomain:", result.reason);
        continue;
      }

      const { subdomain, newTournaments, tournaments, needsDbUpdate } =
        result.value;

      if (newTournaments.length > 0) {
        newTournamentsBySubdomain.set(subdomain, newTournaments);
      }

      if (needsDbUpdate) {
        dbUpdates.push({ subdomain, tournaments });
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
      ),
    };
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
}

/**
 * Process a single subdomain
 * @param {import("puppeteer-core").Browser} browser
 * @param {string} subdomain
 * @param {import("@aws-sdk/client-dynamodb").DynamoDBClient} dynamoDbClient
 */
async function processSubdomain(browser, subdomain, dynamoDbClient) {
  const allTournaments = await scrapeTournaments(browser, subdomain);
  const tournaments = allTournaments.filter((t) => !t.isWaitlist);
  const previousTournaments = await getTournaments(dynamoDbClient, subdomain);
  const newTournaments = findNewTournaments(tournaments, previousTournaments);

  const needsDbUpdate =
    JSON.stringify(tournaments) !== JSON.stringify(previousTournaments);

  console.log(
    `[${subdomain}] ${newTournaments.length} new tournaments, DB update: ${needsDbUpdate}`
  );

  return {
    subdomain,
    newTournaments,
    tournaments,
    needsDbUpdate,
  };
}
