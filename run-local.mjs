// Importing config first loads .env (config owns dotenv when RUN_MODE=local),
// so CHROME_PATH is available below.
import "./src/config/index.mjs";

process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true";
process.env.PUPPETEER_EXECUTABLE_PATH = process.env.CHROME_PATH;

import { handler } from "./src/handler.mjs";

handler()
  .then((result) => {
    console.log("Result:", result);
  })
  .catch((error) => {
    console.error("Error:", error);
  });
