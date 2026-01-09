import { isLocal } from "../config/index.mjs";

let puppeteer, chromium;
let isProduction = false;

export async function initBrowser() {
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

export async function launchBrowser() {
  const { puppeteer, chromium } = await initBrowser();

  if (isLocal) {
    return puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  return puppeteer.launch({
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

export function getIsProduction() {
  return isProduction;
}
