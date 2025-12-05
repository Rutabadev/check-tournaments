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

    // Close welcome popup
    try {
      console.log("Close welcome popup");
      const closePopupButton = await page.waitForSelector(
        "app-welcome-popup button"
      );
      await closePopupButton.click();
    } catch (error) {
      console.error("Could not close welcome popup", error);
      throw new Error("Failed to close welcome popup");
    }

    // Evenements page navigation
    try {
      console.log("Go to reservation page");
      await page.goto(
        "https://toulousepadelclub.gestion-sports.com/appli/Évènements"
      );
    } catch (error) {
      console.error("Navigation to evenements page failed:", error);
      throw new Error("Failed to navigate to evenements page");
    }

    await page.waitForSelector(
      "app-evenements .w-100.contain app-input-search"
    );
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
          // Full if 0 slots available, match 0/16, 0/12...
          const isFull = tournoiInfoProcessed.match(/\b0\/\d+\s+p\./i);

          // Remove slot counts (e.g., "1/12 p. restantes" or "2/12 p. disponibles") before storing
          const tournoiWithoutSlots = tournoiInfoProcessed
            .replace(/\d+\/\d+\s+p\.\s+\w+/gi, "")
            .replace(/\s+/g, " ")
            .trim();

          return {
            stripped: `${tournoiWithoutSlots}${isFull ? "_complet" : ""}`,
            full: tournoiInfoProcessed,
          };
        } catch (error) {
          console.error("Error parsing tournament data:", error);
          return null;
        }
      })
    ).then((results) => results.filter(Boolean)); // Filter out nulls

    // Create a map from stripped to full for later lookup
    const fullTournoisMap = new Map(
      tournoisFull.map((t) => [t.stripped, t.full])
    );
    const tournois = tournoisFull.map((t) => t.stripped);
    console.log("tournois", tournois);

    try {
      const serializedTournoisId = JSON.stringify(tournois);

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

      const serializedLatestTournamentsId = Items?.[0]?.tournaments?.S || "[]";

      if (serializedLatestTournamentsId === serializedTournoisId) {
        console.log("No new tournaments from last time");
        return {
          statusCode: 200,
          body: JSON.stringify("No new changes in tournaments"),
        };
      }

      // if (!process.env.DEBUG) {
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
      // }

      const latestTournaments = JSON.parse(serializedLatestTournamentsId);
      console.log("latestTournamentsArray", latestTournaments);

      const newTournaments = tournois
        .filter((tournoi) => !latestTournaments.includes(tournoi))
        .filter((tournoi) => !tournoi.endsWith("_complet")) // Filter out full tournaments
        .filter((tournoi) => !tournoi.toLowerCase().includes("femme"))
        .filter((tournoi) => !tournoi.toLowerCase().includes("mixte"))
        .filter((tournoi) => !tournoi.toLowerCase().includes("+45"))
        .filter((tournoi) =>
          ["p50", "p100", "p250"]
            .map((level) => `${level} `)
            .some((level) => tournoi.toLowerCase().includes(level))
        )
        .map((tournoi) => {
          // notify if tournoi was previously full but now has spots
          if (latestTournaments.includes(`${tournoi}_complet`)) {
            return `Places libérées : ${tournoi}`;
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
      const mailOptions = {
       from: "izi.rutabaga@gmail.com",
       to: mailingList.join(", "),
       subject: onlyFreedSpots ? "Places libérées" : "Nouveaux tournois",
       html: `
       ${newTournaments
         .map(
           (data) =>
             `<p style="font-size:1rem;line-height:1.5rem">${(() => {
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
               const spotsMatch = fullTournamentData.match(/(\d+\/\d+\s+p\.\s+\w+)/i);
               const spots = spotsMatch ? spotsMatch[1] : "";

               // Extract date and time (format: "Day. DD Month.  HHhMM - HHhMM")
               let processedDateTime = "";
               const dateMatch = cleanData.match(
                 /([A-Za-zÀ-ÿ]{3}\.)\s+(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,4}\.)\s+(\d{2})h(\d{2})/i
               );
               if (dateMatch) {
                 const [
                   _fullMatch,
                   dayAbbrev,
                   dayNum,
                   monthAbbrev,
                   hour,
                   min,
                 ] = dateMatch;
                 const dayLower = dayAbbrev.toLowerCase();
                 const day = dayAbbrevMap[dayLower] || dayLower;

                 let timeStr = `${hour}h${min}`;

                 // Extract end time if present (format: " - HHhMM")
                 const timeEndMatch = cleanData.match(
                   /(\d{2})h(\d{2})\s*-\s*(\d{2})h(\d{2})/
                 );
                 if (timeEndMatch) {
                   const [, , , endHour, endMin] = timeEndMatch;
                   timeStr = `${hour}h${min}-${endHour}h${endMin}`;
                 }

                 processedDateTime = `${day} ${dayNum} ${monthAbbrev} ${timeStr}`;
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
               outputParts.push(processedDateTime, level);
               outputParts.push(spots);

               const output = outputParts.filter(Boolean).join(" ");
               return prefix + output;
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
