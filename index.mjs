import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
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
        const [tournoiInfo, tournoiId] = (
          await Promise.all([
            tournoiDiv.evaluate(
              (node) => /** @type {HTMLElement} */ (node).innerText
            ),
            tournoiDiv.$eval(
              ".row",
              (node) => /** @type {HTMLElement} */ (node).innerText
            ),
          ])
        ).map((text) => text.replace(/\n/g, " "));
        return {
          data: tournoiInfo,
          id: `${tournoiId}${
            tournoiInfo.toLowerCase().includes("complet") ? "_complet" : ""
          }`,
        };
      })
    );
    console.log("tournois", tournois);

    const serializedTournoisId = JSON.stringify(
      tournois.map((tournoi) => tournoi.id)
    );

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
        body: JSON.stringify("No new changes in tournaments"),
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
      .filter((tournoi) => !latestTournaments.includes(tournoi.id))
      .filter((tournoi) => !tournoi.data.toLowerCase().includes("complet"))
      .filter((tournoi) => !tournoi.data.toLowerCase().includes("femme"))
      .filter((tournoi) =>
        // p25 will match p250 as well
        ["p25", "p100"].some((level) =>
          tournoi.data.toLowerCase().includes(level)
        )
      )
      .map((tournoi) => {
        // notify if tounoi was previously full but now has spots
        if (latestTournaments.includes(`${tournoi.id}_complet`)) {
          return { ...tournoi, data: `Places libérées : ${tournoi.data}` };
        }
        return tournoi;
      });
    console.log("newTournaments", newTournaments);

    if (newTournaments.length === 0) {
      console.log("No new tournaments after filtering");
      return {
        statusCode: 200,
        body: JSON.stringify("No new tournaments"),
      };
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "izi.rutabaga@gmail.com",
        pass: EMAIL_APP_PASS, // app-specific password since 2FA is enabled
      },
    });
    const mailOptions = {
      from: "izi.rutabaga@gmail.com",
      to: mailingList.join(", "),
      subject: "New tournaments",
      html: `
        <h1>New tournaments</h1>
        ${newTournaments
          .map(
            (newTournoi) =>
              `<p style="font-size:1rem;line-height:1.5rem">${newTournoi.data}</p>`
          )
          .join("")}
        `,
    };
    const sentMessageInfo = await transporter.sendMail(mailOptions);
    console.log("Email sent:", sentMessageInfo);
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
