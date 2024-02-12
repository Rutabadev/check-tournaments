import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import nodemailer from "nodemailer";
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const { MAILING_LIST, EMAIL, PASSWORD, EMAIL_APP_PASS } = process.env;

if (!MAILING_LIST || !EMAIL || !EMAIL_APP_PASS || !PASSWORD) {
  throw new Error(
    "Missing env variables, required: MAILING_LIST, EMAIL, PASSWORD, EMAIL_APP_PASS"
  );
}

const mailingList = MAILING_LIST.split(",");
let browser;

export const handler = async () => {
  const dynamoDbClient = new DynamoDBClient({});
  const startBrowserPromise = puppeteer
    .launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    })
    .then((b) => {
      browser = b;
      return browser.newPage();
    });

  console.time("login");
  const loginData = new URLSearchParams();
  loginData.append("ajax", "connexionUser");
  loginData.append("email", "etienner37@gmail.com");
  loginData.append("pass", "7c3bK!k6ca4qbYy");
  loginData.append("compte", "user");

  const loginResponse = await fetch(
    "https://toulousepadelclub.gestion-sports.com/traitement/connexion.php",
    {
      method: "POST",
      body: loginData,
    }
  );

  const responseCookies = loginResponse.headers.get("set-cookie");
  const phpSessid = responseCookies?.match(/PHPSESSID=(.*?);/)?.[1];
  const cookCompte = responseCookies?.match(/COOK_COMPTE=(.*?);/)?.[1];
  const cookCompteExpiration = responseCookies?.match(
    /COOK_COMPTE=.*?; expires=(.*?);/
  )?.[1];

  const cookies = {
    PHPSESSID: phpSessid ?? "",
    COOK_COMPTE: cookCompte ?? "",
    expiry: cookCompteExpiration ?? "",
  };
  console.timeEnd("login");

  let screenshot;
  /**
   * @type {import("puppeteer-core").Page}
   */
  try {
    console.time("fetch page");
    const [page, tournoiPage] = await Promise.all([
      startBrowserPromise,
      fetch(
        "https://toulousepadelclub.gestion-sports.com/membre/events/event.html?event=1174",
        {
          headers: {
            cookie: `PHPSESSID=${cookies.PHPSESSID}; COOK_COMPTE=${cookies.COOK_COMPTE}`,
          },
        }
      ).then((res) => res.text()),
    ]);
    await page.setContent(tournoiPage);
    console.timeEnd("fetch page");
    console.time("take screenshot");
    page.screenshot().then((buffer) => (screenshot = buffer));
    console.timeEnd("take screenshot");
    console.log("Go to tournoi page");

    // Tournoi
    await page.waitForSelector(".card-body");
    const tournoisDivs = await page.$$(".card-body");
    console.log("found tournois", tournoisDivs.length);

    console.time("check tournois");
    const [tournois, serializedLatestTournamentsId] = await Promise.all([
      Promise.all(
        tournoisDivs.map(async (tournoiDiv) => {
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
        })
      ),
      dynamoDbClient
        .send(
          new QueryCommand({
            TableName: "tournaments",
            KeyConditionExpression: "id = :id",
            ExpressionAttributeValues: {
              ":id": { S: "latest" },
            },
          })
        )
        .then(({ Items }) => Items?.[0]?.value?.S || "[]"),
    ]);
    console.timeEnd("check tournois");
    console.log("tournois", tournois);

    const serializedTournoisId = JSON.stringify(
      tournois.map((tournoi) => tournoi.id)
    );

    if (serializedLatestTournamentsId === serializedTournoisId) {
      console.log("No new tournaments from last time");
      return {
        statusCode: 200,
        body: JSON.stringify("No new changes in tournaments"),
      };
    }

    console.time("save latest tournaments");
    await dynamoDbClient.send(
      new PutItemCommand({
        TableName: "tournaments",
        Item: {
          id: { S: "latest" },
          value: { S: serializedTournoisId },
        },
      })
    );
    console.timeEnd("save latest tournaments");

    const latestTournaments = JSON.parse(serializedLatestTournamentsId);
    console.log("latestTournamentsArray", latestTournaments);

    const newTournaments = tournois
      .filter((tournoi) => !latestTournaments.includes(tournoi.id))
      .filter((tournoi) => !tournoi.data.toLowerCase().includes("complet"))
      .filter((tournoi) => !tournoi.data.toLowerCase().includes("femme"))
      .filter((tournoi) =>
        ["p25 ", "p100 ", "p250 "].some((level) =>
          tournoi.data.toLowerCase().includes(level)
        )
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

    console.time("send email");
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
    console.timeEnd("send email");
    console.log("Email sent:", sentMessageInfo);
  } catch (error) {
    if (screenshot) {
      const s3 = new S3Client({});
      const s3Params = {
        Bucket: "rutabagafea",
        Key: `padelito/screenshots/check-tournois-error-${new Date().toISOString()}.png`,
        Body: screenshot,
        ContentEncoding: "base64",
        ContentType: "image/png",
      };
      try {
        await s3.send(new PutObjectCommand(s3Params));
        console.log("Screenshot saved to S3");
      } catch (err) {
        console.log("Error", err);
      }
    }

    throw error;
  }
  await browser.close();
  console.log("Done checking new tournois with success");
  return {
    statusCode: 200,
    body: JSON.stringify("Done checking new tournois"),
  };
};
