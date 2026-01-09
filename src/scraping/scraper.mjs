import { login } from "./login.mjs";
import { parseTournament } from "./parser.mjs";
import { sendAdminNotification } from "../email/admin.mjs";

/**
 * Scrape tournaments for a given subdomain
 * @param {import("puppeteer-core").Browser} browser
 * @param {string} subdomain
 * @returns {Promise<import("./parser.mjs").Tournament[]>}
 */
export async function scrapeTournaments(browser, subdomain) {
  const page = await browser.newPage();

  try {
    const baseUrl = await login(page, subdomain);

    console.log(`[${subdomain}] Go to events page`);
    await page.goto(`${baseUrl}/appli/Évènements`);

    await page.waitForSelector(
      "app-evenements .w-100.contain app-input-search"
    );
    const tournamentsDivs = await page.$$(
      "app-evenements .w-100.contain app-input-search ~ div.mb-20"
    );

    if (tournamentsDivs.length === 0) {
      console.log(`[${subdomain}] No tournament divs found`);
      await sendAdminNotification(
        `[Check Tournaments] No tournaments found on ${subdomain}`,
        `<p>No tournament elements found on <strong>${subdomain}</strong>. The selector may have changed.</p>`
      );
    }

    const tournaments = await Promise.all(
      tournamentsDivs.map(async (tournamentDiv) => {
        try {
          const elementData = await tournamentDiv.evaluate((el) => {
            if (!el) return null;
            return {
              innerText: el.innerText || "",
              spots:
                el.querySelector("div.fd-column.ai-end > p")?.innerText || null,
              hasButton: el.querySelector("div.fl.jc-center .button") !== null,
            };
          });
          if (!elementData) return null;
          return parseTournament(elementData, subdomain);
        } catch (error) {
          console.error(`[${subdomain}] Error parsing tournament:`, error);
          return null;
        }
      })
    ).then((results) => results.filter(Boolean));

    console.log(`[${subdomain}] Found ${tournaments.length} tournaments`);
    return tournaments;
  } catch (error) {
    console.error(`[${subdomain}] Scraping failed:`, error);
    throw error;
  } finally {
    await page.close();
  }
}
