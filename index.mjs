import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";

const mailingList = process.env.MAILING_LIST.split(",");

/**
 * @param {number} ms
 * @returns
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const handler = async () => {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
  });
  /**
   * @type {import("puppeteer-core").Page}
   */
  let page;
  try {
    page = await browser.newPage();

    // Login
    await page.goto("https://toulousepadelclub.gestion-sports.com");
    console.log("Go to login page");

    await page.type("input[type=text][name=email]", process.env.EMAIL);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await wait(2000);
    await page.keyboard.press("Tab");
    await page.keyboard.type(process.env.PASSWORD);
    // Get a button with text "Connecter" and click it
    await page.$$eval("button", (buttons) => {
      buttons
        .filter((button) =>
          button.innerText.toLowerCase().includes("connecter")
        )[0]
        .click();
    });

    // Accueil
    await Promise.all([
      page.waitForNavigation(),
      page.waitForSelector('a[href^="/membre/events/event.html"]'),
    ]);
    console.log("Login done");
    await wait(2000);
    await page.click('a[href^="/membre/events/event.html"]');
    console.log("Go to tournoi page");

    // Tournoi
    await page.waitForSelector(".card-body"), await wait(200);

    const tournoisDivs = await page.$$(".card-body");
    console.log("found tournois", tournoisDivs.length);

    const tournois = await Promise.all(
      tournoisDivs.map(async (tournoiDiv) => {
        const [tournoiInfo, tournoiId] = (await Promise.all([
          await tournoiDiv.evaluate(node => node.innerText),
          await tournoiDiv.$eval(".row", node => node.innerText),
        ])).map(text => text.replace(/\n/g, " "));
        return {
            data: tournoiInfo,
            id: tournoiId,
          }
      })
    );

    console.log("tournois", tournois);

    const serializedTournoisId = JSON.stringify(tournois.map(tournoi => tournoi.id));

    const dynamoDbClient = new DynamoDBClient({});

    const { Items } = await dynamoDbClient.send(
      new QueryCommand({
        TableName: "tournaments",
        KeyConditionExpression: "id = :id",
        ExpressionAttributeValues: {
          ":id": { S: "latest" },
        },
      })
    );

    const serializedLatestTournamentsId = Items?.[0]?.tournaments?.S || "[]";

    if (serializedLatestTournamentsId === serializedTournoisId) {
      console.log("No new tournaments from last time");
      return {
        statusCode: 200,
        body: JSON.stringify("No new tournaments"),
      };
    }

    await dynamoDbClient.send(
      new PutItemCommand({
        TableName: "tournaments",
        Item: {
          id: { S: "latest" },
          tournaments: { S: serializedTournoisId },
        },
      })
    );

    const latestTournaments = JSON.parse(serializedLatestTournamentsId);
    console.log("latestTournamentsArray", latestTournaments);

    const newTournaments = tournois
      .filter((tournoi) => !latestTournaments.includes(tournoi))
      .filter((tournoi) => !tournoi.data.toLowerCase().includes("complet"))
      .filter((tournoi) =>
        ["p100", "p250"].some((level) => tournoi.data.toLowerCase().includes(level))
      );

    console.log("newTournaments", newTournaments);

    if (newTournaments.length === 0) {
      console.log("No new tournaments after filtering");
      return {
        statusCode: 200,
        body: JSON.stringify("No new tournaments"),
      };
    }

    const ses = new SESClient({});
    await ses.send(
      new SendEmailCommand({
        Destination: {
          ToAddresses: mailingList,
        },
        Message: {
          Body: {
            Html: {
              Charset: "UTF-8",
              Data: `
              <h1>New tournaments</h1>
              <p>${newTournaments.join("<br />")}</p>
              `,
            },
          },
          Subject: {
            Charset: "UTF-8",
            Data: "New tournaments",
          },
        },
        Source: "izi.rutabaga@gmail.com",
      })
    );
  } catch (error) {
    throw error;
  }
  await browser.close();
  console.log("Done checking new tournois with success");
  return {
    statusCode: 200,
    body: JSON.stringify("Done checking new tournois"),
  };
};
