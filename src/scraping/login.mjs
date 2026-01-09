import { wait, getConfig } from "../config/index.mjs";
import { sendAdminNotification } from "../email/admin.mjs";

export async function login(page, subdomain) {
  const { email, password } = getConfig();
  const baseUrl = `https://${subdomain}.gestion-sports.com`;

  try {
    await page.goto(baseUrl);
    console.log(`[${subdomain}] Go to login page`);

    await page.type("input[type=text][name=email]", email);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await wait(2000);
    await page.keyboard.press("Tab");
    await page.keyboard.type(password);
    await page.$$eval("button", (buttons) => {
      buttons
        .filter((button) =>
          button.innerText.toLowerCase().includes("connecter")
        )[0]
        .click();
    });
    await page.waitForNavigation({
      waitUntil: "networkidle0",
      timeout: 20000,
    });
    console.log(`[${subdomain}] Login done`);
  } catch (error) {
    console.error(`[${subdomain}] Login failed:`, error);
    await sendAdminNotification(
      `[Check Tournaments] Login failed on ${subdomain}`,
      `<p>Login failed for <strong>${subdomain}</strong>.</p><p>Error: ${error.message}</p>`
    );
    throw new Error(`Login failed for ${subdomain}`);
  }

  await closeWelcomePopup(page, subdomain);

  return baseUrl;
}

async function closeWelcomePopup(page, subdomain) {
  try {
    console.log(`[${subdomain}] Close welcome popup`);
    const closePopupButton = await page.waitForSelector(
      "app-welcome-popup button",
      { timeout: 2000 }
    );
    if (closePopupButton) {
      await closePopupButton.click();
    }
  } catch (error) {
    console.log(
      `[${subdomain}] Welcome popup not found (this is okay, continuing...)`
    );
    await sendAdminNotification(
      `[Check Tournaments] No popup found on ${subdomain}`,
      `<p>The welcome popup was not found when scraping <strong>${subdomain}</strong>. This may indicate a site change or issue with the scraper.</p>`
    );
  }
}
