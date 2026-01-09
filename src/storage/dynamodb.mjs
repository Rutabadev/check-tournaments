import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { isLocal, getConfig } from "../config/index.mjs";
import { getIsProduction } from "../scraping/browser.mjs";

const TABLE_NAME = "tournaments";

export function createDynamoClient() {
  const config = getConfig();
  const isProduction = getIsProduction();

  return new DynamoDBClient({
    region: config.awsRegion,
    ...((isLocal || !isProduction) && {
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  });
}

/**
 * @typedef {import("../scraping/parser.mjs").Tournament} Tournament
 */

/**
 * Get tournaments from DB for a subdomain
 * @param {DynamoDBClient} client
 * @param {string} subdomain
 * @returns {Promise<Tournament[]>}
 */
export async function getTournaments(client, subdomain) {
  try {
    const { Items } = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "id = :id",
        ExpressionAttributeValues: {
          ":id": { S: `latest-${subdomain}` },
        },
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

/**
 * Save tournaments to DB for a subdomain
 * @param {DynamoDBClient} client
 * @param {string} subdomain
 * @param {Tournament[]} tournaments
 */
export async function putTournaments(client, subdomain, tournaments) {
  await client.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        id: { S: `latest-${subdomain}` },
        tournaments: { S: JSON.stringify(tournaments) },
      },
    })
  );
  console.log(`[${subdomain}] DB updated`);
}

/**
 * Update database for all subdomains with changes
 * @param {DynamoDBClient} client
 * @param {{subdomain: string, tournaments: Tournament[]}[]} updates
 */
export async function updateDatabase(client, updates) {
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
    await putTournaments(client, update.subdomain, update.tournaments);
  }
}
