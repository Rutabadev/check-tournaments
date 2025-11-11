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

/**
 * @param {number} ms
 * @returns
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    /**
     * @type {import("puppeteer-core").Page}
     */
    const page = await browser.newPage();

    // Login
    try {
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
      // This is needed for the next operation to not timeout
      await page.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: 10000,
      });
      console.log("Login done");
    } catch (error) {
      console.error("Login failed:", error);
      throw new Error("Login process failed");
    }

    // Accueil
    try {
      await page.waitForSelector("#tab-allevents");
      await page.click("#tab-allevents");
      await page.waitForFunction(
        () => !!document.querySelector('a[href^="/membre/events/event.html"]')
      );
      await page.click('a[href^="/membre/events/event.html"]');
    } catch (error) {
      console.error("Navigation to events failed:", error);
      throw new Error("Failed to navigate to events page");
    }

    // Tournoi
    console.log("Go to tournoi page");
    try {
      await page.waitForSelector(".card-body");
      await wait(200);

      const tournoisDivs = await page.$$(".card-body");
      console.log("found tournois", tournoisDivs.length);

      if (tournoisDivs.length === 0) {
        console.log("No tournaments found");
        return {
          statusCode: 200,
          body: JSON.stringify("No tournaments available"),
        };
      }

      const tournois = await Promise.all(
        tournoisDivs.map(async (tournoiDiv) => {
          try {
            const [tournoiTitle, tournoiInfo, tournoiId] = (
              await Promise.all([
                tournoiDiv.$eval(
                  ".card-title",
                  (node) => /** @type {HTMLElement} */ (node).innerText
                ),
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
              id: `${tournoiTitle}${tournoiId}${
                tournoiInfo.toLowerCase().includes("complet") ? "_complet" : ""
              }`,
            };
          } catch (error) {
            console.error("Error parsing tournament data:", error);
            return null;
          }
        })
      ).then((results) => results.filter(Boolean)); // Filter out nulls
      console.log("tournois", tournois);

      const serializedTournoisId = JSON.stringify(
        tournois.map((tournoi) => tournoi.id)
      );

      const dynamoDbClient = new DynamoDBClient({
        region: process.env.AWS_REGION,
        ...((isLocal || !isProduction) && {
          credentials: {
            accessKeyId: process.env.ACCESS_KEY_ID,
            secretAccessKey: process.env.SECRET_ACCESS_KEY,
          },
        }),
      });

      const { Items } = await dynamoDbClient.send(
        new QueryCommand({
          TableName: "tournaments",
          KeyConditionExpression: "id = :id",
          ExpressionAttributeValues: {
            ":id": { S: "latest" },
          },
        })
      );

      const serializedLatestTournamentsId = process.env.DEBUG
        ? "[]"
        : Items?.[0]?.tournaments?.S || "[]";

      if (serializedLatestTournamentsId === serializedTournoisId) {
        console.log("No new tournaments from last time");
        return {
          statusCode: 200,
          body: JSON.stringify("No new changes in tournaments"),
        };
      }

      if (!process.env.DEBUG) {
        await dynamoDbClient.send(
          new PutItemCommand({
            TableName: "tournaments",
            Item: {
              id: { S: "latest" },
              tournaments: { S: serializedTournoisId },
            },
          })
        );
        console.log("updated db");
      }

      const latestTournaments = JSON.parse(serializedLatestTournamentsId);
      console.log("latestTournamentsArray", latestTournaments);

      const newTournaments = tournois
        .filter((tournoi) => !latestTournaments.includes(tournoi.id))
        .filter((tournoi) => !tournoi.data.toLowerCase().includes("complet"))
        .filter((tournoi) => !tournoi.data.toLowerCase().includes("femme"))
        .filter((tournoi) => !tournoi.data.toLowerCase().includes("mixte"))
        .filter((tournoi) =>
          ["p50", "p100", "p250"]
            .map((level) => `${level} `)
            .some((level) => tournoi.data.toLowerCase().includes(level))
        )
        .map((tournoi) => {
          // notify if tournoi was previously full but now has spots
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

      const onlyFreedSpots = newTournaments.every((tournoi) =>
        tournoi.data.toLowerCase().includes("places libérées")
      );

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: "izi.rutabaga@gmail.com",
          pass: EMAIL_APP_PASS, // app-specific password since 2FA is enabled
        },
      });
      const dayMap = [
        "dimanche",
        "lundi",
        "mardi",
        "mercredi",
        "jeudi",
        "vendredi",
        "<b>samedi</b>",
      ];
      const mailOptions = {
        from: "izi.rutabaga@gmail.com",
        to: mailingList.join(", "),
        subject: onlyFreedSpots ? "Places libérées" : "Nouveaux tournois",
        html: `
        ${newTournaments
          .map(
            (newTournoi) =>
              `<p style="font-size:1rem;line-height:1.5rem">${(() => {
                const data = newTournoi.data;
                let processed = data.replace(
                  /.*(\d{2}\/\d{2}\/\d{4}).*/,
                  (all, frDate) => {
                    const [day, month, year] = frDate.split("/");
                    const date = `${month}/${day}/${year}`;
                    const allNoDate = all.replace(`${frDate} `, "");
                    return `${
                      dayMap[new Date(date).getDay()]
                    } ${frDate} ${allNoDate}`;
                  }
                );
                const timeMatch = processed.match(/(\d{2})h\d{2}/);
                const isNocturnal =
                  (timeMatch && parseInt(timeMatch[1]) >= 18) ||
                  processed.toLowerCase().includes("nocturne");
                if (isNocturnal) {
                  processed = processed.replace(
                    /^(\S+) /,
                    "$1 <b>nocturne</b> "
                  );
                }
                return processed;
              })()}</p>`
          )
          .join("")}
        `,
      };
      const sentMessageInfo = await transporter.sendMail(mailOptions);
      console.log("Email sent:", sentMessageInfo);
    } catch (error) {
      console.error("Tournament processing failed:", error);
      throw new Error("Failed to process tournaments");
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
