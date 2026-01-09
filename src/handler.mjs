import { SUBDOMAINS } from "./config/index.mjs";
import { launchBrowser } from "./scraping/browser.mjs";
import { scrapeTournaments } from "./scraping/scraper.mjs";
import {
  createDynamoClient,
  getTournamentIds,
  updateDatabase,
} from "./storage/dynamodb.mjs";
import {
  findNewTournaments,
  getTournamentIdsForStorage,
} from "./filtering/index.mjs";
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

      const { subdomain, newTournaments, tournamentIds, needsDbUpdate } =
        result.value;

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
  const tournaments = await scrapeTournaments(browser, subdomain);
  const previousIds = await getTournamentIds(dynamoDbClient, subdomain);
  const currentIds = getTournamentIdsForStorage(tournaments);
  const newTournaments = findNewTournaments(tournaments, previousIds);

  const needsDbUpdate =
    JSON.stringify(currentIds.sort()) !== JSON.stringify(previousIds.sort());

  console.log(
    `[${subdomain}] ${newTournaments.length} new tournaments, DB update: ${needsDbUpdate}`
  );

  return {
    subdomain,
    newTournaments,
    tournamentIds: currentIds,
    needsDbUpdate,
  };
}
